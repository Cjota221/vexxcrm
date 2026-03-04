import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';

/**
 * POST /api/facilzap/recalc-stats
 * 
 * Recalcula as estatísticas (total_orders, ltv, avg_ticket, last_order_at)
 * para TODOS os clientes do tenant, garantindo consistência máxima
 */
async function recalcStatsHandler(request: NextRequest) {
  const startTime = Date.now();
  console.log('[RecalcStats] 🔢 Iniciando recalcule de stats para todos os clientes');

  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { supabase: supabaseAdmin, tenantId } = auth;

    // 1️⃣ Buscar TODOS os pedidos confirmados/vinculados
    console.log('[RecalcStats] Buscando todos os pedidos vinculados...');
    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('id, client_id, total, created_at, status')
      .eq('tenant_id', tenantId)
      .not('client_id', 'is', null)
      .order('created_at', { ascending: false });

    console.log(`[RecalcStats] Total de pedidos vinculados: ${allOrders?.length || 0}`);

    // 2️⃣ Agrupar por cliente e calcular stats
    const clientStats = new Map<string, {
      total: number;
      count: number;
      last: string;
      delivered_count: number;
    }>();

    for (const order of allOrders || []) {
      if (!order.client_id) continue;

      const existing = clientStats.get(order.client_id) || {
        total: 0,
        count: 0,
        last: '',
        delivered_count: 0,
      };

      existing.total += Number(order.total) || 0;
      existing.count += 1;

      if (order.status === 'delivered') {
        existing.delivered_count += 1;
      }

      if (!existing.last || order.created_at > existing.last) {
        existing.last = order.created_at;
      }

      clientStats.set(order.client_id, existing);
    }

    console.log(`[RecalcStats] Calculados stats de ${clientStats.size} clientes`);

    // 3️⃣ Buscar clientes atuais para comparison
    console.log('[RecalcStats] Carregando clientes existentes...');
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId);

    // 4️⃣ Preparar updates (clientes com pedidos + clientes sem pedidos)
    const updates = [];

    // Clientes COM pedidos
    for (const [clientId, stats] of clientStats.entries()) {
      updates.push({
        id: clientId,
        tenant_id: tenantId,
        total_orders: stats.count,
        ltv: Math.round(stats.total * 100) / 100,
        avg_ticket: stats.count > 0 ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
        last_order_at: stats.last || null,
      });
    }

    // Clientes SEM pedidos (resetar para 0)
    for (const client of clients || []) {
      if (!clientStats.has(client.id)) {
        updates.push({
          id: client.id,
          tenant_id: tenantId,
          total_orders: 0,
          ltv: 0,
          avg_ticket: 0,
          last_order_at: null,
        });
      }
    }

    console.log(`[RecalcStats] Preparados ${updates.length} updates (${clientStats.size} com pedidos, ${(clients?.length || 0) - clientStats.size} sem)`);

    // 5️⃣ Aplicar updates em batch
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updates.length; i += 50) {
      if (Date.now() - startTime > 25000) {
        console.warn(`[RecalcStats] ⏱️ Timeout de 25s atingido, parando batch em ${i}/${updates.length}`);
        break;
      }

      const batch = updates.slice(i, i + 50);
      const { error } = await supabaseAdmin
        .from('clients')
        .upsert(batch, { onConflict: 'id' });

      if (!error) {
        successCount += batch.length;
      } else {
        console.error(`[RecalcStats] ❌ Erro no batch ${i}-${i + batch.length}:`, error.message);
        errorCount += batch.length;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[RecalcStats] ✅ Concluído em ${elapsed}ms: ${successCount} atualizados, ${errorCount} erros`);

    return NextResponse.json({
      success: true,
      updated: successCount,
      errors: errorCount,
      total_updates: updates.length,
      clients_with_orders: clientStats.size,
      clients_without_orders: (clients?.length || 0) - clientStats.size,
      duration_ms: elapsed,
    });

  } catch (error: any) {
    console.error('[RecalcStats] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao recalcular stats', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return recalcStatsHandler(request);
}
