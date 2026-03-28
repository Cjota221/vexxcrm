import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const META_BASE = 'https://graph.facebook.com/v23.0';

// Thresholds específicos para CJ Rasteirinhas
const THRESHOLDS = {
  CPM_ALERTA: 25,
  CTR_MINIMO: 0.8,
  CPL_URGENTE: 30,
  ROAS_MINIMO: 1.5,
  ROAS_OTIMO: 3.0,
  FREQUENCIA_SATURACAO: 4.0,
  GASTO_MIN_SEM_LEAD: 50,  // R$ gastado sem nenhum lead = urgente
};

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

function computeAlerts(c: {
  campaign_name: string;
  spend: number;
  cpm: number;
  ctr: number;
  cpl: number;
  roas: number;
  leads: number;
  impressions: number;
  frequency: number;
  status: string;
}): Array<{ tipo: 'danger' | 'warning'; mensagem: string; acao?: string }> {
  const alerts: Array<{ tipo: 'danger' | 'warning'; mensagem: string; acao?: string }> = [];
  if (c.status === 'PAUSED') return alerts;

  if (c.roas < THRESHOLDS.ROAS_MINIMO && c.spend > THRESHOLDS.GASTO_MIN_SEM_LEAD) {
    alerts.push({
      tipo: 'danger',
      mensagem: `Retorno muito baixo: gastou R$${c.spend.toFixed(0)} e gerou R$${(c.spend * c.roas).toFixed(0)} (${c.roas.toFixed(1)}x)`,
      acao: 'pausar',
    });
  }
  if (c.cpl > THRESHOLDS.CPL_URGENTE && c.leads > 0) {
    alerts.push({
      tipo: 'danger',
      mensagem: `Cada lead está custando R$${c.cpl.toFixed(0)} — acima do ideal de R$20`,
      acao: 'pausar',
    });
  }
  if (c.spend > THRESHOLDS.GASTO_MIN_SEM_LEAD && c.leads === 0 && c.roas < 0.5) {
    alerts.push({
      tipo: 'danger',
      mensagem: `Gastou R$${c.spend.toFixed(0)} sem nenhum lead ou venda`,
      acao: 'pausar',
    });
  }
  if (c.frequency > THRESHOLDS.FREQUENCIA_SATURACAO) {
    alerts.push({
      tipo: 'warning',
      mensagem: `Público saturando — cada pessoa viu o anúncio ${c.frequency.toFixed(1)} vezes`,
      acao: 'novo_publico',
    });
  }
  if (c.cpm > THRESHOLDS.CPM_ALERTA && c.impressions > 1000) {
    alerts.push({
      tipo: 'warning',
      mensagem: `Custo para aparecer alto: R$${c.cpm.toFixed(0)} por 1000 exibições`,
    });
  }
  if (c.ctr < THRESHOLDS.CTR_MINIMO && c.impressions > 500) {
    alerts.push({
      tipo: 'warning',
      mensagem: `Poucas pessoas clicam: taxa de ${c.ctr.toFixed(1)}% (ideal acima de 1,5%)`,
      acao: 'novo_criativo',
    });
  }
  return alerts;
}

function computeHealth(c: {
  roas: number; spend: number; leads: number; status: string;
  alerts: Array<{ tipo: string }>;
}): 'great' | 'ok' | 'bad' | 'paused' {
  if (c.status === 'PAUSED') return 'paused';
  if (c.alerts.some(a => a.tipo === 'danger')) return 'bad';
  if (c.roas >= THRESHOLDS.ROAS_OTIMO) return 'great';
  if (c.alerts.some(a => a.tipo === 'warning')) return 'ok';
  return 'ok';
}

