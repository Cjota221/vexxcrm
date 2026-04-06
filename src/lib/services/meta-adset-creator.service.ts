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
import { jarvisSelecionarPublico, jarvisGerarCopyRapida } from './jarvis-trafego.service';

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
    billing_event:     'LINK_CLICKS',   // Meta exige billing=LINK_CLICKS quando optimization=LINK_CLICKS
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
  whatsapp: {
    objetivo:          'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event:     'LINK_CLICKS',   // Meta exige billing=LINK_CLICKS quando optimization=LINK_CLICKS
    placements: {
      publisher_platforms: ['facebook', 'instagram'],
    },
  },
  catalogo: {
    objetivo:          'OUTCOME_SALES',
    optimization_goal: 'CATALOG_SALE',  // OFFSITE_CONVERSIONS exige pixel; CATALOG_SALE não
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

  // Targeting simplificado: apenas campos essenciais.
  // Placement fields (publisher_platforms, instagram_positions, etc.) dentro de targeting
  // causam "Invalid parameter" dependendo do objetivo — deixar a Meta escolher automaticamente.
  let targetingFinal: Record<string, unknown>;
  if (cfg.targetingCompleto) {
    const tc = cfg.targetingCompleto;
    targetingFinal = {
      age_min:       tc.age_min       ?? cfg.idadeMin,
      age_max:       tc.age_max       ?? cfg.idadeMax,
      geo_locations: tc.geo_locations ?? { countries: cfg.paises },
      ...(tc.genders          ? { genders:          tc.genders }          : {}),
      ...(tc.flexible_spec    ? { flexible_spec:    tc.flexible_spec }    : {}),
      ...(tc.custom_audiences ? { custom_audiences: tc.custom_audiences } : {}),
    };
  } else {
    targetingFinal = {
      age_min:       cfg.idadeMin,
      age_max:       cfg.idadeMax,
      geo_locations: { countries: cfg.paises },
      ...(targeting.genders       ? { genders:       targeting.genders }       : {}),
      ...(targeting.flexible_spec ? { flexible_spec: targeting.flexible_spec } : {}),
      ...(cfg.publico_meta_id     ? { custom_audiences: [{ id: cfg.publico_meta_id }] } : {}),
    };
  }

  const adsetPayload: Record<string, unknown> = {
    name:              `[VEXX] ${cfg.nome} — Adset`,
    campaign_id:       campaignId,
    daily_budget:      String(cfg.orcamentoDiario),
    optimization_goal: tipoCfg.optimization_goal,
    billing_event:     tipoCfg.billing_event,
    bid_strategy:      'LOWEST_COST_WITHOUT_BID_CAP',
    targeting:         targetingFinal,
    targeting_automation: { advantage_audience: 0 },
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
  if (!cfg.pageId) {
    throw new Error('Page ID não configurado. Acesse Tráfego → Configurações e configure o Page ID da sua página do Facebook.');
  }

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
    // Se ainda não tiver, tenta buscar novamente (vídeo pode ter acabado de processar)
    let imageUrl = videoStatus.picture ?? cfg.imageUrl;
    if (!imageUrl) {
      const retryRes = await fetch(
        `${META_BASE}/${cfg.metaVideoId}?fields=picture&access_token=${token}`,
        { signal: AbortSignal.timeout(8_000) },
      ).catch(() => null);
      if (retryRes?.ok) {
        const retryData = await retryRes.json() as { picture?: string };
        imageUrl = retryData.picture ?? undefined;
      }
    }
    if (!imageUrl) {
      throw new Error('Thumbnail do vídeo não disponível. Aguarde o processamento concluir (pode levar alguns minutos) e tente novamente.');
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
    // 0. Carregar base de conhecimento do Jarvis + apiKey do tenant
    const { data: conhecimentos } = await supabase
      .from('jarvis_knowledge')
      .select('titulo, conteudo, categoria')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .limit(30);

    const docsCarregados = conhecimentos ?? [];
    // Usar length > 0 para evitar falsy bug com string vazia
    const baseConhecimento = docsCarregados.length > 0
      ? docsCarregados
          .map(k => `[${(k as Record<string, string>).categoria}] ${(k as Record<string, string>).titulo}: ${(k as Record<string, string>).conteudo}`)
          .join('\n\n')
          .slice(0, 6000)
      : undefined; // undefined → Jarvis usa apenas system prompt base

    console.log(`[JARVIS] Base de conhecimento carregada: ${docsCarregados.length} documentos`);

    // Buscar apiKey do tenant (estratégia: anthropic_api_key banco > strategy_api_key banco > env var)
    const { data: aiConfig } = await supabase
      .from('ai_provider_config')
      .select('anthropic_api_key, strategy_api_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const aiCfg = aiConfig as Record<string, string | null> | null;
    const jarvisApiKey = aiCfg?.anthropic_api_key
      || aiCfg?.strategy_api_key
      || process.env.ANTHROPIC_API_KEY;

    if (!jarvisApiKey) {
      console.warn('[JARVIS] API key Anthropic não encontrada — Jarvis desabilitado para esta publicação');
    }

    // 1. Criar campanha
    const campaignId = await criarCampanha(token, actId, draft.nome, draft.objetivo);

    // 2. Resolver público — Jarvis seleciona o melhor dentre todos os aprovados
    const tipoCampanha = objetivoParaTipo(draft.objetivo);
    let publicoMetaId: string | undefined = draft.publico_id ?? undefined;
    let targetingAprovado: Record<string, unknown> | undefined = undefined;
    let publicoNome = 'público selecionado';

    // Declarar fora dos blocos condicionais para ficarem acessíveis no log final
    let jarvisDecisao: string | null = null;
    let jarvisCopy: string | null = null;

    if (!publicoMetaId) {
      // Buscar TODOS os públicos aprovados para o tipo (não só o mais recente)
      const { data: publicosDisponiveis } = await supabase
        .from('meta_publicos_aprovados')
        .select('id, nome, tipo, meta_audience_id, targeting')
        .eq('tenant_id', tenantId)
        .eq('tipo', tipoCampanha)
        .eq('status', 'publicado')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!publicosDisponiveis || publicosDisponiveis.length === 0) {
        throw new Error(
          `Nenhum público aprovado encontrado para o tipo '${tipoCampanha}'. ` +
          `Acesse a aba Públicos, importe ou crie um público e tente novamente.`,
        );
      }

      // Jarvis escolhe o melhor público quando há mais de um e apiKey disponível
      let publicoEscolhido = publicosDisponiveis[0];

      if (publicosDisponiveis.length > 1 && jarvisApiKey) {
        try {
          const selecao = await jarvisSelecionarPublico(
            tipoCampanha,
            publicosDisponiveis,
            {
              objetivo:               draft.objetivo,
              orcamento_diario_reais: Math.round((draft.orcamento_diario ?? 3000) / 100),
              idade_min:              draft.idade_min ?? 18,
              idade_max:              draft.idade_max ?? 65,
              genero:                 draft.genero ?? 'all',
            },
            jarvisApiKey,
            baseConhecimento,
          );
          const encontrado = publicosDisponiveis.find(p => p.id === selecao.publico_id);
          if (encontrado) {
            publicoEscolhido = encontrado;
            jarvisDecisao = `Público: ${selecao.nome} — ${selecao.justificativa}`;
            console.log(`[JARVIS] ✅ ${jarvisDecisao}`);
          }
        } catch (e) {
          jarvisDecisao = `Fallback: primeiro público (erro Jarvis: ${e instanceof Error ? e.message : String(e)})`;
          console.warn('[JARVIS] ⚠️ Falha ao selecionar público:', e);
        }
      } else if (!jarvisApiKey) {
        jarvisDecisao = 'Jarvis desabilitado: API key não configurada';
      } else {
        jarvisDecisao = `Apenas 1 público disponível: ${publicosDisponiveis[0].nome}`;
      }

      publicoNome = publicoEscolhido.nome ?? 'público selecionado';
      if (publicoEscolhido.meta_audience_id) {
        publicoMetaId = publicoEscolhido.meta_audience_id as string;
      } else if (publicoEscolhido.targeting) {
        targetingAprovado = publicoEscolhido.targeting as Record<string, unknown>;
      }
    }

    // 3. Criar adset
    const interesses: InteresseTargeting[] = Array.isArray(draft.interesses) ? draft.interesses : [];
    const adsetId = await criarAdset(token, actId, campaignId, {
      nome:             draft.nome,
      objetivo:         draft.objetivo,
      orcamentoDiario:  draft.orcamento_diario,
      dataInicio:       draft.data_inicio ?? undefined,
      dataFim:          draft.data_fim ?? undefined,
      paises:           draft.paises ?? ['BR'],
      idadeMin:         draft.idade_min ?? 18,
      idadeMax:         draft.idade_max ?? 65,
      genero:           draft.genero ?? 'all',
      interesses,
      publico_meta_id:  publicoMetaId,
      targetingCompleto: targetingAprovado,
    });

    // 4. Resolver copy — Jarvis gera se o rascunho não tiver headline ou texto
    const criativo = draft.ad_creatives as { tipo: string; meta_video_id: string | null; meta_image_hash: string | null; url_preview: string | null } | null;
    if (!criativo) throw new Error('Criativo não encontrado. Selecione um criativo antes de publicar.');

    let headline = draft.copy_headline?.trim() || '';
    let texto    = draft.copy_texto?.trim() || '';
    let cta      = draft.copy_cta || '';

    // jarvisCopy já declarado no escopo externo acima

    if ((!headline || !texto) && jarvisApiKey) {
      try {
        const copyGerada = await jarvisGerarCopyRapida(
          {
            objetivo:      draft.objetivo,
            tipo_campanha: tipoCampanha,
            publico_nome:  publicoNome,
            tipo_criativo: criativo.tipo as 'video' | 'imagem',
            url_destino:   draft.url_destino ?? undefined,
          },
          jarvisApiKey,
          baseConhecimento,
        );
        // Validar CTA contra objetivo para evitar rejeição da Meta
        const ctasValidos: Record<string, string[]> = {
          MESSAGES:        ['WHATSAPP_MESSAGE', 'LEARN_MORE'],
          LEAD_GENERATION: ['SIGN_UP', 'LEARN_MORE', 'GET_OFFER'],
          LINK_CLICKS:     ['LEARN_MORE', 'SHOP_NOW', 'GET_OFFER'],
          CONVERSIONS:     ['SHOP_NOW', 'LEARN_MORE', 'BUY_NOW'],
          BRAND_AWARENESS: ['LEARN_MORE'],
        };
        const ctasPermitidos = ctasValidos[draft.objetivo] ?? ['LEARN_MORE'];
        const ctaValidado = ctasPermitidos.includes(copyGerada.cta) ? copyGerada.cta : ctasPermitidos[0];

        headline    = headline || copyGerada.headline;
        texto       = texto    || copyGerada.texto;
        cta         = cta      || ctaValidado;
        jarvisCopy  = `Copy gerada por Jarvis — headline: "${headline}" | cta: ${cta}`;
        console.log(`[JARVIS] ✅ ${jarvisCopy}`);
      } catch (e) {
        headline   = headline || draft.nome;
        texto      = texto    || 'Rasteirinhas femininas no atacado. Revenda e lucre.';
        cta        = cta      || 'LEARN_MORE';
        jarvisCopy = `Fallback hardcoded (erro Jarvis: ${e instanceof Error ? e.message : String(e)})`;
        console.warn('[JARVIS] ⚠️ Falha ao gerar copy:', e);
      }
    } else if (!jarvisApiKey) {
      headline = headline || draft.nome;
      texto    = texto    || 'Rasteirinhas femininas no atacado. Revenda e lucre.';
      cta      = cta      || 'LEARN_MORE';
      jarvisCopy = 'Jarvis desabilitado: API key não configurada';
    }

    const cfgCriativo: ConfiguracaoCriativo = {
      tipo:          criativo.tipo as 'video' | 'imagem',
      metaVideoId:   criativo.meta_video_id ?? undefined,
      metaImageHash: criativo.meta_image_hash ?? undefined,
      imageUrl:      criativo.url_preview ?? undefined,
      headline,
      texto,
      cta,
      urlDestino:    draft.url_destino ?? undefined,
      pageId,
      whatsappNumber,
    };
    const creativeId = await criarAdCreative(token, actId, cfgCriativo);

    // 4. Criar ad
    const adId = await criarAd(token, actId, adsetId, creativeId, draft.nome);

    // 5. Salvar resultado + log das decisões do Jarvis
    const jarvisLog = [jarvisDecisao, jarvisCopy].filter(Boolean).join(' | ');
    await supabase
      .from('meta_campaign_drafts')
      .update({
        status:           'publicado',
        meta_campaign_id: campaignId,
        meta_adset_id:    adsetId,
        meta_ad_id:       adId,
        erro:             null,
        ...(jarvisLog ? { jarvis_log: jarvisLog } : {}),
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
  const actId: string = config.account_id.startsWith('act_')
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
    erros: string[];
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

    // optimization_goal: REACH só é válido em OUTCOME_AWARENESS.
    // Quando a campanha é OUTCOME_TRAFFIC (ex: tem conjunto whatsapp), usar IMPRESSIONS para frio.
    const optGoalFrio = objetivo === 'OUTCOME_AWARENESS' ? 'REACH' : 'IMPRESSIONS';
    const optGoal = conjunto.tipo === 'frio' ? optGoalFrio : 'LINK_CLICKS';

    // Targeting simplificado: apenas campos essenciais para evitar conflitos de placement
    const targetingSimples = {
      age_min:       (targetingCompleto.age_min as number)  ?? 25,
      age_max:       (targetingCompleto.age_max as number)  ?? 55,
      genders:       (targetingCompleto.genders as number[]) ?? [2],
      geo_locations: (targetingCompleto.geo_locations as Record<string, unknown>) ?? { countries: ['BR'] },
      ...(targetingCompleto.flexible_spec  ? { flexible_spec:   targetingCompleto.flexible_spec }  : {}),
      ...(targetingCompleto.custom_audiences ? { custom_audiences: targetingCompleto.custom_audiences } : {}),
    };

    // Criar adset
    const adset = await metaPost(`${META_BASE}/${actId}/adsets`, {
      name: `${cfg.nome} — ${tipoLabel}`,
      campaign_id: campanha.id,
      daily_budget: String(conjunto.orcamentoDiario),
      optimization_goal: optGoal,
      billing_event: conjunto.tipo === 'frio' ? 'IMPRESSIONS' : 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_BID_CAP',
      targeting: targetingSimples,
      targeting_automation: { advantage_audience: 0 },
      status: 'PAUSED',
    }, token);
    if (!adset.id) throw new Error(`Erro adset ${tipoLabel}: ${adset.error?.message}`);
    const adsetId: string = adset.id;

    // Criar ads em paralelo para caber no timeout do Netlify
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
          const adId = await criarAd(token, actId, adsetId, creativeId, adName);
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
    promoted_object: {
      product_set_id: productSetId,
    },
    targeting: {
      age_min:       cfg.idadeMin ?? 18,
      age_max:       cfg.idadeMax ?? 65,
      geo_locations: { countries: cfg.paises ?? ['BR'] },
    },
    targeting_automation: { advantage_audience: 0 },
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

/* ─── Buscar Público Aprovado ────────────────────────────────────────────────── */

/**
 * Busca um público aprovado pelo tenant no Supabase e retorna o targeting
 * pronto para uso em campanhas. Se meta_audience_id estiver preenchido,
 * o campo custom_audiences é incluído no targeting para usar o saved_audience.
 *
 * @param tenantId - UUID do tenant
 * @param publicoId - UUID do público aprovado
 * @returns Objeto targeting completo ou null se não encontrado
 */
export async function buscarPublicoAprovado(
  tenantId: string,
  publicoId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('meta_publicos_aprovados')
    .select('targeting, meta_audience_id, status, nome')
    .eq('id', publicoId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) return null;
  if (data.status === 'arquivado') return null;

  const targeting = (data.targeting as Record<string, unknown>) ?? {};

  // Se o público foi publicado na Meta como saved_audience, inclui o ID
  if (data.meta_audience_id) {
    return {
      ...targeting,
      custom_audiences: [{ id: data.meta_audience_id }],
    };
  }

  return targeting;
}
