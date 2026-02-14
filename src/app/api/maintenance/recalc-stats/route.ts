import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * POST /api/maintenance/recalc-stats
 * Recalcula total_orders, ltv, avg_ticket de todos os clientes
 * Corrige inconsistências entre clients.total_orders e orders reais
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabaseAdmin = createServerSupabaseClient();

    // Verificar token e obter tenant_id
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const tenantId = profile.tenant_id;

    console.log(`[Recalc Stats] 🔧 Iniciando recálculo para tenant ${tenantId}`);

    // ========================================
    // 1. BUSCAR TODOS OS PEDIDOS VINCULADOS
    // ========================================
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('client_id, total, created_at')
      .eq('tenant_id', tenantId)
      .not('client_id', 'is', null);

    if (ordersError) {
      console.error('[Recalc Stats] Erro ao buscar pedidos:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    console.log(`[Recalc Stats] 📊 Processando ${orders?.length || 0} pedidos`);

    // ========================================
    // 2. CALCULAR STATS POR CLIENTE
    // ========================================
    const clientStats = new Map<string, { total: number; count: number; last: string }>();

    for (const order of orders || []) {
      if (!order.client_id) continue;

      const existing = clientStats.get(order.client_id) || { total: 0, count: 0, last: '' };
      existing.total += Number(order.total) || 0;
      existing.count += 1;
      
      if (!existing.last || order.created_at > existing.last) {
        existing.last = order.created_at;
      }

      clientStats.set(order.client_id, existing);
    }

    console.log(`[Recalc Stats] 👥 ${clientStats.size} clientes com pedidos`);

    // ========================================
    // 3. DETECTAR INCONSISTÊNCIAS
    // ========================================
    const { data: allClients } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, total_orders, ltv')
      .eq('tenant_id', tenantId);

    const inconsistencies = [];

    for (const client of allClients || []) {
      const stats = clientStats.get(client.id);
      const realTotalOrders = stats?.count || 0;
      const savedTotalOrders = client.total_orders || 0;
      const diff = realTotalOrders - savedTotalOrders;

      if (diff !== 0) {
        inconsistencies.push({
          id: client.id,
          name: client.name,
          phone: client.phone,
          old_total_orders: savedTotalOrders,
          new_total_orders: realTotalOrders,
          difference: diff,
          old_ltv: client.ltv || 0,
          new_ltv: stats?.total || 0
        });
      }
    }

    console.log(`[Recalc Stats] ⚠️  ${inconsistencies.length} inconsistências detectadas`);

    // ========================================
    // 4. ATUALIZAR CLIENTES COM PEDIDOS
    // ========================================
    const updates = Array.from(clientStats.entries()).map(([clientId, stats]) => ({
      id: clientId,
      tenant_id: tenantId,
      total_orders: stats.count,
      ltv: Math.round(stats.total * 100) / 100,
      avg_ticket: stats.count > 0 ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
      last_order_at: stats.last || null,
    }));

    let updated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      const { error: updateError } = await supabaseAdmin
        .from('clients')
        .upsert(batch, { onConflict: 'id' });

      if (updateError) {
        console.error('[Recalc Stats] Erro ao atualizar batch:', updateError);
      } else {
        updated += batch.length;
      }
    }

    console.log(`[Recalc Stats] ✅ ${updated} clientes atualizados`);

    // ========================================
    // 5. ZERAR CLIENTES SEM PEDIDOS
    // ========================================
    const clientsWithOrders = Array.from(clientStats.keys());
    const { data: clientsToZero } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .not('id', 'in', `(${clientsWithOrders.join(',') || 'null'})`);

    let zeroed = 0;
    if (clientsToZero && clientsToZero.length > 0) {
      const { error: zeroError } = await supabaseAdmin
        .from('clients')
        .update({ total_orders: 0, ltv: 0, avg_ticket: 0 })
        .in('id', clientsToZero.map(c => c.id));

      if (!zeroError) {
        zeroed = clientsToZero.length;
      }
    }

    console.log(`[Recalc Stats] 🔄 ${zeroed} clientes zerados (sem pedidos)`);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      summary: {
        total_orders_processed: orders?.length || 0,
        clients_updated: updated,
        clients_zeroed: zeroed,
        inconsistencies_found: inconsistencies.length,
        duration_ms: duration,
      },
      inconsistencies: inconsistencies.slice(0, 50), // Top 50
      message: `Recálculo concluído: ${updated} clientes atualizados, ${inconsistencies.length} inconsistências corrigidas`,
    });
  } catch (error: any) {
    console.error('[Recalc Stats] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Erro ao recalcular estatísticas', 
        details: error.message,
        duration_ms: Date.now() - startTime 
      },
      { status: 500 }
    );
  }
}
