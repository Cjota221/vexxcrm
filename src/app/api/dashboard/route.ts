import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import type { DashboardKPIs } from '@/types';

/**
 * GET /api/dashboard
 * Retorna KPIs do dashboard usando SQL aggregation (migration 056).
 * Antes: paginava todos os pedidos em memória (5–30s para 50k+ registros).
 * Agora: uma única chamada RPC com SUM/COUNT no banco.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const [
      { count: totalClients },
      { count: activeChats },
      { count: runningCampaigns },
      { count: newClientsMonth },
      { count: totalProducts },
      { data: orderStats, error: statsError },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'running'),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.rpc('get_dashboard_stats', { p_tenant_id: tenantId }),
    ]);

    if (statsError) {
      console.error('❌ Dashboard RPC error:', statsError);
    }

    const s = Array.isArray(orderStats) ? orderStats[0] : null;

    const kpis: DashboardKPIs = {
      total_clients:      totalClients    || 0,
      active_chats:       activeChats     || 0,
      running_campaigns:  runningCampaigns || 0,
      messages_today:     totalProducts   || 0,
      total_revenue:      Number(s?.total_revenue)     || 0,
      avg_ticket:         Number(s?.avg_ticket)         || 0,
      new_clients_month:  newClientsMonth              || 0,
      response_time_avg:  0,
      total_orders:       Number(s?.total_orders)       || 0,
      total_paid:         Number(s?.total_paid)         || 0,
      total_delivered:    Number(s?.total_delivered)    || 0,
      total_products:     totalProducts                || 0,
      total_pieces_sold:  Number(s?.total_pieces_sold)  || 0,
      paid_revenue:       Number(s?.paid_revenue)       || 0,
    };

    return NextResponse.json(kpis);
  } catch (error) {
    console.error('❌ Dashboard API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar KPIs' }, { status: 500 });
  }
}
