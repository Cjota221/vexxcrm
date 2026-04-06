import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/dashboard/monthly?months=4
 * Retorna faturamento e pedidos agrupados por mês para os últimos N meses.
 * Usa a função SQL get_monthly_stats (migration 20260406_monthly_stats_fn.sql).
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const monthsParam = request.nextUrl.searchParams.get('months');
    const months = Math.min(Math.max(parseInt(monthsParam ?? '4', 10) || 4, 1), 12);

    const { data, error } = await supabase.rpc('get_monthly_stats', {
      p_tenant_id: tenantId,
      p_months: months,
    });

    if (error) {
      console.error('❌ Monthly stats RPC error:', error);
      return NextResponse.json(
        { error: 'Erro ao buscar estatísticas mensais' },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('❌ Monthly stats API error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