/**
 * GET /api/trafego/metrics?period=7d
 * Retorna métricas de campanhas Meta Ads usando credenciais do tenant.
 * period: '1d' | '7d' | '15d' | '30d'
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const period = req.nextUrl.searchParams.get('period') || '7d';

    const supabase = createServerSupabaseClient();

    // Buscar credenciais Meta do tenant
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ connected: false, campaigns: [], summary: null });
    }

    const { meta_access_token: token, meta_ad_account_id: accountId } = config;

    // Mapear period para date_preset da Meta API
    const datePreset =
      period === '1d'  ? 'today'    :
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const insightFields = [
      'spend', 'impressions', 'clicks', 'reach', 'cpc', 'cpm', 'ctr',
      'frequency', 'actions', 'action_values',
    ].join(',');

    const campaignFields = [
      `insights.date_preset(${datePreset}){${insightFields},date_start,date_stop}`,
      'name', 'status', 'effective_status', 'objective', 'daily_budget',
    ].join(',');

    // Buscar nome da conta + campanhas em paralelo
    const [accountRes, campaignsRes] = await Promise.all([
      fetch(`${META_BASE}/${accountId}?fields=name&access_token=${token}`),
      fetch(
        `${META_BASE}/${accountId}/campaigns` +
        `?fields=${encodeURIComponent(campaignFields)}` +
        `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED']))}` +
        `&limit=50&access_token=${token}`
      ),
    ]);

    if (!campaignsRes.ok) {
      const errBody = await campaignsRes.json().catch(() => ({})) as { error?: { message?: string } };
      const errMsg = errBody.error?.message || `Erro Meta API ${campaignsRes.status}`;

      // ── Fallback: usar cache local quando Meta API está indisponível ────────
      const { data: cached } = await supabase
        .from('meta_campaigns_cache')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('sincronizado_em', { ascending: false });

      if (cached && cached.length > 0) {
        const campaigns = cached.map((c) => {
          const m = (c.metricas || {}) as {
            spend?: number; revenue?: number; impressions?: number; clicks?: number;
            cpc?: number; cpm?: number; ctr?: number; reach?: number;
            frequency?: number; roas?: number;
          };
          const spend       = m.spend || 0;
          const revenue     = m.revenue || 0;
          const leads       = 0;
          const clicks      = m.clicks || 0;
          const impressions = m.impressions || 0;
          const reach       = m.reach || 0;
          const cpc         = m.cpc || 0;
          const cpm         = m.cpm || 0;
          const ctr         = m.ctr || 0;
          const frequency   = m.frequency || 0;
          const roas        = m.roas || (spend > 0 ? revenue / spend : 0);
          const cpl         = 0;
          const alerts = computeAlerts({
            campaign_name: c.nome, spend, cpm, ctr, cpl, roas,
            leads, impressions, frequency, status: c.status,
          });
          return {
            id: c.id, nome: c.nome, status: c.status, objetivo: c.objetivo,
            spend, revenue, leads, clicks, impressions, reach, cpc, cpm, ctr, roas, cpl, frequency,
            orcamento_diario: c.orcamento_diario ?? null,
            date_start: c.data_inicio ?? undefined,
            date_stop:  c.data_fim   ?? undefined,
            alerts,
            health: computeHealth({ roas, spend, leads, status: c.status, alerts }),
          };
        });

        const totalSpend   = campaigns.reduce((s, c) => s + c.spend, 0);
        const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
        const totalClicks  = campaigns.reduce((s, c) => s + c.clicks, 0);
        const totalRoas    = totalSpend > 0 ? totalRevenue / totalSpend : 0;
        const totalCpc     = totalClicks > 0 ? totalSpend / totalClicks : 0;

        return NextResponse.json({
          connected: true,
          fromCache: true,
          cacheWarning: `Exibindo dados do último sync — Meta API indisponível (${errMsg})`,
          lastSync: cached[0]?.sincronizado_em,
          period,
          lastAnalysis: null,
          summary: { totalSpend, totalRevenue, totalLeads: 0, totalClicks, totalRoas, totalCpl: 0, totalCpc },
          campaigns,
        });
      }

      return NextResponse.json({ connected: false, error: errMsg }, { status: 502 });
    }

    const accountData = accountRes.ok ? await accountRes.json() as { name?: string } : {};
    const data = await campaignsRes.json() as {
      data: Array<{
        id: string; name: string; status: string; effective_status: string; objective: string;
        daily_budget?: string;
        insights?: { data: Array<{
          spend: string; impressions: string; clicks: string; reach: string;
          cpc: string; cpm: string; ctr: string; frequency: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          date_start: string; date_stop: string;
        }> };
      }>;
    };

    const campaigns = (data.data || []).map((campaign) => {
      const insight = campaign.insights?.data?.[0];
      const spend    = n(insight?.spend);
      const revenue  = n(insight?.action_values?.find(a => a.action_type === 'purchase')?.value);
      const leads    = Math.round(n(insight?.actions?.find(a => a.action_type === 'lead')?.value));
      const clicks   = Math.round(n(insight?.clicks));
      const impressions = Math.round(n(insight?.impressions));
      const reach    = Math.round(n(insight?.reach));
      const cpc      = n(insight?.cpc);
      const cpm      = n(insight?.cpm);
      const ctr      = n(insight?.ctr);
      const frequency = n(insight?.frequency) || (reach > 0 ? impressions / reach : 0);
      const roas     = spend > 0 ? revenue / spend : 0;
      const cpl      = leads > 0 ? spend / leads : 0;

      const alerts = computeAlerts({
        campaign_name: campaign.name, spend, cpm, ctr, cpl, roas,
        leads, impressions, frequency, status: campaign.status,
      });

      return {
        id: campaign.id,
        nome: campaign.name,
        status: campaign.status,
        effective_status: campaign.effective_status,
        objetivo: campaign.objective,
        spend,
        revenue,
        leads,
        clicks,
        impressions,
        reach,
        cpc,
        cpm,
        ctr,
        roas,
        cpl,
        frequency,
        orcamento_diario: campaign.daily_budget ? n(campaign.daily_budget) / 100 : null,
        date_start: insight?.date_start,
        date_stop:  insight?.date_stop,
        alerts,
        health: computeHealth({ roas, spend, leads, status: campaign.status, alerts }),
      };
    });

    // Buscar última análise do Time de IAs
    const { data: lastRun } = await supabase
      .from('ai_analysis_runs')
      .select('created_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Totais
    const totalSpend   = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalLeads   = campaigns.reduce((s, c) => s + c.leads, 0);
    const totalClicks  = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalRoas    = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const totalCpl     = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const totalCpc     = totalClicks > 0 ? totalSpend / totalClicks : 0;

    return NextResponse.json({
      connected: true,
      accountName: accountData.name || accountId,
      period,
      lastAnalysis: lastRun?.created_at || null,
      summary: { totalSpend, totalRevenue, totalLeads, totalClicks, totalRoas, totalCpl, totalCpc },
      campaigns,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
