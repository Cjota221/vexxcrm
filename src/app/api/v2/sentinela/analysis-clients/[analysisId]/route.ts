import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const ANALYSIS_LABELS: Record<string, string> = {
  churn_risk: 'Clientes em risco de churn',
  upsell_opportunity: 'Clientes com oportunidade de upsell',
  vip_care: 'Clientes VIP para cuidado especial',
  win_back: 'Clientes para win-back',
  reactivation: 'Clientes para reativação',
  new_customer_nurture: 'Novos clientes para nutrição',
  cross_sell: 'Clientes para cross-sell',
  seasonal_opportunity: 'Clientes para campanha sazonal',
};

/**
 * GET /api/v2/sentinela/analysis-clients/[analysisId]
 *
 * Busca todos os clientes do tenant que se encaixam no mesmo tipo de análise.
 * Usado pelo botão "Disparar Campanha" no SentinelaAnnePanel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;
    const { analysisId } = params;

    // Buscar a análise para obter o tipo
    const { data: analysis, error: analysisError } = await supabase
      .from('sentinela_analyses')
      .select('id, type, client_id')
      .eq('id', analysisId)
      .eq('tenant_id', tenantId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Análise não encontrada' }, { status: 404 });
    }

    const analysisType = analysis.type as string;

    // Montar query de clientes baseada no tipo de análise
    let query = supabase
      .from('clients')
      .select('id, name, phone, phone_normalized, tier, ltv, rfm_segment, last_order_at, total_orders, created_at')
      .eq('tenant_id', tenantId)
      .not('phone_normalized', 'is', null);

    // Aplicar filtros específicos por tipo
    switch (analysisType) {
      case 'churn_risk':
        query = query.or(
          'flag_churn_risk.eq.true,' +
          'and(rfm_segment.in.("At Risk","Hibernating","Lost"))'
        );
        break;

      case 'upsell_opportunity':
        query = query.or('flag_upsell_ready.eq.true');
        break;

      case 'vip_care':
        query = query.or('tier.eq.vip,tier.eq.key_account');
        break;

      case 'win_back':
        // last_order_at entre 90 e 180 dias atrás
        query = query
          .gte('last_order_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
          .lte('last_order_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
        break;

      case 'reactivation':
        query = query
          .lt('last_order_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
          .gte('total_orders', 1);
        break;

      case 'new_customer_nurture':
        query = query
          .eq('total_orders', 1)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        break;

      case 'cross_sell':
      case 'seasonal_opportunity':
      default:
        query = query
          .gte('ltv', 100)
          .gte('total_orders', 2);
        break;
    }

    const { data: rows, error: clientsError } = await query
      .order('ltv', { ascending: false })
      .limit(500);

    if (clientsError) {
      console.error('[SENTINELA_CLIENTS] Supabase error:', clientsError);
      return NextResponse.json({ error: clientsError.message }, { status: 500 });
    }

    const clients = (rows ?? []).map(c => ({
      id: c.id as string,
      name: (c.name ?? '') as string,
      phone: ((c.phone_normalized ?? c.phone) ?? '') as string,
      tier: (c.tier ?? null) as string | null,
      ltv: (c.ltv ?? 0) as number,
    }));

    return NextResponse.json({
      analysis_type: analysisType,
      clients,
      total: clients.length,
      label: ANALYSIS_LABELS[analysisType] ?? 'Clientes selecionados pela Sentinela',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SENTINELA_CLIENTS] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
