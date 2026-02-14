import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/maintenance/health-check
 * Verifica saúde dos dados: órfãos, inconsistências, duplicações
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabaseAdmin = createServerSupabaseClient();

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

    console.log(`[Health Check] 🏥 Verificando saúde dos dados para tenant ${tenantId}`);

    // ========================================
    // 1. CONTAR PEDIDOS ÓRFÃOS
    // ========================================
    const { count: orphansCount } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('client_id', null);

    // ========================================
    // 2. DETECTAR INCONSISTÊNCIAS
    // ========================================
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('client_id, total')
      .eq('tenant_id', tenantId)
      .not('client_id', 'is', null);

    const clientStats = new Map<string, number>();
    for (const order of orders || []) {
      if (!order.client_id) continue;
      clientStats.set(order.client_id, (clientStats.get(order.client_id) || 0) + 1);
    }

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, total_orders')
      .eq('tenant_id', tenantId)
      .in('id', Array.from(clientStats.keys()));

    const inconsistencies = [];
    for (const client of clients || []) {
      const realCount = clientStats.get(client.id) || 0;
      const savedCount = client.total_orders || 0;
      if (realCount !== savedCount) {
        inconsistencies.push({
          id: client.id,
          name: client.name,
          phone: client.phone,
          saved: savedCount,
          real: realCount,
          diff: realCount - savedCount,
        });
      }
    }

    // ========================================
    // 3. CLIENTES SEM PEDIDOS MAS COM total_orders > 0
    // ========================================
    const { data: clientsWithFakeOrders } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, total_orders')
      .eq('tenant_id', tenantId)
      .gt('total_orders', 0)
      .not('id', 'in', `(${Array.from(clientStats.keys()).join(',') || 'null'})`);

    // ========================================
    // 4. TELEFONES DUPLICADOS
    // ========================================
    const { data: allClients } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, total_orders')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    const phoneMap = new Map<string, any[]>();
    for (const client of allClients || []) {
      const cleanPhone = client.phone?.replace(/\D/g, '');
      if (!cleanPhone) continue;
      if (!phoneMap.has(cleanPhone)) {
        phoneMap.set(cleanPhone, []);
      }
      phoneMap.get(cleanPhone)!.push(client);
    }

    const duplicates = Array.from(phoneMap.entries())
      .filter(([_, clients]) => clients.length > 1)
      .map(([phone, clients]) => ({
        phone,
        count: clients.length,
        clients: clients.map(c => ({ id: c.id, name: c.name, total_orders: c.total_orders }))
      }));

    // ========================================
    // 5. TOTAIS GERAIS
    // ========================================
    const { count: totalClients } = await supabaseAdmin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { count: totalOrders } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // ========================================
    // 6. CALCULAR SCORE DE SAÚDE
    // ========================================
    const orphansPercent = totalOrders ? (orphansCount || 0) / totalOrders * 100 : 0;
    const inconsistenciesPercent = totalClients ? inconsistencies.length / totalClients * 100 : 0;
    const duplicatesPercent = totalClients ? duplicates.length / totalClients * 100 : 0;

    let healthScore = 100;
    healthScore -= Math.min(orphansPercent * 2, 30); // Max -30 por órfãos
    healthScore -= Math.min(inconsistenciesPercent * 1.5, 30); // Max -30 por inconsistências
    healthScore -= Math.min(duplicatesPercent * 1, 20); // Max -20 por duplicações
    healthScore = Math.max(0, Math.round(healthScore));

    let healthStatus: 'excellent' | 'good' | 'warning' | 'critical';
    if (healthScore >= 90) healthStatus = 'excellent';
    else if (healthScore >= 70) healthStatus = 'good';
    else if (healthScore >= 50) healthStatus = 'warning';
    else healthStatus = 'critical';

    const result = {
      health_score: healthScore,
      health_status: healthStatus,
      timestamp: new Date().toISOString(),
      
      summary: {
        total_clients: totalClients || 0,
        total_orders: totalOrders || 0,
        orphan_orders: orphansCount || 0,
        inconsistent_clients: inconsistencies.length,
        clients_with_fake_orders: clientsWithFakeOrders?.length || 0,
        duplicate_phones: duplicates.length,
      },

      issues: {
        orphans: {
          count: orphansCount || 0,
          percentage: Math.round(orphansPercent * 10) / 10,
          severity: orphansPercent > 15 ? 'critical' : orphansPercent > 5 ? 'warning' : 'ok',
        },
        inconsistencies: {
          count: inconsistencies.length,
          percentage: Math.round(inconsistenciesPercent * 10) / 10,
          severity: inconsistenciesPercent > 10 ? 'critical' : inconsistenciesPercent > 3 ? 'warning' : 'ok',
          top_10: inconsistencies
            .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
            .slice(0, 10),
        },
        fake_orders: {
          count: clientsWithFakeOrders?.length || 0,
          severity: (clientsWithFakeOrders?.length || 0) > 50 ? 'warning' : 'ok',
          examples: clientsWithFakeOrders?.slice(0, 5) || [],
        },
        duplicates: {
          count: duplicates.length,
          percentage: Math.round(duplicatesPercent * 10) / 10,
          severity: duplicatesPercent > 5 ? 'warning' : 'ok',
          top_5: duplicates.slice(0, 5),
        },
      },

      recommendations: []
    };

    // Adicionar recomendações
    if (orphansCount && orphansCount > 0) {
      result.recommendations.push({
        priority: orphansPercent > 15 ? 'high' : 'medium',
        action: 'relink_orphans',
        message: `Execute POST /api/facilzap/relink para vincular ${orphansCount} pedidos órfãos`,
      });
    }

    if (inconsistencies.length > 0) {
      result.recommendations.push({
        priority: inconsistenciesPercent > 10 ? 'high' : 'medium',
        action: 'recalc_stats',
        message: `Execute POST /api/maintenance/recalc-stats para corrigir ${inconsistencies.length} inconsistências`,
      });
    }

    if (duplicates.length > 0) {
      result.recommendations.push({
        priority: 'low',
        action: 'merge_duplicates',
        message: `${duplicates.length} telefones duplicados detectados. Considere implementar merge de clientes.`,
      });
    }

    console.log(`[Health Check] ✅ Score: ${healthScore}/100 (${healthStatus})`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Health Check] Erro:', error);
    return NextResponse.json(
      { error: 'Erro no health check', details: error.message },
      { status: 500 }
    );
  }
}
