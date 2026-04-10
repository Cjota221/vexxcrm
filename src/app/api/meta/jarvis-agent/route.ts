/**
 * POST /api/meta/jarvis-agent
 * Agente Jarvis — busca dados reais da Meta API e executa ações.
 *
 * Body: { acao: string, params?: Record<string, unknown> }
 * Ações: buscar_contexto | criar_campanha_inteligente | otimizar_campanhas | executar_otimizacao
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

async function metaGet(token: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${META_BASE}/${path}?${qs}`);
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error((json.error as Record<string, string>).message ?? JSON.stringify(json.error));
  return json;
}

async function metaPost(token: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    let errorData: unknown;
    try { errorData = JSON.parse(errorText); } catch { errorData = errorText; }
    throw new Error(JSON.stringify(errorData));
  }
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

/* ─── ACAO 1: buscar_contexto ─────────────────────────────────────────────── */

async function buscarContexto(token: string, actId: string) {
  const [campanhasRes, publicosRes, videosRes, insightsRes] = await Promise.all([
    metaGet(token, `${actId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
      limit: '10',
    }),
    metaGet(token, `${actId}/customaudiences`, {
      fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound',
      limit: '20',
    }),
    metaGet(token, `${actId}/advideos`, {
      fields: 'id,title,thumbnails,length,created_time',
      limit: '20',
    }),
    metaGet(token, `${actId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpm,actions,purchase_roas',
      date_preset: 'last_7d',
      level: 'campaign',
    }),
  ]);

  return {
    campanhas: (campanhasRes as { data?: unknown[] }).data ?? [],
    publicos:  (publicosRes  as { data?: unknown[] }).data ?? [],
    videos:    (videosRes    as { data?: unknown[] }).data ?? [],
    insights:  (insightsRes  as { data?: unknown[] }).data ?? [],
  };
}

/* ─── ACAO: montar_plano ──────────────────────────────────────────────────── */

