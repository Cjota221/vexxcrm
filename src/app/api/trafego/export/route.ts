import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

/**
 * GET /api/trafego/export?format=csv&period=7d&account_id=XXX
 * Exporta dados de campanhas em CSV ou JSON para download.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const format      = req.nextUrl.searchParams.get('format') || 'csv';
    const period      = req.nextUrl.searchParams.get('period') || '7d';
    const accountIdParam = req.nextUrl.searchParams.get('account_id');

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = accountIdParam || config.meta_ad_account_id;

    const datePreset =
      period === '1d'  ? 'today'    :
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const insightFields = [
      'spend', 'impressions', 'clicks', 'reach', 'cpc', 'cpm', 'ctr',
      'frequency', 'actions', 'action_values',
      'video_p25_watched_actions', 'video_p50_watched_actions',
      'video_thruplay_watched_actions',
    ].join(',');

    const campaignFields = [
      `insights.date_preset(${datePreset}){${insightFields},date_start,date_stop}`,
      'name', 'status', 'effective_status', 'objective', 'daily_budget',
    ].join(',');

    const res = await fetch(
      `${META_BASE}/${accountId}/campaigns` +
      `?fields=${encodeURIComponent(campaignFields)}` +
      `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED']))}` +
      `&limit=100&access_token=${token}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message || `Meta API ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      data: Array<{
        id: string; name: string; status: string; effective_status: string;
        objective: string; daily_budget?: string;
        insights?: { data: Array<{
          spend: string; impressions: string; clicks: string; reach: string;
          cpc: string; cpm: string; ctr: string; frequency: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
          video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
          video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
          date_start: string; date_stop: string;
        }> };
      }>;
    };

    const rows = (data.data || []).map(c => {
      const insight  = c.insights?.data?.[0];
      const spend    = n(insight?.spend);
      const revenue  = n(insight?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads    = Math.round(n(insight?.actions?.find(a => a.action_type === 'lead')?.value));
      const clicks   = Math.round(n(insight?.clicks));
      const impressions = Math.round(n(insight?.impressions));
      const reach    = Math.round(n(insight?.reach));
      const cpc      = n(insight?.cpc);
      const cpm      = n(insight?.cpm);
      const ctr      = n(insight?.ctr);
      const freq     = n(insight?.frequency);
      const roas     = spend > 0 ? revenue / spend : 0;
      const cpl      = leads > 0 ? spend / leads : 0;
      const thruplay = Math.round(n(insight?.video_thruplay_watched_actions?.[0]?.value));
      const p25      = Math.round(n(insight?.video_p25_watched_actions?.[0]?.value));
      const p50      = Math.round(n(insight?.video_p50_watched_actions?.[0]?.value));

      return {
        id:               c.id,
        nome:             c.name,
        status:           c.status,
        objetivo:         c.objective,
        periodo_inicio:   insight?.date_start || '',
        periodo_fim:      insight?.date_stop  || '',
        orcamento_diario: c.daily_budget ? (n(c.daily_budget) / 100).toFixed(2) : '',
        gasto:            spend.toFixed(2),
        retorno:          revenue.toFixed(2),
        roas:             roas.toFixed(2),
        leads:            leads,
        cpl:              cpl.toFixed(2),
        cliques:          clicks,
        cpc:              cpc.toFixed(2),
        impressoes:       impressions,
        alcance:          reach,
        cpm:              cpm.toFixed(2),
        ctr:              ctr.toFixed(2),
        frequencia:       freq.toFixed(2),
        video_25pct:      p25,
        video_50pct:      p50,
        video_thruplay:   thruplay,
      };
    });

    if (format === 'json') {
      return NextResponse.json({ rows, gerado_em: new Date().toISOString() });
    }

    // CSV
    const headers = [
      'ID', 'Campanha', 'Status', 'Objetivo', 'Período início', 'Período fim',
      'Orçamento diário (R$)', 'Gasto (R$)', 'Retorno (R$)', 'ROAS',
      'Leads', 'CPL (R$)', 'Cliques', 'CPC (R$)', 'Impressões', 'Alcance',
      'CPM (R$)', 'CTR (%)', 'Frequência', 'Vídeo 25%', 'Vídeo 50%', 'ThruPlay',
    ];

    const csvRows = [
      headers.join(';'),
      ...rows.map(r => [
        r.id, `"${r.nome}"`, r.status, r.objetivo,
        r.periodo_inicio, r.periodo_fim, r.orcamento_diario,
        r.gasto, r.retorno, r.roas, r.leads, r.cpl,
        r.cliques, r.cpc, r.impressoes, r.alcance,
        r.cpm, r.ctr, r.frequencia, r.video_25pct, r.video_50pct, r.video_thruplay,
      ].join(';')),
    ];

    const csv = '\uFEFF' + csvRows.join('\n'); // BOM para Excel em PT-BR
    const filename = `vexx-trafego-${period}-${new Date().toISOString().slice(0,10)}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
