/**
 * Serviço de criação de campanhas, adsets e ads via Meta Marketing API.
 * Usado pelo CriadorCampanha para publicar rascunhos diretamente no Meta.
 */

import { META_BASE } from '@/lib/meta-config';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from './meta-token.service';
import {
  buscarInteressesAtacado,
  criarPublicoEngajamentoReal,
  criarPublicoVisitantesSite,
  targetingFrio,
  targetingQuente,
  targetingWhatsApp,
} from './meta-publicos-cj.service';

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
  /** Quando fornecido, substitui todo o targeting construído a partir dos campos individuais */
  targetingCompleto?: Record<string, unknown>;
}

export interface ConfiguracaoCriativo {
  tipo: 'video' | 'imagem';
  metaVideoId?: string;
  metaImageHash?: string;
  /** Thumbnail do vídeo — obrigatório pela Meta API quando tipo='video' */
  imageUrl?: string;
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

const CONFIG_POR_TIPO = {
  frio: {
    objetivo:          'OUTCOME_AWARENESS',
    optimization_goal: 'REACH',
    billing_event:     'IMPRESSIONS',
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
  quente: {
    objetivo:          'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event:     'IMPRESSIONS',
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
  whatsapp: {
    objetivo:          'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event:     'IMPRESSIONS',
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
  catalogo: {
    objetivo:          'OUTCOME_SALES',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event:     'IMPRESSIONS',
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
} as const;

export type TipoCampanha = keyof typeof CONFIG_POR_TIPO;

/** Mapeia o objetivo do wizard para o tipo simplificado */
function objetivoParaTipo(objetivo: string): TipoCampanha {
  if (objetivo === 'MESSAGES')         return 'whatsapp';
  if (objetivo === 'BRAND_AWARENESS')  return 'frio';
  return 'quente'; // LINK_CLICKS, CONVERSIONS, LEAD_GENERATION
}

// Meta Graph API aceita JSON com access_token no query string.
// URLSearchParams converte booleans para string "false" que pode ser
// interpretada como truthy → ativa CBO → exige bid_amount.
async function metaPost(
  url: string,
  body: Record<string, unknown>,
  token: string,
): Promise<{ id?: string; error?: { message: string; code: number } }> {
  const urlObj = new URL(url);
  urlObj.searchParams.set('access_token', token);

  const res = await fetch(urlObj.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
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
  const tipo = objetivoParaTipo(objetivo);
  const data = await metaPost(`${META_BASE}/${actId}/campaigns`, {
    name:              nome,
    objective:         CONFIG_POR_TIPO[tipo].objetivo,
    status:            'PAUSED',
    special_ad_categories: [],
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

  const tipo = objetivoParaTipo(cfg.objetivo);
  const tipoCfg = CONFIG_POR_TIPO[tipo];

  // Payload mínimo garantido pela Meta API v21.0.
  // Campos extras (placements, interests, gender) adicionados após confirmação que funciona.
  const adsetPayload: Record<string, unknown> = {
    name:              `[VEXX] ${cfg.nome} — Adset`,
    campaign_id:       campaignId,
    daily_budget:      String(cfg.orcamentoDiario),
    optimization_goal: tipoCfg.optimization_goal,
    billing_event:     tipoCfg.billing_event,
    bid_strategy:      'LOWEST_COST_WITHOUT_CAP',  // sobrescreve padrão da conta (BID_CAP/ROAS)
    targeting: {
      ...(cfg.targetingCompleto ?? {
        age_min:       cfg.idadeMin,
        age_max:       cfg.idadeMax,
        geo_locations: { countries: cfg.paises },
      }),
      targeting_automation: { advantage_audience: 0 },
    },
    status: 'PAUSED',
  };

  if (cfg.dataInicio) {
    adsetPayload.start_time = new Date(cfg.dataInicio + 'T00:00:00-03:00').toISOString();
  }
  if (cfg.dataFim) {
    adsetPayload.end_time = new Date(cfg.dataFim + 'T23:59:59-03:00').toISOString();
  }

  console.log('[META ADSET PAYLOAD]', JSON.stringify(adsetPayload, null, 2));

  const data = await metaPost(`${META_BASE}/${actId}/adsets`, adsetPayload, token);
  console.log('[META ADSET RESPONSE]', JSON.stringify(data, null, 2));
  if (!data.id) throw new Error(`Erro ao criar adset: ${data.error?.message ?? 'sem ID retornado'}`);
  return data.id;
}

/* ─── Criar Ad Creative ──────────────────────────────────────────────────────── */

export async function criarAdCreative(
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
  } else {
    // LEARN_MORE e outros CTAs exigem link — usa urlDestino ou fallback para a página do Facebook
    callToAction.value = { link: cfg.urlDestino ?? `https://www.facebook.com/${cfg.pageId}` };
  }

  if (cfg.tipo === 'video' && cfg.metaVideoId) {
    // Verificar status e buscar thumbnail do vídeo no Meta
    const videoStatusRes = await fetch(
      `${META_BASE}/${cfg.metaVideoId}?fields=status,picture&access_token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const videoStatus = await videoStatusRes.json() as {
      status?: { processing_progress?: number; video_status?: string };
      picture?: string;
      error?: { message: string };
    };
    console.log('[VIDEO STATUS]', JSON.stringify(videoStatus));

    if (videoStatus.error) {
      throw new Error(`Erro ao verificar status do vídeo: ${videoStatus.error.message}`);
    }
    if (videoStatus.status?.video_status && videoStatus.status.video_status !== 'ready') {
      throw new Error(
        `Vídeo ainda não está pronto para uso (status: ${videoStatus.status.video_status}, progresso: ${videoStatus.status.processing_progress ?? '?'}%). Aguarde o processamento concluir e tente novamente.`,
      );
    }

    // image_url obrigatório: prioriza thumbnail do Meta, depois url_preview do banco
    const imageUrl = videoStatus.picture ?? cfg.imageUrl;
    if (!imageUrl) {
      throw new Error('Thumbnail do vídeo não disponível. O Meta ainda pode estar processando o vídeo.');
    }

    const mensagem = cfg.texto?.trim() || 'Conheça nossos produtos. Qualidade garantida.';
    object_story_spec = {
      page_id: cfg.pageId,
      video_data: {
        video_id:       cfg.metaVideoId,
        image_url:      imageUrl,
        message:        mensagem,
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

  const creativePayload = {
    name:               cfg.headline.slice(0, 255),
    object_story_spec,
  };
  console.log('[META CREATIVE PAYLOAD]', JSON.stringify(creativePayload, null, 2));

  const urlObj = new URL(`${META_BASE}/${actId}/adcreatives`);
  urlObj.searchParams.set('access_token', token);
  const creativeRes = await fetch(urlObj.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creativePayload),
    signal: AbortSignal.timeout(10_000),
  });
  const creativeData = await creativeRes.json() as { id?: string; error?: { message: string; error_subcode?: number; fbtrace_id?: string } };
  console.log('[META CREATIVE RESPONSE]', JSON.stringify(creativeData));

  if (!creativeRes.ok || !creativeData.id) {
    throw new Error(`Erro ao criar criativo: ${creativeData.error?.message ?? 'sem ID retornado'}`);
  }
  return creativeData.id;
}

/* ─── Criar Ad ───────────────────────────────────────────────────────────────── */

export async function criarAd(
  token: string,
  actId: string,
  adsetId: string,
  creativeId: string,
  nome: string,
): Promise<string> {
  const adPayload = {
    name:     nome,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status:   'PAUSED',
  };
  console.log('[META AD PAYLOAD]', JSON.stringify(adPayload, null, 2));

  const urlObj = new URL(`${META_BASE}/${actId}/ads`);
  urlObj.searchParams.set('access_token', token);
  const adRes = await fetch(urlObj.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adPayload),
    signal: AbortSignal.timeout(10_000),
  });
  const adData = await adRes.json() as { id?: string; error?: { message: string; error_subcode?: number; fbtrace_id?: string } };
  console.log('[META AD RESPONSE]', JSON.stringify(adData));

  if (!adRes.ok || !adData.id) throw new Error(`Erro ao criar ad: ${adData.error?.message ?? 'sem ID retornado'}`);
  return adData.id;
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
        tipo, meta_video_id, meta_image_hash, url_preview
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
    const criativo = draft.ad_creatives as { tipo: string; meta_video_id: string | null; meta_image_hash: string | null; url_preview: string | null } | null;
    if (!criativo) throw new Error('Criativo não encontrado. Selecione um criativo antes de publicar.');

    const cfgCriativo: ConfiguracaoCriativo = {
      tipo:          criativo.tipo as 'video' | 'imagem',
      metaVideoId:   criativo.meta_video_id ?? undefined,
      metaImageHash: criativo.meta_image_hash ?? undefined,
      imageUrl:      criativo.url_preview ?? undefined,
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

/* ─── distribuirOrcamento ────────────────────────────────────────────────────── */

export interface OrcamentoDistribuido {
  tipo: TipoCampanha;
  label: string;
  orcamentoCentavos: number;
}

const TIPO_LABEL: Record<TipoCampanha, string> = {
  frio:      'Público Frio',
  quente:    'Público Quente',
  whatsapp:  'WhatsApp',
  catalogo:  'Catálogo',
};

/**
 * Divide orçamento total igualmente entre os tipos de campanha informados.
 * Arredonda para baixo e garante mínimo de R$1/dia (100 centavos) por tipo.
 */
export function distribuirOrcamento(
  totalReais: number,
  tipos: TipoCampanha[],
): OrcamentoDistribuido[] {
  if (tipos.length === 0) return [];
  const porTipo = Math.max(100, Math.floor((totalReais * 100) / tipos.length));
  return tipos.map(tipo => ({
    tipo,
    label: TIPO_LABEL[tipo],
    orcamentoCentavos: porTipo,
  }));
}

/* ─── criarCampanhaCompleta ──────────────────────────────────────────────────── */

export interface ConfigCampanhaCompleta {
  nome: string;
  tipo: TipoCampanha;
  /** Orçamento diário em centavos */
  orcamentoDiario: number;
  dataInicio?: string;
  dataFim?: string;
  paises?: string[];
  idadeMin?: number;
  idadeMax?: number;
  genero?: 'all' | 'male' | 'female';
  interesses?: InteresseTargeting[];
  criativo: ConfiguracaoCriativo;
  /** ID de público salvo no Meta — ignora targeting automático quando fornecido */
  publico_meta_id?: string;
}

const TIPO_OBJETIVO: Record<TipoCampanha, ConfiguracaoAdset['objetivo']> = {
  frio:     'BRAND_AWARENESS',
  quente:   'LINK_CLICKS',
  whatsapp: 'LINK_CLICKS',
  catalogo: 'CONVERSIONS',
};

/**
 * Cria campanha + adset + criativo + ad em uma única chamada.
 * Usa as credenciais Meta do tenant informado.
 */
export async function criarCampanhaCompleta(
  tenantId: string,
  cfg: ConfigCampanhaCompleta,
): Promise<ResultadoPublicacao> {
  const config = await resolverTokenMeta(tenantId);
  const token = config.token;
  if (!config.account_id) throw new Error('Ad Account ID não configurado');
  const actId = config.account_id.startsWith('act_')
    ? config.account_id
    : `act_${config.account_id}`;

  const objetivo = TIPO_OBJETIVO[cfg.tipo];

  // Montar targeting de alta performance para cada tipo de campanha
  let targetingCompleto: Record<string, unknown>;
  if (cfg.publico_meta_id) {
    // Público IA selecionado manualmente — usa direto, sem criar targeting automático
    targetingCompleto = {
      age_min: cfg.idadeMin ?? 18,
      age_max: cfg.idadeMax ?? 65,
      geo_locations: { countries: cfg.paises ?? ['BR'] },
      custom_audiences: [{ id: cfg.publico_meta_id }],
    };
  } else if (cfg.tipo === 'frio') {
    const interesses = await buscarInteressesAtacado(token);
    targetingCompleto = targetingFrio(interesses);
  } else if (cfg.tipo === 'quente') {
    let audienceId: string | null = null;
    let visitantesId: string | null = null;
    try {
      [audienceId, visitantesId] = await Promise.all([
        criarPublicoEngajamentoReal(actId, token, tenantId, 30),
        criarPublicoVisitantesSite(actId, token, tenantId, 30),
      ]);
    } catch (err) {
      console.warn('[criarCampanhaCompleta] Públicos quente falharam, usando targeting amplo:', err);
    }
    const customAudiences = [audienceId, visitantesId]
      .filter((id): id is string => Boolean(id))
      .map(id => ({ id }));
    if (customAudiences.length === 0) {
      const interesses = await buscarInteressesAtacado(token);
      targetingCompleto = targetingFrio(interesses);
    } else {
      targetingCompleto = {
        ...targetingQuente(audienceId ?? visitantesId),
        custom_audiences: customAudiences,
      };
    }
  } else {
    const interesses = await buscarInteressesAtacado(token);
    targetingCompleto = targetingWhatsApp(interesses);
  }

  const campaignId = await criarCampanha(token, actId, cfg.nome, objetivo);
  const adsetId = await criarAdset(token, actId, campaignId, {
    nome:            cfg.nome,
    objetivo,
    orcamentoDiario: cfg.orcamentoDiario,
    dataInicio:      cfg.dataInicio,
    dataFim:         cfg.dataFim,
    paises:          cfg.paises ?? ['BR'],
    idadeMin:        cfg.idadeMin ?? 18,
    idadeMax:        cfg.idadeMax ?? 65,
    genero:          cfg.genero ?? 'all',
    interesses:      cfg.interesses ?? [],
    targetingCompleto,
  });
  const creativeId = await criarAdCreative(token, actId, cfg.criativo);
  const adId = await criarAd(token, actId, adsetId, creativeId, cfg.nome);

  return { campaignId, adsetId, adId };
}

/* ─── criarCampanhaMultiplosConjuntos ────────────────────────────────────────── */

export interface ConfigConjunto {
  tipo: TipoCampanha;
  orcamentoDiario: number; // centavos
  criativos: Array<{
    id: string;
    meta_video_id?: string;
    meta_image_hash?: string;
    url_preview?: string;
    tipo: 'video' | 'imagem';
  }>;
}

export interface ConfigCampanhaAvancada {
  nome: string;
  conjuntos: ConfigConjunto[];
  paises?: string[];
  idadeMin?: number;
  idadeMax?: number;
  pageId: string;
  whatsappNumber?: string;
  urlDestino?: string;
}

/**
 * Cria 1 campanha → N adsets (por tipo de público) → N ads por adset.
 */
export async function criarCampanhaMultiplosConjuntos(
  tenantId: string,
  cfg: ConfigCampanhaAvancada,
): Promise<{
  campaignId: string;
  conjuntos: Array<{
    tipo: TipoCampanha;
    adsetId: string;
    ads: Array<{ adId: string; criativoNome: string }>;
    erros: string[];
  }>;
}> {
  const config = await resolverTokenMeta(tenantId);
  const token = config.token;
  if (!config.account_id) throw new Error('Ad Account ID não configurado');
  const actId = config.account_id.startsWith('act_')
    ? config.account_id
    : `act_${config.account_id}`;

  // 1. Determinar objetivo da campanha
  const objetivo = cfg.conjuntos.some(c => c.tipo === 'whatsapp')
    ? 'OUTCOME_TRAFFIC'
    : cfg.conjuntos[0].tipo === 'frio'
      ? 'OUTCOME_AWARENESS'
      : 'OUTCOME_TRAFFIC';

  const campanha = await metaPost(`${META_BASE}/${actId}/campaigns`, {
    name: cfg.nome,
    objective: objetivo,
    status: 'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  }, token);
  if (!campanha.id) throw new Error(`Erro campanha: ${campanha.error?.message}`);

  const resultadoConjuntos: Array<{
    tipo: TipoCampanha;
    adsetId: string;
    ads: Array<{ adId: string; criativoNome: string }>;
  }> = [];

  // 2. Para cada conjunto, criar adset + N ads
  for (const conjunto of cfg.conjuntos) {
    // Buscar targeting para o tipo
    let targetingCompleto: Record<string, unknown>;
    if (conjunto.tipo === 'frio') {
      const interesses = await buscarInteressesAtacado(token);
      targetingCompleto = targetingFrio(interesses);
    } else if (conjunto.tipo === 'quente') {
      let audienceId: string | null = null;
      try {
        audienceId = await criarPublicoEngajamentoReal(actId, token, tenantId, 30);
      } catch (err) {
        console.warn('[criarCampanhaMultiplosConjuntos] Público quente falhou:', err);
      }
      if (audienceId) {
        targetingCompleto = targetingQuente(audienceId);
      } else {
        const interesses = await buscarInteressesAtacado(token);
        targetingCompleto = targetingFrio(interesses);
      }
    } else {
      const interesses = await buscarInteressesAtacado(token);
      targetingCompleto = targetingWhatsApp(interesses);
    }

    const tipoLabel = conjunto.tipo === 'frio'
      ? 'Público Frio' : conjunto.tipo === 'quente'
        ? 'Público Quente' : 'WhatsApp';

    // Criar adset
    const adset = await metaPost(`${META_BASE}/${actId}/adsets`, {
      name: `${cfg.nome} — ${tipoLabel}`,
      campaign_id: campanha.id,
      daily_budget: String(conjunto.orcamentoDiario),
      optimization_goal: conjunto.tipo === 'frio' ? 'REACH' : 'LINK_CLICKS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        ...targetingCompleto,
        targeting_automation: { advantage_audience: 0 },
      },
      status: 'PAUSED',
    }, token);
    if (!adset.id) throw new Error(`Erro adset ${tipoLabel}: ${adset.error?.message}`);

    // Criar ads em paralelo (lotes de 3) para caber no timeout do Netlify
    const errosCriativos: string[] = [];
    const adResults = await Promise.all(
      conjunto.criativos.map(async (criativo, idx) => {
        try {
          const cfgCriativo: ConfiguracaoCriativo = {
            tipo: criativo.tipo,
            metaVideoId: criativo.meta_video_id,
            metaImageHash: criativo.meta_image_hash,
            imageUrl: criativo.url_preview,
            headline: `${cfg.nome} — ${tipoLabel}`,
            texto: 'Conheça nossas rasteirinhas. Qualidade garantida.',
            cta: conjunto.tipo === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
            pageId: cfg.pageId,
            whatsappNumber: conjunto.tipo === 'whatsapp' ? cfg.whatsappNumber : undefined,
            urlDestino: conjunto.tipo !== 'whatsapp' ? cfg.urlDestino : undefined,
          };
          const creativeId = await criarAdCreative(token, actId, cfgCriativo);
          const adName = `${cfg.nome} — ${tipoLabel} — Criativo ${idx + 1}`;
          const adId = await criarAd(token, actId, adset.id, creativeId, adName);
          return { adId, criativoNome: `Criativo ${idx + 1}` };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errosCriativos.push(`Criativo ${idx + 1}: ${msg}`);
          console.error(`[AGENTE] Erro criativo ${criativo.id}:`, msg);
          return null;
        }
      }),
    );
    const ads = adResults.filter((a): a is { adId: string; criativoNome: string } => a !== null);
    if (ads.length === 0 && errosCriativos.length > 0) {
      throw new Error(`Nenhum criativo criado para ${tipoLabel}. Erros: ${errosCriativos.join(' | ')}`);
    }

    resultadoConjuntos.push({
      tipo: conjunto.tipo,
      adsetId: adset.id,
      ads,
      erros: errosCriativos,
    });
  }

  return { campaignId: campanha.id, conjuntos: resultadoConjuntos };
}

/* ─── criarCampanhaCatalogo ──────────────────────────────────────────────────── */

export interface ConfigCampanhaCatalogo {
  nome: string;
  catalogoId: string;
  /** Orçamento diário em centavos */
  orcamentoDiario: number;
  pageId: string;
  paises?: string[];
  idadeMin?: number;
  idadeMax?: number;
}

/**
 * Cria campanha de catálogo (Dynamic Product Ads) no Meta.
 * Busca automaticamente o primeiro product set do catálogo informado.
 */
export async function criarCampanhaCatalogo(
  tenantId: string,
  cfg: ConfigCampanhaCatalogo,
): Promise<ResultadoPublicacao> {
  const config = await resolverTokenMeta(tenantId);
  const token = config.token;
  if (!config.account_id) throw new Error('Ad Account ID não configurado');
  const actId = config.account_id.startsWith('act_')
    ? config.account_id
    : `act_${config.account_id}`;

  // 1. Criar campanha OUTCOME_SALES
  const campaignData = await metaPost(`${META_BASE}/${actId}/campaigns`, {
    name:              cfg.nome,
    objective:         'OUTCOME_SALES',
    status:            'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  }, token);
  if (!campaignData.id) {
    throw new Error(`Erro ao criar campanha catálogo: ${campaignData.error?.message ?? 'sem ID'}`);
  }
  const campaignId = campaignData.id;

  // 2. Buscar product sets do catálogo para obter product_set_id
  const psRes = await fetch(
    `${META_BASE}/${cfg.catalogoId}/product_sets?fields=id,name&limit=5&access_token=${token}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  const psData = await psRes.json() as {
    data?: Array<{ id: string; name: string }>;
    error?: { message: string };
  };
  const productSetId = psData.data?.[0]?.id;
  if (!productSetId) {
    throw new Error(
      `Nenhum product set encontrado no catálogo ${cfg.catalogoId}` +
      (psData.error ? `: ${psData.error.message}` : ''),
    );
  }
  console.log('[CATALOGO] product_set_id:', productSetId, 'catalogo:', cfg.catalogoId);

  // 3. Criar adset com promoted_object apontando para o product set
  // CATALOG_SALE não exige pixel — OFFSITE_CONVERSIONS exigiria
  const adsetPayload: Record<string, unknown> = {
    name:              `[VEXX] ${cfg.nome} — Catálogo`,
    campaign_id:       campaignId,
    daily_budget:      String(cfg.orcamentoDiario),
    optimization_goal: 'CATALOG_SALE',
    billing_event:     'IMPRESSIONS',
    bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
    promoted_object: {
      product_set_id: productSetId,
    },
    targeting: {
      age_min:       cfg.idadeMin ?? 18,
      age_max:       cfg.idadeMax ?? 65,
      geo_locations: { countries: cfg.paises ?? ['BR'] },
    },
    status: 'PAUSED',
  };
  console.log('[CATALOGO ADSET PAYLOAD]', JSON.stringify(adsetPayload, null, 2));
  const adsetData = await metaPost(`${META_BASE}/${actId}/adsets`, adsetPayload, token);
  console.log('[CATALOGO ADSET RESPONSE]', JSON.stringify(adsetData));
  if (!adsetData.id) {
    throw new Error(`Erro ao criar adset catálogo: ${adsetData.error?.message ?? 'sem ID'}`);
  }
  const adsetId = adsetData.id;

  // 4. Criar criativo dinâmico (DPA template)
  const creativePayload = {
    name: `[VEXX] ${cfg.nome} — DPA`,
    object_story_spec: {
      page_id: cfg.pageId,
      template_data: {
        call_to_action: {
          type:  'SHOP_NOW',
          value: { link: '{{product.url}}' },
        },
        link:    '{{product.url}}',
        message: '{{product.name}} — Aproveite!',
        name:    '{{product.name}}',
      },
    },
    product_set_id: productSetId,
  };
  console.log('[CATALOGO CREATIVE PAYLOAD]', JSON.stringify(creativePayload, null, 2));

  const creativeUrlObj = new URL(`${META_BASE}/${actId}/adcreatives`);
  creativeUrlObj.searchParams.set('access_token', token);
  const creativeRes = await fetch(creativeUrlObj.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(creativePayload),
    signal:  AbortSignal.timeout(20_000),
  });
  const creativeData = await creativeRes.json() as { id?: string; error?: { message: string } };
  console.log('[CATALOGO CREATIVE RESPONSE]', JSON.stringify(creativeData));
  if (!creativeRes.ok || !creativeData.id) {
    throw new Error(`Erro ao criar criativo catálogo: ${creativeData.error?.message ?? 'sem ID'}`);
  }
  const creativeId = creativeData.id;

  // 5. Criar ad
  const adId = await criarAd(token, actId, adsetId, creativeId, cfg.nome);

  return { campaignId, adsetId, adId };
}
