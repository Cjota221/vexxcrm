import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

/**
 * GET  /api/trafego/abtest?campaign_a=XXX&campaign_b=XXX&period=7d
 * Compara métricas detalhadas entre duas campanhas lado a lado.
 *
 * POST /api/trafego/abtest
 * Body: { name, campaign_a_id, campaign_b_id, objective, variable }
 * Cria um Experiment formal no Meta Ads (A/B test oficial).
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const campaignA = req.nextUrl.searchParams.get('campaign_a');
    const campaignB = req.nextUrl.searchParams.get('campaign_b');
    const period    = req.nextUrl.searchParams.get('period') || '7d';

    if (!campaignA || !campaignB) {
      return NextResponse.json({ error: 'campaign_a e campaign_b obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const datePreset =
      period === '1d'  ? 'today'    :
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const insightFields = [
      'spend', 'impressions', 'clicks', 'reach', 'cpc', 'cpm', 'ctr', 'frequency',
      'actions', 'action_values',
      'video_p25_watched_actions', 'video_p50_watched_actions',
      'video_thruplay_watched_actions', 'video_avg_time_watched_actions',
      'outbound_clicks',
    ].join(',');

    const fields = [
      `insights.date_preset(${datePreset}){${insightFields},date_start,date_stop}`,
      'name', 'status', 'objective', 'daily_budget', 'created_time',
    ].join(',');

    // Buscar dados das duas campanhas em paralelo
    const [resA, resB] = await Promise.all([
      fetch(`${META_BASE}/${campaignA}?fields=${encodeURIComponent(fields)}&access_token=${token}`),
      fetch(`${META_BASE}/${campaignB}?fields=${encodeURIComponent(fields)}&access_token=${token}`),
    ]);

    async function parseMetrics(res: Response, id: string) {
      if (!res.ok) return null;
      const c = await res.json() as {
        id: string; name: string; status: string; objective: string;
        daily_budget?: string; created_time?: string;
        insights?: { data: Array<{
          spend: string; impressions: string; clicks: string; reach: string;
          cpc: string; cpm: string; ctr: string; frequency: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
          video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
          video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
          video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
          outbound_clicks?: Array<{ action_type: string; value: string }>;
          date_start: string; date_stop: string;
        }> };
      };
      const ins   = c.insights?.data?.[0];
      const spend   = n(ins?.spend);
      const revenue = n(ins?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads   = Math.round(n(ins?.actions?.find(a => a.action_type === 'lead')?.value));
      const clicks  = Math.round(n(ins?.clicks));
      const reach   = Math.round(n(ins?.reach));
      const imps    = Math.round(n(ins?.impressions));
      return {
        id,
        nome:          c.name,
        status:        c.status,
        objetivo:      c.objective,
        orcamento_dia: c.daily_budget ? n(c.daily_budget) / 100 : null,
        spend,   revenue,   leads,   clicks,   reach,   impressions: imps,
        cpc:     n(ins?.cpc),
        cpm:     n(ins?.cpm),
        ctr:     n(ins?.ctr),
        freq:    n(ins?.frequency),
        roas:    spend > 0 ? revenue / spend : 0,
        cpl:     leads > 0 ? spend / leads : 0,
        video_p25:  Math.round(n(ins?.video_p25_watched_actions?.[0]?.value)),
        video_p50:  Math.round(n(ins?.video_p50_watched_actions?.[0]?.value)),
        thruplay:   Math.round(n(ins?.video_thruplay_watched_actions?.[0]?.value)),
        avg_watch:  n(ins?.video_avg_time_watched_actions?.[0]?.value),
        lp_views:   Math.round(n(ins?.outbound_clicks?.[0]?.value)),
        date_start: ins?.date_start,
        date_stop:  ins?.date_stop,
      };
    }

    const [dataA, dataB] = await Promise.all([
      parseMetrics(resA, campaignA),
      parseMetrics(resB, campaignB),
    ]);

    // Calcular vencedor por métrica
    function winner(valA: number, valB: number, lowerIsBetter = false): 'a' | 'b' | 'tie' {
      const diff = Math.abs(valA - valB);
      if (diff === 0 || (valA === 0 && valB === 0)) return 'tie';
      if (lowerIsBetter) return valA < valB ? 'a' : 'b';
      return valA > valB ? 'a' : 'b';
    }

    const comparativo = dataA && dataB ? {
      roas:     { vencedor: winner(dataA.roas,  dataB.roas),  diff_pct: dataA.roas  > 0 && dataB.roas  > 0 ? ((dataA.roas  - dataB.roas)  / dataB.roas)  * 100 : 0 },
      cpl:      { vencedor: winner(dataA.cpl,   dataB.cpl,   true), diff_pct: dataA.cpl   > 0 && dataB.cpl   > 0 ? ((dataB.cpl   - dataA.cpl)   / dataB.cpl)   * 100 : 0 },
      ctr:      { vencedor: winner(dataA.ctr,   dataB.ctr),  diff_pct: dataA.ctr   > 0 && dataB.ctr   > 0 ? ((dataA.ctr   - dataB.ctr)   / dataB.ctr)   * 100 : 0 },
      cpm:      { vencedor: winner(dataA.cpm,   dataB.cpm,   true), diff_pct: dataA.cpm   > 0 && dataB.cpm   > 0 ? ((dataB.cpm   - dataA.cpm)   / dataB.cpm)   * 100 : 0 },
      thruplay: { vencedor: winner(dataA.thruplay, dataB.thruplay) },
      leads:    { vencedor: winner(dataA.leads, dataB.leads) },
    } : null;

    // Score simples: +1 ponto por vitória
    const scoreA = comparativo ? Object.values(comparativo).filter(m => m.vencedor === 'a').length : 0;
    const scoreB = comparativo ? Object.values(comparativo).filter(m => m.vencedor === 'b').length : 0;

    return NextResponse.json({
      a: dataA,
      b: dataB,
      comparativo,
      vencedor_geral: scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : 'empate',
      score: { a: scoreA, b: scoreB },
      period,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      name: string;
      campaign_a_id: string;
      campaign_b_id: string;
      variable: 'audience' | 'creative' | 'placement' | 'delivery_optimization';
    };

    if (!body.name || !body.campaign_a_id || !body.campaign_b_id) {
      return NextResponse.json({ error: 'name, campaign_a_id e campaign_b_id obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    const params = new URLSearchParams();
    params.set('name', body.name);
    params.set('cells', JSON.stringify([
      { campaign_ids: [body.campaign_a_id], allocation_percentage: 50 },
      { campaign_ids: [body.campaign_b_id], allocation_percentage: 50 },
    ]));
    params.set('type', 'HOLDOUT');
    params.set('access_token', token);

    const res = await fetch(`${META_BASE}/${accountId}/ad_studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json() as { id?: string; error?: { message?: string } };

    if (!data.id) {
      // Fallback: salvar localmente como experimento manual
      const { data: saved } = await supabase.from('meta_automation_rules').insert({
        tenant_id: profile.tenant_id,
        nome: `[A/B] ${body.name}`,
        ativa: true,
        condicao: { metrica: 'ctr', operador: 'maior_que', valor: 0, janela_dias: 7 },
        acao: { tipo: 'notificar' },
      }).select('id').single();

      return NextResponse.json({
        ok: true,
        modo: 'manual',
        id: saved?.id,
        aviso: data.error?.message || 'Experimento salvo localmente — comparação de métricas disponível na aba A/B Test',
        campaign_a_id: body.campaign_a_id,
        campaign_b_id: body.campaign_b_id,
      });
    }

    return NextResponse.json({ ok: true, modo: 'meta', experiment_id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