async function montarPlano(
  token: string,
  actId: string,
  tenantId: string,
  params: {
    objetivo: string;
    orcamento_diario: number;
    tipos_publico: Array<'frio' | 'quente' | 'whatsapp'>;
  },
) {
  const supabase = createServerSupabaseClient();

  interface RawVideo {
    id: string;
    title?: string;
    thumbnails?: { data?: Array<{ uri: string }> };
    length?: number;
    created_time?: string;
  }

  // 1. Buscar vídeos com metadados completos
  const videosRes = await metaGet(token, `${actId}/advideos`, {
    fields: 'id,title,thumbnails,length,created_time',
    limit: '20',
  }) as { data?: RawVideo[] };

  const todosVideos = (videosRes.data ?? []).map(v => ({
    id:           v.id,
    title:        v.title || `Vídeo ${v.id.slice(-6)}`,
    thumbnail:    v.thumbnails?.data?.[0]?.uri ?? null,
    length:       v.length ?? null,
    created_time: v.created_time ?? null,
  }));

  const OBJETIVO_MAP: Record<string, string> = {
    OUTCOME_SALES: 'OUTCOME_SALES',
    OUTCOME_LEADS: 'OUTCOME_LEADS',
    MESSAGES:      'OUTCOME_TRAFFIC',
  };
  const objetivoMeta  = OBJETIVO_MAP[params.objetivo] ?? 'OUTCOME_TRAFFIC';
  const orcCentavos   = Math.round(params.orcamento_diario * 100);
  const orcPorTipo    = Math.round(orcCentavos / (params.tipos_publico.length || 1));
  const totalTipos    = params.tipos_publico.length;
  const conjuntos     = [];

  for (let i = 0; i < params.tipos_publico.length; i++) {
    const tipo = params.tipos_publico[i];
    let publicoNome    = tipo === 'frio' ? 'Público Frio' : tipo === 'quente' ? 'Público Quente' : 'WhatsApp';
    let metaAudienceId: string | null = null;
    const targetingBase: Record<string, unknown> = {};

    if (tipo === 'frio') {
      const { data } = await supabase
        .from('meta_publicos_aprovados')
        .select('targeting, meta_audience_id, nome')
        .eq('tenant_id', tenantId).eq('tipo', 'frio').eq('status', 'publicado')
        .order('created_at', { ascending: false }).limit(1).single();
      if (data?.nome)             publicoNome    = data.nome;
      if (data?.meta_audience_id) metaAudienceId = data.meta_audience_id;
      if (data?.targeting)        Object.assign(targetingBase, data.targeting as Record<string, unknown>);
    } else if (tipo === 'quente') {
      const { data: ma } = await supabase
        .from('meta_audiences')
        .select('meta_audience_id, nome')
        .eq('tenant_id', tenantId).in('tipo', ['remarketing', 'retargeting'])
        .eq('status', 'pronto').not('meta_audience_id', 'is', null)
        .order('created_at', { ascending: false }).limit(1).single();
      if (ma?.meta_audience_id) {
        metaAudienceId = ma.meta_audience_id; publicoNome = ma.nome ?? 'Remarketing';
      } else {
        const { data: mp } = await supabase
          .from('meta_publicos_aprovados')
          .select('targeting, meta_audience_id, nome')
          .eq('tenant_id', tenantId).eq('tipo', 'quente').eq('status', 'publicado')
          .order('created_at', { ascending: false }).limit(1).single();
        if (mp?.nome)             publicoNome    = mp.nome;
        if (mp?.meta_audience_id) metaAudienceId = mp.meta_audience_id;
        if (mp?.targeting)        Object.assign(targetingBase, mp.targeting as Record<string, unknown>);
      }
    } else if (tipo === 'whatsapp') {
      const { data: la } = await supabase
        .from('meta_publicos_aprovados')
        .select('targeting, meta_audience_id, nome')
        .eq('tenant_id', tenantId).eq('tipo', 'lookalike').eq('status', 'publicado')
        .not('meta_audience_id', 'is', null)
        .order('created_at', { ascending: false }).limit(1).single();
      if (la?.meta_audience_id) {
        metaAudienceId = la.meta_audience_id; publicoNome = la.nome ?? 'Lookalike';
        if (la.targeting) Object.assign(targetingBase, la.targeting as Record<string, unknown>);
      } else {
        const { data: re } = await supabase
          .from('meta_audiences')
          .select('meta_audience_id, nome')
          .eq('tenant_id', tenantId).in('tipo', ['remarketing', 'retargeting'])
          .eq('status', 'pronto').not('meta_audience_id', 'is', null)
          .order('created_at', { ascending: false }).limit(1).single();
        if (re?.meta_audience_id) { metaAudienceId = re.meta_audience_id; publicoNome = re.nome ?? 'Remarketing'; }
      }
    }

    // Distribuir vídeos em rotação entre conjuntos (sem repetir se possível)
    const videosDoConjunto: typeof todosVideos = [];
    if (todosVideos.length > 0) {
      const seen = new Set<string>();
      for (let j = 0; j < 4; j++) {
        const v = todosVideos[(i + j * totalTipos) % todosVideos.length];
        if (!seen.has(v.id)) { seen.add(v.id); videosDoConjunto.push(v); }
      }
    }

    conjuntos.push({
      tipo,
      publico_nome:     publicoNome,
      meta_audience_id: metaAudienceId,
      targeting_base:   targetingBase,
      orcamento_reais:  orcPorTipo / 100,
      objetivo:         objetivoMeta,
      video_ids:        videosDoConjunto.map(v => v.id),
      videos:           videosDoConjunto,
    });
  }

  return { conjuntos, objetivo: objetivoMeta, orcamento_total: params.orcamento_diario };
}

/* ─── ACAO 2: criar_campanha_inteligente ──────────────────────────────────── */

