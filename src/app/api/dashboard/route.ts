import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import type { DashboardKPIs } from '@/types';

/**
 * Busca TODOS os pedidos paginando para contornar o limite de 1000 rows do Supabase.
 */
async function fetchAllOrders(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
) {
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('orders')
      .select('total, payment_status, status, metadata')
      .eq('tenant_id', tenantId)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * GET /api/dashboard
 * Retorna KPIs do dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Buscar KPIs em paralelo
    const [
      { count: totalClients },
      { count: activeChats },
      { count: runningCampaigns },
      { data: newClientsMonth },
      { count: totalProducts },
      allOrders,
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'running'),
      supabase.from('clients').select('created_at', { count: 'exact' }).eq('tenant_id', tenantId).gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      fetchAllOrders(supabase, tenantId),
    ]);

    // Calcular métricas a partir de TODOS os pedidos (sem limite de 1000)
    const totalOrders = allOrders.length;
    const paidOrders = allOrders.filter(o => o.payment_status === 'paid');
    const deliveredOrders = allOrders.filter(o => o.status === 'delivered');

    const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const paidRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Calcular total de peças vendidas (de metadata.itens)
    let totalPieceSold = 0;
    for (const order of allOrders) {
      const meta = order.metadata as Record<string, unknown> | null;
      if (meta && Array.isArray(meta.itens)) {
        for (const item of meta.itens) {
          const it = item as Record<string, unknown>;
          totalPieceSold += Number(it.quantidade || it.quantity || 1);
        }
      }
    }

    const kpis: DashboardKPIs = {
      total_clients: totalClients || 0,
      active_chats: activeChats || 0,
      running_campaigns: runningCampaigns || 0,
      messages_today: totalProducts || 0, // Reusing field for total products
      total_revenue: totalRevenue,
      avg_ticket: avgTicket,
      new_clients_month: newClientsMonth?.length || 0,
      response_time_avg: 0,
      // Extra fields
      total_orders: totalOrders,
      total_paid: paidOrders.length,
      total_delivered: deliveredOrders.length,
      total_products: totalProducts || 0,
      total_pieces_sold: totalPieceSold,
      paid_revenue: paidRevenue,
    };

    return NextResponse.json(kpis);
  } catch (error) {
    console.error('❌ Dashboard API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar KPIs' }, { status: 500 });
  }
}
