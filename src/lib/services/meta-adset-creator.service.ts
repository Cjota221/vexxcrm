/**
 * Serviço de criação de campanhas, adsets e ads via Meta Marketing API.
 * Usado pelo CriadorCampanha para publicar rascunhos diretamente no Meta.
 */

import { META_BASE } from '@/lib/meta-config';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from './meta-token.service';

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */

export interface InteresseTargeting {
  id: string;
  name: string;
}

export interface ConfiguracaoAdset {
  nome: string;
  objetivo: 'LEAD_GENERATION' | 'MESSAGES' | 'LINK_CLICKS' | 'CONVERSIONS' | 'BRAND_AWARENESS';
  /** Orçamento diário em centavos */
  orcamentoDiario: number;
  dataInicio?: string;   // YYYY-MM-DD
  dataFim?: string;      // YYYY-MM-DD
  paises: string[];
  idadeMin: number;
  idadeMax: number;
  genero: 'all' | 'male' | 'female';
  interesses: InteresseTargeting[];
  publico_meta_id?: string;
}

export interface ConfiguracaoCriativo {
  tipo: 'video' | 'imagem';
  metaVideoId?: string;
  metaImageHash?: string;
  headline: string;
  texto: string;
  cta: string;
  urlDestino?: string;
  pageId: string;
  whatsappNumber?: string;
}

export interface ResultadoPublicacao {
  campaignId: string;
  adsetId: string;
  adId: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function objetivoParaMetaApi(objetivo: string): string {
  const map: Record<string, string> = {
    LEAD_GENERATION: 'LEAD_GENERATION',
    MESSAGES:        'MESSAGES',
    LINK_CLICKS:     'LINK_CLICKS',
    CONVERSIONS:     'CONVERSIONS',
    BRAND_AWARENESS: 'BRAND_AWARENESS',
  };
  return map[objetivo] ?? 'LINK_CLICKS';
}

function objetivoParaOptimization(objetivo: string): string {
  const map: Record<string, string> = {
    LEAD_GENERATION: 'LEAD_GENERATION',
    MESSAGES:        'CONVERSATIONS',
    LINK_CLICKS:     'LINK_CLICKS',
    CONVERSIONS:     'OFFSITE_CONVERSIONS',
    BRAND_AWARENESS: 'REACH',
  };
  return map[objetivo] ?? 'LINK_CLICKS';
}

function objetivoParaBillingEvent(objetivo: string): string {
  if (objetivo === 'BRAND_AWARENESS') return 'IMPRESSIONS';
  return 'IMPRESSIONS';
}

async function metaPost(
  url: string,
  body: Record<string, unknown>,
  token: string,
): Promise<{ id?: string; error?: { message: string; code: number } }> {
  const form = new URLSearchParams();
  form.append('access_token', token);
  for (const [k, v] of Object.entries(body)) {
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }

  const res = await fetch(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  return res.json() as Promise<{ id?: string; error?: { message: string; code: number } }>;
}

/* ─── Criar Campanha ─────────────────────────────────────────────────────────── */

async function criarCampanha(
  token: string,
  actId: string,
  nome: string,
  objetivo: string,
): Promise<string> {
  const data = await metaPost(`${META_BASE}/${actId}/campaigns`, {
    name:              nome,
    objective:         objetivoParaMetaApi(objetivo),
    status:            'PAUSED',
    special_ad_categories: '[]',
    is_adset_budget_sharing_enabled: false,
  }, token);

  if (!data.id) throw new Error(`Erro ao criar campanha: ${data.error?.message ?? 'sem ID retornado'}`);
  return data.id;
}

/* ─── Criar Adset ────────────────────────────────────────────────────────────── */

async function criarAdset(
  token: string,
  actId: string,
  campaignId: string,
  cfg: ConfiguracaoAdset,
): Promise<string> {
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: cfg.paises },
    age_min: cfg.idadeMin,
    age_max: cfg.idadeMax,
  };

  if (cfg.genero === 'male')   targeting.genders = [1];
  if (cfg.genero === 'female') targeting.genders = [2];

  if (cfg.interesses.length > 0) {
    targeting.flexible_spec = [{ interests: cfg.interesses.map(i => ({ id: i.id, name: i.name })) }];
  }

  if (cfg.publico_meta_id) {
    targeting.custom_audiences = [{ id: cfg.publico_meta_id }];
  }

  const body: Record<string, unknown> = {
    name:             `${cfg.nome} — Adset`,
    campaign_id:      campaignId,
    daily_budget:     cfg.orcamentoDiario,
    billing_event:    objetivoParaBillingEvent(cfg.objetivo),
    optimization_goal: objetivoParaOptimization(cfg.objetivo),
    bid_strategy:     'LOWEST_COST_WITHOUT_CAP',
    targeting,
    status:           'PAUSED',
  };

  if (cfg.dataInicio) {
    body.start_time = new Date(cfg.dataInicio + 'T00:00:00-03:00').toISOString();
  }
  if (cfg.dataFim) {
    body.end_time = new Date(cfg.dataFim + 'T23:59:59-03:00').toISOString();
  }

  const data = await metaPost(`${META_BASE}/${actId}/adsets`, body, token);
  if (!data.id) throw new Error(`Erro ao criar adset: ${data.error?.message ?? 'sem ID retornado'}`);
  return data.id;
}

/* ─── Criar Ad Creative ──────────────────────────────────────────────────────── */