async function criarCampanhaInteligente(
  token: string,
  actId: string,
  tenantId: string,
  params: {
    objetivo: string;
    orcamento_diario: number;
    tipos_publico: Array<'frio' | 'quente' | 'whatsapp'>;
    page_id: string;
    // Plano pré-construído pelo montar_plano — skip DB lookups se fornecido
    conjuntos_plano?: Array<{
      tipo: 'frio' | 'quente' | 'whatsapp';
      meta_audience_id: string | null;
      targeting_base?: Record<string, unknown>;
      video_ids: string[];
      publico_nome?: string;
    }>;
  },
) {
  const supabase = createServerSupabaseClient();
  const pageId            = params.page_id ?? '101337882545607';
  const orcamentoCentavos = Math.round(params.orcamento_diario * 100);
  const orcamentoPorTipo  = Math.round(orcamentoCentavos / (params.tipos_publico.length || 1));

  const OBJETIVO_MAP: Record<string, string> = {
    OUTCOME_SALES: 'OUTCOME_SALES',
    OUTCOME_LEADS: 'OUTCOME_LEADS',
    MESSAGES:      'OUTCOME_TRAFFIC',
  };
  const objetivoMeta = OBJETIVO_MAP[params.objetivo] ?? 'OUTCOME_TRAFFIC';
  const resultados: unknown[] = [];
  const errosAds: string[] = [];

  // Pré-buscar vídeos com thumbnails (para image_url no adcreative e rotação de IDs)
  interface VideoDisp { id: string; thumbnails?: { data?: Array<{ uri: string }> } }
  let videosDisponiveis: VideoDisp[] = [];
  try {
    const vr = await metaGet(token, `${actId}/advideos`, { fields: 'id,thumbnails', limit: '20' }) as { data?: VideoDisp[] };
    videosDisponiveis = vr.data ?? [];
  } catch { /* sem vídeos */ }

  for (const tipo of params.tipos_publico) {
    try {
      const planoConj = params.conjuntos_plano?.find(c => c.tipo === tipo);
      const t: Record<string, unknown> = {};
      let audienceId: string | null = null;
      let publicoNome = tipo === 'frio' ? 'Público Frio' : tipo === 'quente' ? 'Público Quente' : 'WhatsApp';
      let videosParaEsteConj: string[] = [];

      if (planoConj) {
        // ── Usar dados do plano pré-construído ──
        audienceId          = planoConj.meta_audience_id;
        if (planoConj.targeting_base) Object.assign(t, planoConj.targeting_base);
        if (planoConj.publico_nome)   publicoNome = planoConj.publico_nome;
        videosParaEsteConj  = planoConj.video_ids.slice(0, 2);
      } else {
        // ── Fazer lookup do banco ──
        if (tipo === 'frio') {
          const { data } = await supabase
            .from('meta_publicos_aprovados').select('targeting, meta_audience_id, nome')
            .eq('tenant_id', tenantId).eq('tipo', 'frio').eq('status', 'publicado')
            .order('created_at', { ascending: false }).limit(1).single();
          if (data?.targeting)        Object.assign(t, data.targeting as Record<string, unknown>);
          if (data?.meta_audience_id) audienceId = data.meta_audience_id;
          if (data?.nome)             publicoNome = data.nome;
          if (!data?.targeting && !data?.meta_audience_id) {
            t.flexible_spec = [{ interests: [
              { id: '6003107626192', name: 'Atacado (varejo)' },
              { id: '6003333608514', name: 'Moda Feminina' },
              { id: '6003114185392', name: 'Empreendedorismo' },
            ]}];
          }
        } else if (tipo === 'quente') {
          const { data: ma } = await supabase
            .from('meta_audiences').select('meta_audience_id, nome')
            .eq('tenant_id', tenantId).in('tipo', ['remarketing', 'retargeting'])
            .eq('status', 'pronto').not('meta_audience_id', 'is', null)
            .order('created_at', { ascending: false }).limit(1).single();
          if (ma?.meta_audience_id) {
            audienceId = ma.meta_audience_id; if (ma.nome) publicoNome = ma.nome;
          } else {
            const { data: mp } = await supabase
              .from('meta_publicos_aprovados').select('targeting, meta_audience_id, nome')
              .eq('tenant_id', tenantId).eq('tipo', 'quente').eq('status', 'publicado')
              .order('created_at', { ascending: false }).limit(1).single();
            if (mp?.targeting)        Object.assign(t, mp.targeting as Record<string, unknown>);
            if (mp?.meta_audience_id) audienceId = mp.meta_audience_id;
            if (mp?.nome)             publicoNome = mp.nome;
          }
        } else if (tipo === 'whatsapp') {
          const { data: la } = await supabase
            .from('meta_publicos_aprovados').select('targeting, meta_audience_id, nome')
            .eq('tenant_id', tenantId).eq('tipo', 'lookalike').eq('status', 'publicado')
            .not('meta_audience_id', 'is', null)
            .order('created_at', { ascending: false }).limit(1).single();
          if (la?.meta_audience_id) {
            audienceId = la.meta_audience_id;
            if (la.targeting) Object.assign(t, la.targeting as Record<string, unknown>);
            if (la.nome)      publicoNome = la.nome;
          } else {
            const { data: re } = await supabase
              .from('meta_audiences').select('meta_audience_id, nome')
              .eq('tenant_id', tenantId).in('tipo', ['remarketing', 'retargeting'])
              .eq('status', 'pronto').not('meta_audience_id', 'is', null)
              .order('created_at', { ascending: false }).limit(1).single();
            if (re?.meta_audience_id) { audienceId = re.meta_audience_id; if (re.nome) publicoNome = re.nome; }
          }
        }

        // Distribuir vídeos em rotação
        const idxTipo   = params.tipos_publico.indexOf(tipo);
        const totalTipos = params.tipos_publico.length;
        if (videosDisponiveis.length > 0) {
          const ids: string[] = [];
          for (let j = 0; j < 2; j++) ids.push(videosDisponiveis[(idxTipo + j * totalTipos) % videosDisponiveis.length].id);
          videosParaEsteConj = [...new Set(ids)];
        }
      }

      // Injetar audience_id
      if (audienceId) t.custom_audiences = [{ id: audienceId }];

      // Limpar arrays vazios
      if (Array.isArray(t.flexible_spec)) {
        t.flexible_spec = (t.flexible_spec as Array<Record<string, unknown>>)
          .map(spec => Object.fromEntries(Object.entries(spec).filter(([, v]) => !Array.isArray(v) || v.length > 0)))
          .filter(spec => Object.keys(spec).length > 0);
        if ((t.flexible_spec as unknown[]).length === 0) delete t.flexible_spec;
      }
      if (Array.isArray(t.custom_audiences) && (t.custom_audiences as unknown[]).length === 0) delete t.custom_audiences;

      // Campos obrigatórios
      t.geo_locations        = (t.geo_locations as unknown) ?? { countries: ['BR'] };
      t.age_min              = (t.age_min as unknown) ?? 25;
      t.age_max              = (t.age_max as unknown) ?? 55;
      t.genders              = (t.genders as unknown) ?? [2];
      t.targeting_automation = { advantage_audience: 0 };
      t.publisher_platforms  = ['facebook', 'instagram'];
      t.facebook_positions   = ['feed'];
      t.instagram_positions  = ['stream', 'story', 'reels'];

      const nomeBase = `[Jarvis] ${tipo.toUpperCase()} — ${new Date().toLocaleDateString('pt-BR')}`;

      // 1. Campaign
      const camp = await metaPost(token, `${actId}/campaigns`, {
        name: nomeBase, objective: objetivoMeta, status: 'PAUSED',
        special_ad_categories: [], is_adset_budget_sharing_enabled: false,
      });

      // 2. Adset
      const adset = await metaPost(token, `${actId}/adsets`, {
        name: `${nomeBase} — Conjunto`, campaign_id: camp.id,
        daily_budget: orcamentoPorTipo, billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        status: 'PAUSED', targeting: t,
      });

      // 3. Um ad por video_id (máx 4)
      const adsIds: string[] = [];
      for (let idx = 0; idx < videosParaEsteConj.length; idx++) {
        const vid = videosParaEsteConj[idx];
        try {
          const videoInfo = videosDisponiveis.find(v => v.id === vid);
          const thumbUrl  = videoInfo?.thumbnails?.data?.[0]?.uri;
          const videoData: Record<string, unknown> = {
            video_id: vid,
            message: 'Conheça nossas rasteirinhas. Comece com R$130 e revenda com lucro!',
            title:   'CJ Rasteirinhas — Seja uma Revendedora',
            call_to_action: {
              type:  'LEARN_MORE',
              value: { link: tipo === 'whatsapp'
                ? 'https://wa.me/5562981480687'
                : 'https://cjotarasteirinhas.com.br/c/atacado/produtos/62981480687' },
            },
          };
          if (thumbUrl) videoData.image_url = thumbUrl;
          const creative = await metaPost(token, `${actId}/adcreatives`, {
            name: `Creative ${vid}`,
            object_story_spec: { page_id: pageId, video_data: videoData },
          });
          const ad = await metaPost(token, `${actId}/ads`, {
            name: `${nomeBase} — Anúncio ${idx + 1}`, adset_id: adset.id,
            creative: { creative_id: creative.id }, status: 'PAUSED',
          });
          adsIds.push(ad.id as string);
        } catch (adErr: any) {
          console.error(`[Jarvis] Erro adcreative ${idx + 1} para ${tipo}:`, JSON.stringify(adErr));
          errosAds.push(`${tipo} vídeo ${idx + 1}: ${adErr?.message || JSON.stringify(adErr)}`);
        }
      }

      // Salvar em meta_campaign_drafts
      await supabase.from('meta_campaign_drafts').insert({
        tenant_id: tenantId, nome: nomeBase, objetivo: objetivoMeta, tipo,
        status: 'publicado', meta_campaign_id: camp.id as string,
        meta_adset_id: adset.id as string, meta_ad_id: adsIds[0] ?? null,
        created_at: new Date().toISOString(),
      });

      resultados.push({ tipo, ok: true, campaign_id: camp.id, adset_id: adset.id,
        ads_ids: adsIds, total_ads: adsIds.length, publico_nome: publicoNome, nome: nomeBase });
    } catch (err) {
      resultados.push({ tipo, ok: false, erro: String(err) });
    }
  }

  return { resultados, total: resultados.length, erros_ads: errosAds, ok: errosAds.length === 0 };
}

