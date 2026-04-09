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
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error((json.error as Record<string, string>).message ?? JSON.stringify(json.error));
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
      fields: 'id,title,thumbnails,length',
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

/* ─── ACAO 2: criar_campanha_inteligente ──────────────────────────────────── */

async function criarCampanhaInteligente(
  token: string,
  actId: string,
  tenantId: string,
  params: {
    objetivo: string;
    orcamento_diario: number; // em reais
    tipos_publico: Array<'frio' | 'quente' | 'whatsapp'>;
    video_ids: string[];
    page_id: string;
  },
) {
  const supabase = createServerSupabaseClient();
  const pageId = params.page_id ?? '101337882545607';
  const orcamentoCentavos = Math.round(params.orcamento_diario * 100);
  const orcamentoPorTipo  = Math.round(orcamentoCentavos / (params.tipos_publico.length || 1));

  const OBJETIVO_MAP: Record<string, string> = {
    OUTCOME_SALES:  'OUTCOME_SALES',
    OUTCOME_LEADS:  'OUTCOME_LEADS',
    MESSAGES:       'OUTCOME_TRAFFIC',
  };
  const objetivoMeta = OBJETIVO_MAP[params.objetivo] ?? 'OUTCOME_TRAFFIC';

  const resultados: unknown[] = [];

  for (const tipo of params.tipos_publico) {
    try {
      // ── Buscar público por tipo ──
      let targeting: Record<string, unknown> | null = null;

      if (tipo === 'frio') {
        const { data } = await supabase
          .from('meta_publicos_aprovados')
          .select('targeting, meta_audience_id, nome')
          .eq('tenant_id', tenantId)
          .in('tipo', ['interesse', 'custom'])
          .eq('status', 'publicado')
          .not('meta_audience_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        targeting = data?.targeting ?? null;
      } else if (tipo === 'quente') {
        const { data } = await supabase
          .from('meta_publicos_aprovados')
          .select('targeting, meta_audience_id, nome')
          .eq('tenant_id', tenantId)
          .in('subtype', ['ENGAGEMENT', 'WEBSITE', 'CUSTOM'])
          .eq('status', 'publicado')
          .not('meta_audience_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (!data) {
          const { data: d2 } = await supabase
            .from('meta_publicos_aprovados')
            .select('targeting, meta_audience_id, nome')
            .eq('tenant_id', tenantId)
            .in('tipo', ['engajamento', 'remarketing', 'website'])
            .eq('status', 'publicado')
            .not('meta_audience_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          targeting = d2?.targeting ?? null;
        } else {
          targeting = data.targeting ?? null;
        }
      } else if (tipo === 'whatsapp') {
        // Lookalike primeiro
        const { data: la } = await supabase
          .from('meta_publicos_aprovados')
          .select('targeting, meta_audience_id, nome')
          .eq('tenant_id', tenantId)
          .eq('tipo', 'lookalike')
          .eq('status', 'publicado')
          .not('meta_audience_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (la?.targeting) {
          targeting = la.targeting;
        } else {
          // Fallback: remarketing (NUNCA interesses)
          const { data: re } = await supabase
            .from('meta_publicos_aprovados')
            .select('targeting, meta_audience_id, nome')
            .eq('tenant_id', tenantId)
            .in('tipo', ['engajamento', 'remarketing', 'website'])
            .eq('status', 'publicado')
            .not('meta_audience_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          targeting = re?.targeting ?? null;
        }
      }

      // Fallback mínimo sem interesses para whatsapp
      if (!targeting) {
        targeting = {
          geo_locations: { countries: ['BR'] },
          age_min: 25,
          age_max: 55,
          genders: [2],
          ...(tipo !== 'whatsapp' ? {
            flexible_spec: [{
              interests: [
                { id: '6003333608514', name: 'Moda Feminina' },
                { id: '6003107626192', name: 'Atacado (varejo)' },
              ],
            }],
          } : {}),
        };
      }

      // Sanitizar targeting: remover arrays vazios e injetar campos obrigatórios dentro do objeto
      const t = targeting as Record<string, unknown>;

      // Remover arrays vazios (interests: [], behaviors: [], etc.) dentro de flexible_spec
      if (Array.isArray(t.flexible_spec)) {
        t.flexible_spec = (t.flexible_spec as Array<Record<string, unknown>>)
          .map(spec => {
            const clean: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(spec)) {
              if (Array.isArray(v) && v.length === 0) continue;
              clean[k] = v;
            }
            return clean;
          })
          .filter(spec => Object.keys(spec).length > 0);
        if ((t.flexible_spec as unknown[]).length === 0) delete t.flexible_spec;
      }

      // Garantir defaults de geo/age/gender
      if (!t.geo_locations) t.geo_locations = { countries: ['BR'] };
      if (!t.age_min)       t.age_min = 25;
      if (!t.age_max)       t.age_max = 55;
      if (!t.genders)       t.genders = [2];

      // Placements DENTRO do targeting (spec validada)
      t.publisher_platforms   = ['facebook', 'instagram'];
      t.facebook_positions    = ['feed'];
      t.instagram_positions   = ['stream', 'story', 'reels'];

      // targeting_automation SEMPRE dentro do targeting
      t.targeting_automation = { advantage_audience: 0 };

      const videoId = params.video_ids?.[0];
      const nomeBase = `[Jarvis] ${tipo.toUpperCase()} — ${new Date().toLocaleDateString('pt-BR')}`;

      // 1. Campaign — sem bid_strategy (pertence ao adset)
      const camp = await metaPost(token, `${actId}/campaigns`, {
        name:                            nomeBase,
        objective:                       objetivoMeta,
        status:                          'PAUSED',
        special_ad_categories:           [],
        is_adset_budget_sharing_enabled: false,
      });

      // 2. Adset — payload validado no Graph Explorer
      const adset = await metaPost(token, `${actId}/adsets`, {
        name:              `${nomeBase} — Conjunto`,
        campaign_id:       camp.id,
        daily_budget:      orcamentoPorTipo,
        billing_event:     'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
        status:            'PAUSED',
        targeting:         t,
      });

      // 3. Ad Creative + Ad (apenas se tiver video_id)
      let adId: string | null = null;
      if (videoId) {
        const creative = await metaPost(token, `${actId}/adcreatives`, {
          name:  `${nomeBase} — Criativo`,
          object_story_spec: {
            page_id:           pageId,
            video_data: {
              video_id:  videoId,
              message:   'Conheça nossas rasteirinhas. Qualidade garantida.',
              call_to_action: {
                type: tipo === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
                value: { link: `https://www.facebook.com/${pageId}` },
              },
            },
          },
        });

        const ad = await metaPost(token, `${actId}/ads`, {
          name:        `${nomeBase} — Anúncio`,
          adset_id:    adset.id,
          creative:    { creative_id: creative.id },
          status:      'PAUSED',
        });
        adId = ad.id as string;
      }

      // Salvar em meta_campaign_drafts
      await supabase.from('meta_campaign_drafts').insert({
        tenant_id:   tenantId,
        nome:        nomeBase,
        objetivo:    objetivoMeta,
        tipo,
        status:      'publicado',
        meta_campaign_id: camp.id as string,
        meta_adset_id:    adset.id as string,
        meta_ad_id:       adId,
        created_at:  new Date().toISOString(),
      });

      resultados.push({
        tipo,
        ok: true,
        campaign_id: camp.id,
        adset_id:    adset.id,
        ad_id:       adId,
        nome:        nomeBase,
      });
    } catch (err) {
      resultados.push({ tipo, ok: false, erro: String(err) });
    }
  }

  return { resultados, total: resultados.length };
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

      case 'criar_campanha_inteligente': {
        const resultado = await criarCampanhaInteligente(token, actId, tenantId, {
          objetivo:      String(params.objetivo ?? 'OUTCOME_TRAFFIC'),
          orcamento_diario: Number(params.orcamento_diario ?? 50),
          tipos_publico: (params.tipos_publico as Array<'frio' | 'quente' | 'whatsapp'>) ?? ['frio'],
          video_ids:     (params.video_ids as string[]) ?? [],
          page_id:       String(params.page_id ?? '101337882545607'),
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
