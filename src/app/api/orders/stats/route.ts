import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/orders/stats
 * Retorna estatísticas gerais de pedidos do tenant (não por página).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const tenant_id = profile.tenant_id;

    // Buscar counts e totais em paralelo
    const [
      { count: totalOrders },
      { count: totalPaid },
      { count: totalDelivered },
      { data: revenueData },
    ] = await Promise.all([
      // Total de pedidos
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
      // Pedidos pagos (payment_status = paid)
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('payment_status', 'paid'),
      // Pedidos entregues
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('status', 'delivered'),
      // Receita total (todos os pedidos pagos)
      supabase.from('orders').select('total').eq('tenant_id', tenant_id).eq('payment_status', 'paid'),
    ]);

    const totalRevenue = revenueData?.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 0;

    return NextResponse.json({
      total_orders: totalOrders || 0,
      total_paid: totalPaid || 0,
      total_delivered: totalDelivered || 0,
      total_revenue: totalRevenue,
    });
  } catch (error: any) {
    console.error('❌ Erro no endpoint de stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