/* ─── ACAO 3: otimizar_campanhas ──────────────────────────────────────────── */

async function otimizarCampanhas(token: string, actId: string) {
  // Buscar adsets ativos com insights
  const adsetsRes = await metaGet(token, `${actId}/adsets`, {
    fields: 'id,name,status,campaign_id,effective_status',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '50',
  }) as { data?: Array<{ id: string; name: string; status: string; campaign_id: string }> };

  const adsets = adsetsRes.data ?? [];
  const sugestoes: unknown[] = [];

  // Buscar insights para todos os adsets
  await Promise.all(adsets.map(async (adset) => {
    try {
      const insRes = await metaGet(token, `${adset.id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpm,frequency,actions,purchase_roas,cost_per_action_type',
        date_preset: 'last_7d',
      }) as { data?: Array<Record<string, unknown>> };

      const ins = insRes.data?.[0];
      if (!ins) return;

      const spend      = parseFloat(String(ins.spend ?? 0));
      const ctr        = parseFloat(String(ins.ctr ?? 0));
      const frequency  = parseFloat(String(ins.frequency ?? 0));
      const clicks     = parseFloat(String(ins.clicks ?? 0));

      // CPL
      const actions = (ins.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
      const leads   = actions.find(a => a.action_type === 'lead')?.value;
      const cpl     = leads && parseFloat(leads) > 0 ? spend / parseFloat(leads) : null;

      // ROAS
      const roasArr = ins.purchase_roas as Array<{ action_type: string; value: string }> | undefined;
      const roas    = roasArr?.[0] ? parseFloat(roasArr[0].value) : null;

      if (cpl && cpl > 25) {
        sugestoes.push({
          adset_id:        adset.id,
          adset_nome:      adset.name,
          acao:            'pausar',
          motivo:          `CPL R$${cpl.toFixed(2)} acima do limite de R$25`,
          impacto_estimado: 'Redução de desperdício de verba',
          metricas:        { cpl, spend },
        });
      }

      if (ctr < 0.5 && clicks > 10) {
        sugestoes.push({
          adset_id:        adset.id,
          adset_nome:      adset.name,
          acao:            'trocar_criativo',
          motivo:          `CTR ${(ctr * 100).toFixed(2)}% abaixo de 0,5% com ${clicks} cliques`,
          impacto_estimado: 'Melhora de engajamento',
          metricas:        { ctr, clicks },
        });
      }

      if (frequency > 3.5) {
        sugestoes.push({
          adset_id:        adset.id,
          adset_nome:      adset.name,
          acao:            'pausar',
          motivo:          `Frequência ${frequency.toFixed(1)}x — público saturado`,
          impacto_estimado: 'Evita desgaste de público',
          metricas:        { frequency, spend },
        });
      }

      if (roas && roas > 4) {
        sugestoes.push({
          adset_id:        adset.id,
          adset_nome:      adset.name,
          acao:            'aumentar_orcamento',
          valor:           1.2, // +20%
          motivo:          `ROAS ${roas.toFixed(1)}x — alta performance`,
          impacto_estimado: 'Escalar resultados positivos',
          metricas:        { roas, spend },
        });
      }
    } catch {
      // ignora erros de adsets individuais
    }
  }));

  return { sugestoes, total_adsets_analisados: adsets.length };
}

/* ─── ACAO 4: executar_otimizacao ─────────────────────────────────────────── */

async function executarOtimizacao(
  token: string,
  tenantId: string,
  params: {
    adset_id: string;
    acao: 'pausar' | 'ativar' | 'aumentar_orcamento' | 'trocar_criativo';
    valor?: number;
  },
) {
  const supabase = createServerSupabaseClient();

  let resultado: Record<string, unknown> = {};

  if (params.acao === 'pausar') {
    resultado = await metaPost(token, params.adset_id, { status: 'PAUSED' });
  } else if (params.acao === 'ativar') {
    resultado = await metaPost(token, params.adset_id, { status: 'ACTIVE' });
  } else if (params.acao === 'aumentar_orcamento') {
    // Buscar orçamento atual
    const adsetRes = await metaGet(token, params.adset_id, { fields: 'daily_budget' }) as Record<string, unknown>;
    const budgetAtual = parseFloat(String(adsetRes.daily_budget ?? 0));
    const fator = params.valor ?? 1.2;
    const novoOrcamento = Math.round(budgetAtual * fator);
    resultado = await metaPost(token, params.adset_id, { daily_budget: novoOrcamento });
  }

  // Registrar em jarvis_memoria
  try {
    await supabase.from('jarvis_memoria').insert({
      tenant_id: tenantId,
      tipo:      'otimizacao',
      dados: {
        adset_id: params.adset_id,
        acao:     params.acao,
        valor:    params.valor,
        resultado,
        executado_em: new Date().toISOString(),
      },
    });
  } catch {
    // ignora erro de log
  }

  return { ok: true, adset_id: params.adset_id, acao: params.acao, resultado };
}

/* ─── Handler principal ───────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let body: { acao: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { acao, params = {} } = body;

  try {
    const supabase = createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('meta_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const META_TOKEN = tenant.meta_access_token;
    const META_ACCOUNT = 'act_1244920119465862';
    const token = META_TOKEN;
    const actId = META_ACCOUNT;

    switch (acao) {
      case 'buscar_contexto': {
        const resultado = await buscarContexto(token, actId);
        return NextResponse.json(resultado);
      }

      case 'montar_plano': {
        const resultado = await montarPlano(token, actId, tenantId, {
          objetivo:         String(params.objetivo ?? 'OUTCOME_TRAFFIC'),
          orcamento_diario: Number(params.orcamento_diario ?? 50),
          tipos_publico:    (params.tipos_publico as Array<'frio' | 'quente' | 'whatsapp'>) ?? ['frio'],
        });
        return NextResponse.json(resultado);
      }

      case 'criar_campanha_inteligente': {
        const resultado = await criarCampanhaInteligente(token, actId, tenantId, {
          objetivo:         String(params.objetivo ?? 'OUTCOME_TRAFFIC'),
          orcamento_diario: Number(params.orcamento_diario ?? 50),
          tipos_publico:    (params.tipos_publico as Array<'frio' | 'quente' | 'whatsapp'>) ?? ['frio'],
          page_id:          String(params.page_id ?? '101337882545607'),
          conjuntos_plano:  params.conjuntos_plano as Array<{
            tipo: 'frio' | 'quente' | 'whatsapp';
            meta_audience_id: string | null;
            targeting_base?: Record<string, unknown>;
            video_ids: string[];
            publico_nome?: string;
          }> | undefined,
        });
        return NextResponse.json(resultado);
      }

      case 'otimizar_campanhas': {
        const resultado = await otimizarCampanhas(token, actId);
        return NextResponse.json(resultado);
      }

      case 'executar_otimizacao': {
        const resultado = await executarOtimizacao(token, tenantId, {
          adset_id: String(params.adset_id),
          acao:     params.acao as 'pausar' | 'ativar' | 'aumentar_orcamento' | 'trocar_criativo',
          valor:    params.valor !== undefined ? Number(params.valor) : undefined,
        });
        return NextResponse.json(resultado);
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[jarvis-agent]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
