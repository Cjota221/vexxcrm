/**
 * Sincronização completa Meta Ads → cache local Supabase.
 * Busca campanhas, anúncios, criativos, vídeos e imagens.
 * Chama sob demanda (botão "Sincronizar") ou automaticamente.
 */

import { createServerSupabaseClient } from '@/lib/supabase';

import { META_BASE } from '@/lib/meta-config';

export interface SyncResult {
  campanhas: number;
  ads: number;
  criativos: number;
  durationMs: number;
  errors: string[];
}

/* ─── Tipos para dados brutos da Meta API ─────────────────────────────────── */

interface MetaActionValue { action_type: string; value: string }

interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  start_time?: string;
  stop_time?: string;
  insights?: {
    data: Array<{
      spend: string;
      impressions: string;
      clicks: string;
      cpc: string;
      cpm: string;
      ctr: string;
      reach: string;
      frequency: string;
      action_values?: MetaActionValue[];
    }>;
  };
}

interface MetaAdRaw {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    call_to_action_type?: string;
    image_url?: string;
    video_id?: string;
    thumbnail_url?: string;
    object_story_spec?: {
      link_data?: {
        name?: string;
        message?: string;
        picture?: string;
        call_to_action?: { type?: string };
      };
    };
  };
  insights?: {
    data: Array<{
      spend: string;
      impressions: string;
      clicks: string;
      cpc: string;
      reach: string;
    }>;
  };
}

interface MetaVideoRaw {
  id: string;
  title?: string;
  description?: string;
  length?: number;
  thumbnails?: { data: Array<{ uri: string }> };
}

interface MetaImageRaw {
  hash: string;
  name?: string;
  url?: string;
  url_128?: string;
}

interface MetaPage<T> {
  data: T[];
  paging?: { next?: string };
}

/* ─── Helper: leitura de X-App-Usage para back-off preventivo ────────────── */

function checkRateLimit(res: Response): void {
  try {
    const usage = res.headers.get('X-App-Usage') || res.headers.get('X-Ad-Account-Usage');
    if (!usage) return;
    const { call_count, total_cputime, total_time } = JSON.parse(usage) as {
      call_count?: number; total_cputime?: number; total_time?: number;
    };
    const max = Math.max(call_count || 0, total_cputime || 0, total_time || 0);
    if (max >= 90) {
      console.warn(`[meta-sync] Rate limit em ${max}% — pausa de 5s`);
    }
  } catch { /* ignorar se header não for JSON válido */ }
}

/* ─── Helper: fetch com paginação automática + back-off de rate limit ─────── */

async function metaGetAll<T>(firstUrl: string): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const res = await fetch(url);

    checkRateLimit(res);

    // 429 ou código 80004 → rate limit atingido: aguarda e tenta novamente
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 5000));
      continue; // mesma url
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
      // code 80004 = rate limit da conta de anúncios
      if (err.error?.code === 80004) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw new Error(err.error?.message || `Meta API HTTP ${res.status}`);
    }
    const page = await res.json() as MetaPage<T>;
    all.push(...(page.data || []));
    url = page.paging?.next || null;
  }
  return all;
}

