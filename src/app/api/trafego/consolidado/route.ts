import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

function n(v: string | undefined | null): number {
  return parseFloat(v || '0') || 0;
}

/**
 * POST /api/trafego/consolidado
 * Body: { account_ids: string[], period: string }
 * Busca métricas de múltiplas contas Meta em paralelo e retorna visão consolidada.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { account_ids: string[]; period?: string };

    if (!body.account_ids?.length) {
      return NextResponse.json({ error: 'account_ids obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const period    = body.period || '7d';
    const datePreset =
      period === '1d'  ? 'today'    :
      period === '7d'  ? 'last_7d'  :
      period === '15d' ? 'last_14d' :
      'last_30d';

    const insightFields = 'spend,impressions,clicks,reach,cpc,cpm,ctr,frequency,actions,action_values';
    const campaignFields = [
      `insights.date_preset(${datePreset}){${insightFields}}`,
      'name', 'status', 'objective',
    ].join(',');

    // Buscar todas as contas em paralelo
    const results = await Promise.allSettled(
      body.account_ids.map(async (accountId) => {
        // Buscar nome da conta
        const [accountRes, campaignsRes] = await Promise.all([
          fetch(`${META_BASE}/${accountId}?fields=name,currency&access_token=${token}`),
          fetch(
            `${META_BASE}/${accountId}/campaigns` +
            `?fields=${encodeURIComponent(campaignFields)}` +
            `&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED']))}` +
            `&limit=50&access_token=${token}`
          ),
        ]);

        const accountData = accountRes.ok
          ? await accountRes.json() as { name?: string; currency?: string }
          : {};

        if (!campaignsRes.ok) {
          const err = await campaignsRes.json().catch(() => ({})) as { error?: { message?: string } };
          return { accountId, accountName: accountData.name || accountId, error: err.error?.message, campaigns: [], summary: null };
        }

        const data = await campaignsRes.json() as {
          data: Array<{
            id: string; name: string; status: string; objective: string;
            insights?: { data: Array<{
              spend: string; impressions: string; clicks: string; reach: string;
              cpc: string; cpm: string; ctr: string; frequency: string;
              actions?: Array<{ action_type: string; value: string }>;
              action_values?: Array<{ action_type: string; value: string }>;
            }> };
          }>;
        };

        const campaigns = (data.data || []).map(c => {
          const insight  = c.insights?.data?.[0];
          const spend    = n(insight?.spend);
          const revenue  = n(insight?.action_values?.find(a => a.action_type === 'purchase')?.value);
          const leads    = Math.round(n(insight?.actions?.find(a => a.action_type === 'lead')?.value));
          const clicks   = Math.round(n(insight?.clicks));
          const impressions = Math.round(n(insight?.impressions));
          const roas     = spend > 0 ? revenue / spend : 0;
          const cpl      = leads > 0 ? spend / leads : 0;
          return { id: c.id, nome: c.name, status: c.status, objetivo: c.objective, spend, revenue, leads, clicks, impressions, roas, cpl };
        });

        const totalSpend   = campaigns.reduce((s, c) => s + c.spend, 0);
        const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
        const totalLeads   = campaigns.reduce((s, c) => s + c.leads, 0);
        const totalClicks  = campaigns.reduce((s, c) => s + c.clicks, 0);

        return {
          accountId,
          accountName: accountData.name || accountId,
          currency: accountData.currency || 'BRL',
          campaigns,
          summary: {
            spend:   totalSpend,
            revenue: totalRevenue,
            leads:   totalLeads,
            clicks:  totalClicks,
            roas:    totalSpend > 0 ? totalRevenue / totalSpend : 0,
            cpl:     totalLeads > 0 ? totalSpend / totalLeads : 0,
            ativas:  campaigns.filter(c => c.status === 'ACTIVE').length,
            pausadas: campaigns.filter(c => c.status === 'PAUSED').length,
          },
        };
      })
    );

    const contas = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);

    // Totais gerais
    const grand = contas.reduce((acc, conta) => {
      if (!conta?.summary) return acc;
      return {
        spend:   acc.spend   + conta.summary.spend,
        revenue: acc.revenue + conta.summary.revenue,
        leads:   acc.leads   + conta.summary.leads,
        clicks:  acc.clicks  + conta.summary.clicks,
        ativas:  acc.ativas  + conta.summary.ativas,
      };
    }, { spend: 0, revenue: 0, leads: 0, clicks: 0, ativas: 0 });

    return NextResponse.json({
      contas,
      grand: {
        ...grand,
        roas: grand.spend > 0 ? grand.revenue / grand.spend : 0,
        cpl:  grand.leads > 0 ? grand.spend / grand.leads : 0,
      },
      period,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
