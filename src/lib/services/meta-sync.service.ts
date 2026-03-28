/**
 * Sincronização completa Meta Ads → cache local Supabase.
 * Busca campanhas, anúncios, criativos, vídeos e imagens.
 * Chama sob demanda (botão "Sincronizar") ou automaticamente.
 */

import { createServerSupabaseClient } from '@/lib/supabase';

const META_BASE = 'https://graph.facebook.com/v23.0';

export interface SyncResult {
  campanhas: number;
  ads: number;
  criativos: number;
  durationMs: number;
  errors: string[];
}

async function metaGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Meta API HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function sincronizarTudoDoMeta(
  tenantId: string,
  accountId: string,
  token: string,
): Promise<SyncResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const supabase = createServerSupabaseClient();

  // ─── Garantir prefixo act_ ─────────────────────────────────────────────────
  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

  // ─── 1. Campanhas ──────────────────────────────────────────────────────────
  let campanhasCount = 0;
  try {
    const insightFields = 'spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,action_values';
    const campaignFields = [
      `insights{${insightFields},date_start,date_stop}`,
      'name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time',
    ].join(',');

    const data = await metaGet<{ data: unknown[] }>(
      `${META_BASE}/${actId}/campaigns?fields=${encodeURIComponent(campaignFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']))}` +
      `&limit=50&access_token=${token}`
    );

    const rows = (data.data || []).map((c: any) => {
      const insight = c.insights?.data?.[0];
      const spend = parseFloat(insight?.spend || '0');
      const revenue = parseFloat(insight?.action_values?.find((a: any) => a.action_type === 'purchase')?.value || '0');
      return {
        id: c.id,
        tenant_id: tenantId,
        nome: c.name,
        status: c.status,
        objetivo: c.objective,
        orcamento_diario: c.daily_budget ? parseInt(c.daily_budget) : null,
        data_inicio: c.start_time || null,
        data_fim: c.stop_time || null,
        metricas: insight ? {
          spend, revenue,
          impressions: parseInt(insight.impressions || '0'),
          clicks: parseInt(insight.clicks || '0'),
          cpc: parseFloat(insight.cpc || '0'),
          cpm: parseFloat(insight.cpm || '0'),
          ctr: parseFloat(insight.ctr || '0'),
          reach: parseInt(insight.reach || '0'),
          frequency: parseFloat(insight.frequency || '0'),
          roas: spend > 0 ? revenue / spend : 0,
        } : null,
        raw_data: c,
        sincronizado_em: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      await supabase.from('meta_campaigns_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    }
    campanhasCount = rows.length;
  } catch (err) {
    errors.push(`Campanhas: ${String(err)}`);
  }

  // ─── 2. Anúncios ───────────────────────────────────────────────────────────
  let adsCount = 0;
  try {
    const adFields = [
      'name,status,campaign_id,adset_id',
      'creative{id,name,title,body,call_to_action_type,image_url,video_id,thumbnail_url,object_story_spec}',
      'insights{spend,impressions,clicks,cpc,reach}',
    ].join(',');

    const data = await metaGet<{ data: unknown[] }>(
      `${META_BASE}/${actId}/ads?fields=${encodeURIComponent(adFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']))}` +
      `&limit=100&access_token=${token}`
    );

    const rows = (data.data || []).map((ad: any) => {
      const insight = ad.insights?.data?.[0];
      const creative = ad.creative || {};
      const linkData = creative.object_story_spec?.link_data || {};
      return {
        id: ad.id,
        tenant_id: tenantId,
        campaign_id: ad.campaign_id,
        adset_id: ad.adset_id,
        nome: ad.name,
        status: ad.status,
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
        sincronizado_em: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      await supabase.from('meta_ads_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    }
    adsCount = rows.length;
  } catch (err) {
    errors.push(`Anúncios: ${String(err)}`);
  }

  // ─── 3. Vídeos ────────────────────────────────────────────────────────────
  let criativosCount = 0;
  try {
    const data = await metaGet<{ data: unknown[] }>(
      `${META_BASE}/${actId}/advideos?fields=id,title,description,thumbnails,length,created_time` +
      `&limit=50&access_token=${token}`
    );

    const rows = (data.data || []).map((v: any) => ({
      id: v.id,
      tenant_id: tenantId,
      tipo: 'video',
      nome: v.title || v.description || `Vídeo ${v.id}`,
      url_thumb: v.thumbnails?.data?.[0]?.uri || '',
      url_full: '',
      duracao: Math.round(v.length || 0),
      sincronizado_em: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase.from('meta_creatives_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    }
    criativosCount += rows.length;
  } catch (err) {
    errors.push(`Vídeos: ${String(err)}`);
  }

  // ─── 4. Imagens ───────────────────────────────────────────────────────────
  try {
    const data = await metaGet<{ data: unknown[] }>(
      `${META_BASE}/${actId}/adimages?fields=hash,name,url,url_128,created_time` +
      `&limit=50&access_token=${token}`
    );

    const rows = (data.data || []).map((img: any) => ({
      id: img.hash,
      tenant_id: tenantId,
      tipo: 'imagem',
      nome: img.name || `Imagem ${img.hash?.substring(0, 8)}`,
      url_thumb: img.url_128 || img.url || '',
      url_full: img.url || '',
      sincronizado_em: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase.from('meta_creatives_cache').upsert(rows, { onConflict: 'id,tenant_id' });
    }
    criativosCount += rows.length;
  } catch (err) {
    errors.push(`Imagens: ${String(err)}`);
  }

  return {
    campanhas: campanhasCount,
    ads: adsCount,
    criativos: criativosCount,
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