export async function sincronizarTudoDoMeta(
  tenantId: string,
  accountId: string,
  token: string,
): Promise<SyncResult> {
  const t0 = Date.now();
  const supabase = createServerSupabaseClient();
  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const now = new Date().toISOString();

  // ── Funções de fetch por entidade ────────────────────────────────────────────

  async function syncCampanhas() {
    const insightFields = 'spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,action_values';
    const campaignFields = [
      `insights{${insightFields},date_start,date_stop}`,
      'name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time',
    ].join(',');

    const campanhas = await metaGetAll<MetaCampaignRaw>(
      `${META_BASE}/${actId}/campaigns?fields=${encodeURIComponent(campaignFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']))}` +
      `&limit=100&access_token=${token}`
    );

    const rows = campanhas.map((c) => {
      const insight = c.insights?.data?.[0];
      const spend = parseFloat(insight?.spend || '0');
      const revenue = parseFloat(
        insight?.action_values?.find((a) => a.action_type === 'purchase')?.value || '0'
      );
      return {
        id: c.id, tenant_id: tenantId, ad_account_id: actId, nome: c.name, status: c.status,
        objetivo: c.objective,
        orcamento_diario: c.daily_budget ? parseInt(c.daily_budget) : null,
        data_inicio: c.start_time || null, data_fim: c.stop_time || null,
        metricas: insight ? {
          spend, revenue,
          impressions: parseInt(insight.impressions || '0'),
          clicks: parseInt(insight.clicks || '0'),
          cpc: parseFloat(insight.cpc || '0'), cpm: parseFloat(insight.cpm || '0'),
          ctr: parseFloat(insight.ctr || '0'), reach: parseInt(insight.reach || '0'),
          frequency: parseFloat(insight.frequency || '0'),
          roas: spend > 0 ? revenue / spend : 0,
        } : null,
        raw_data: c, sincronizado_em: now,
      };
    });

    if (rows.length > 0)
      await supabase.from('meta_campaigns_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    return rows.length;
  }

  async function syncAds() {
    const adFields = [
      'name,status,campaign_id,adset_id',
      'creative{id,name,title,body,call_to_action_type,image_url,video_id,thumbnail_url,object_story_spec}',
      'insights{spend,impressions,clicks,cpc,reach}',
    ].join(',');

    const ads = await metaGetAll<MetaAdRaw>(
      `${META_BASE}/${actId}/ads?fields=${encodeURIComponent(adFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']))}` +
      `&limit=100&access_token=${token}`
    );

    const rows = ads.map((ad) => {
      const insight = ad.insights?.data?.[0];
      const creative = ad.creative || {};
      const linkData = creative.object_story_spec?.link_data || {};
      return {
        id: ad.id, tenant_id: tenantId, ad_account_id: actId,
        campaign_id: ad.campaign_id, adset_id: ad.adset_id,
        nome: ad.name, status: ad.status,
        criativo: {
          id: creative.id,
          titulo: creative.title || linkData.name || '',
          texto: creative.body || linkData.message || '',
          cta: creative.call_to_action_type || linkData.call_to_action?.type || '',
          image_url: creative.image_url || linkData.picture || '',
          video_id: creative.video_id || '',
          thumbnail_url: creative.thumbnail_url || '',
        },
        metricas: insight ? {
          spend: parseFloat(insight.spend || '0'),
          impressions: parseInt(insight.impressions || '0'),
          clicks: parseInt(insight.clicks || '0'),
          cpc: parseFloat(insight.cpc || '0'),
          reach: parseInt(insight.reach || '0'),
        } : null,
        sincronizado_em: now,
      };
    });

    if (rows.length > 0)
      await supabase.from('meta_ads_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    return rows.length;
  }

  async function syncVideos() {
    const videos = await metaGetAll<MetaVideoRaw>(
      `${META_BASE}/${actId}/advideos?fields=id,title,description,thumbnails,length,created_time` +
      `&limit=25&sort=created_time_descending&access_token=${token}`
    );
    const rows = videos.map((v) => ({
      id: v.id, tenant_id: tenantId, ad_account_id: actId, tipo: 'video',
      nome: v.title || v.description || `Vídeo ${v.id}`,
      url_thumb: v.thumbnails?.data?.[0]?.uri || '',
      url_full: '', duracao: Math.round(v.length || 0), sincronizado_em: now,
    }));
    if (rows.length > 0)
      await supabase.from('meta_creatives_cache').upsert(rows, { onConflict: 'id,tenant_id' });

    // Espelhar em ad_creatives para que o pipeline de transcrição os processe
    if (videos.length > 0) {
      const adCreativesRows = videos.map((v) => ({
        tenant_id:        tenantId,
        nome:             v.title || v.description || `Vídeo Meta ${v.id}`,
        tipo:             'video',
        meta_video_id:    v.id,
        url_preview:      v.thumbnails?.data?.[0]?.uri ?? null,
        duracao_segundos: Math.round(v.length || 0),
        status:           'pronto',
      }));
      await supabase
        .from('ad_creatives')
        .upsert(adCreativesRows, { onConflict: 'tenant_id,meta_video_id' });
    }

    return rows.length;
  }

  async function syncImagens() {
    const images = await metaGetAll<MetaImageRaw>(
      `${META_BASE}/${actId}/adimages?fields=hash,name,url,url_128,created_time` +
      `&limit=25&access_token=${token}`
    );
    const rows = images.map((img) => ({
      id: img.hash, tenant_id: tenantId, ad_account_id: actId, tipo: 'imagem',
      nome: img.name || `Imagem ${img.hash?.substring(0, 8)}`,
      url_thumb: img.url || img.url_128 || '',
      url_full: img.url || '', sincronizado_em: now,
    }));
    if (rows.length > 0)
      await supabase.from('meta_creatives_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    return rows.length;
  }

  // ── Executar os 4 endpoints em paralelo ──────────────────────────────────────
  const [rCampanhas, rAds, rVideos, rImagens] = await Promise.allSettled([
    syncCampanhas(),
    syncAds(),
    syncVideos(),
    syncImagens(),
  ]);

  const errors: string[] = [];
  if (rCampanhas.status === 'rejected') errors.push(`Campanhas: ${String(rCampanhas.reason)}`);
  if (rAds.status      === 'rejected') errors.push(`Anúncios: ${String(rAds.reason)}`);
  if (rVideos.status   === 'rejected') errors.push(`Vídeos: ${String(rVideos.reason)}`);
  if (rImagens.status  === 'rejected') errors.push(`Imagens: ${String(rImagens.reason)}`);

  return {
    campanhas: rCampanhas.status === 'fulfilled' ? rCampanhas.value : 0,
    ads:       rAds.status       === 'fulfilled' ? rAds.value       : 0,
    criativos: (rVideos.status   === 'fulfilled' ? rVideos.value    : 0) +
               (rImagens.status  === 'fulfilled' ? rImagens.value   : 0),
    durationMs: Date.now() - t0,
    errors,
  };
}

export async function getCachedCriativos(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('meta_creatives_cache')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sincronizado_em', { ascending: false })
    .limit(100);
  return data || [];
}

export async function getCachedAds(tenantId: string, campaignId?: string) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('meta_ads_cache')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sincronizado_em', { ascending: false });
  if (campaignId) query = query.eq('campaign_id', campaignId);
  const { data } = await query.limit(100);
  return data || [];
}