async function criarAdCreative(
  token: string,
  actId: string,
  cfg: ConfiguracaoCriativo,
): Promise<string> {
  let object_story_spec: Record<string, unknown>;

  const callToAction: Record<string, unknown> = {
    type: cfg.cta,
  };

  if (cfg.cta === 'WHATSAPP_MESSAGE' && cfg.whatsappNumber) {
    callToAction.value = { whatsapp_number: cfg.whatsappNumber };
  } else if (cfg.urlDestino) {
    callToAction.value = { link: cfg.urlDestino };
  }

  if (cfg.tipo === 'video' && cfg.metaVideoId) {
    object_story_spec = {
      page_id: cfg.pageId,
      video_data: {
        video_id:    cfg.metaVideoId,
        title:       cfg.headline,
        message:     cfg.texto,
        call_to_action: callToAction,
      },
    };
  } else if (cfg.tipo === 'imagem' && cfg.metaImageHash) {
    object_story_spec = {
      page_id: cfg.pageId,
      link_data: {
        image_hash:  cfg.metaImageHash,
        name:        cfg.headline,
        message:     cfg.texto,
        call_to_action: callToAction,
        link:        cfg.urlDestino ?? `https://www.facebook.com/${cfg.pageId}`,
      },
    };
  } else {
    throw new Error('Criativo inválido: precisa de metaVideoId ou metaImageHash');
  }

  const data = await metaPost(`${META_BASE}/${actId}/adcreatives`, {
    name:               cfg.headline.slice(0, 255),
    object_story_spec,
  }, token);

  if (!data.id) throw new Error(`Erro ao criar criativo: ${data.error?.message ?? 'sem ID retornado'}`);
  return data.id;
}

/* ─── Criar Ad ───────────────────────────────────────────────────────────────── */

async function criarAd(
  token: string,
  actId: string,
  adsetId: string,
  creativeId: string,
  nome: string,
): Promise<string> {
  const data = await metaPost(`${META_BASE}/${actId}/ads`, {
    name:     nome,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status:   'PAUSED',
  }, token);

  if (!data.id) throw new Error(`Erro ao criar ad: ${data.error?.message ?? 'sem ID retornado'}`);
  return data.id;
}

/* ─── publicarRascunho ───────────────────────────────────────────────────────── */

export async function publicarRascunho(
  tenantId: string,
  draftId: string,
  pageId: string,
  whatsappNumber?: string,
): Promise<ResultadoPublicacao> {
  const supabase = createServerSupabaseClient();

  // Buscar rascunho
  const { data: draft, error: draftErr } = await supabase
    .from('meta_campaign_drafts')
    .select(`
      *,
      ad_creatives (
        tipo, meta_video_id, meta_image_hash
      )
    `)
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .single();

  if (draftErr || !draft) throw new Error('Rascunho não encontrado');
  if (draft.status === 'publicado') throw new Error('Campanha já publicada');

  // Marcar como publicando
  await supabase
    .from('meta_campaign_drafts')
    .update({ status: 'publicando' })
    .eq('id', draftId);

  // Buscar credenciais Meta
  const config = await resolverTokenMeta(tenantId);
  const token = config.token;
  if (!config.account_id) throw new Error('Ad Account ID não configurado');
  const actId = config.account_id.startsWith('act_')
    ? config.account_id
    : `act_${config.account_id}`;

  try {
    // 1. Criar campanha
    const campaignId = await criarCampanha(token, actId, draft.nome, draft.objetivo);

    // 2. Criar adset
    const interesses: InteresseTargeting[] = Array.isArray(draft.interesses) ? draft.interesses : [];
    const adsetId = await criarAdset(token, actId, campaignId, {
      nome:           draft.nome,
      objetivo:       draft.objetivo,
      orcamentoDiario: draft.orcamento_diario,
      dataInicio:     draft.data_inicio ?? undefined,
      dataFim:        draft.data_fim ?? undefined,
      paises:         draft.paises ?? ['BR'],
      idadeMin:       draft.idade_min ?? 18,
      idadeMax:       draft.idade_max ?? 65,
      genero:         draft.genero ?? 'all',
      interesses,
      publico_meta_id: draft.publico_id ?? undefined,
    });

    // 3. Criar ad creative
    const criativo = draft.ad_creatives as { tipo: string; meta_video_id: string | null; meta_image_hash: string | null } | null;
    if (!criativo) throw new Error('Criativo não encontrado. Selecione um criativo antes de publicar.');

    const cfgCriativo: ConfiguracaoCriativo = {
      tipo:          criativo.tipo as 'video' | 'imagem',
      metaVideoId:   criativo.meta_video_id ?? undefined,
      metaImageHash: criativo.meta_image_hash ?? undefined,
      headline:      draft.copy_headline ?? draft.nome,
      texto:         draft.copy_texto ?? '',
      cta:           draft.copy_cta ?? 'LEARN_MORE',
      urlDestino:    draft.url_destino ?? undefined,
      pageId,
      whatsappNumber,
    };
    const creativeId = await criarAdCreative(token, actId, cfgCriativo);

    // 4. Criar ad
    const adId = await criarAd(token, actId, adsetId, creativeId, draft.nome);

    // 5. Salvar resultado
    await supabase
      .from('meta_campaign_drafts')
      .update({
        status:           'publicado',
        meta_campaign_id: campaignId,
        meta_adset_id:    adsetId,
        meta_ad_id:       adId,
        erro:             null,
      })
      .eq('id', draftId);

    return { campaignId, adsetId, adId };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('meta_campaign_drafts')
      .update({ status: 'erro', erro: msg })
      .eq('id', draftId);
    throw err;
  }
}
