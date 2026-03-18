import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/facilzap/stats
 *
 * Estatísticas de clientes e pedidos do FacilZap para exibição no Kanban.
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthIso = startOfMonth.toISOString();

    const [
      { count: totalClientes },
      { count: totalPedidos },
      { data: revenueData },
      { data: revenueMesData },
      { count: pedidosPendentes },
      { count: clientesNovosMes },
    ] = await Promise.all([
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('status', 'in', '(cancelled,refunded)'),

      supabase
        .from('orders')
        .select('total')
        .eq('tenant_id', tenantId)
        .not('status', 'in', '(cancelled,refunded)'),

      supabase
        .from('orders')
        .select('total')
        .eq('tenant_id', tenantId)
        .not('status', 'in', '(cancelled,refunded)')
        .gte('created_at', startOfMonthIso),

      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'waiting_payment']),

      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfMonthIso),
    ]);

    const receita_total = (revenueData ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    const receita_mes = (revenueMesData ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    const ticket_medio = totalPedidos && totalPedidos > 0 ? receita_total / totalPedidos : 0;
    const taxa_conversao =
      totalClientes && totalClientes > 0
        ? `${((( totalPedidos ?? 0) / totalClientes) * 100).toFixed(1)}%`
        : '0%';

    return NextResponse.json({
      total_clientes: totalClientes ?? 0,
      total_pedidos: totalPedidos ?? 0,
      receita_total: Math.round(receita_total * 100) / 100,
      receita_mes: Math.round(receita_mes * 100) / 100,
      ticket_medio: Math.round(ticket_medio * 100) / 100,
      pedidos_pendentes: pedidosPendentes ?? 0,
      taxa_conversao,
      clientes_novos_mes: clientesNovosMes ?? 0,
    });
  } catch (error: any) {
    console.error('[FacilZap Stats] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
