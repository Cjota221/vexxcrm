import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import type { DashboardKPIs } from '@/types';

/**
 * GET /api/dashboard
 * Retorna KPIs do dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    // Verificar token e obter tenant_id
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const tenantId = profile.tenant_id;

    // Buscar KPIs em paralelo
    const [
      { count: totalClients },
      { count: activeChats },
      { count: runningCampaigns },
      { count: totalOrders },
      { data: paidOrders },
      { data: newClientsMonth },
      { count: totalProducts },
      { count: deliveredOrders },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'running'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('orders').select('total').eq('tenant_id', tenantId).eq('payment_status', 'paid'),
      supabase.from('clients').select('created_at', { count: 'exact' }).eq('tenant_id', tenantId).gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'delivered'),
    ]);

    // Calcular métricas
    const totalRevenue = paidOrders?.reduce((sum, order) => sum + (Number(order.total) || 0), 0) || 0;
    const avgTicket = paidOrders && paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

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
      total_orders: totalOrders || 0,
      total_paid: paidOrders?.length || 0,
      total_delivered: deliveredOrders || 0,
    };

    return NextResponse.json(kpis);
  } catch (error) {
    console.error('❌ Dashboard API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar KPIs' }, { status: 500 });
  }
}
