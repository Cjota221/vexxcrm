/**
 * 🔧 RECALCULAR ESTATÍSTICAS DE TODOS OS CLIENTES
 * 
 * Este script corrige inconsistências entre clients.total_orders
 * e a quantidade real de pedidos na tabela orders
 * 
 * Execução: node scripts/recalc-all-stats.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dhknxyjsibqdrgwpgvob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa254eWpzaWJxZHJnd3Bndm9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjEwMTc4NiwiZXhwIjoyMDUxNjc3Nzg2fQ.DdOEn0nDmObHhLEk8xn-6OvVLn-Gj_WIFPd0hnTbQmQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function main() {
  console.log('━'.repeat(80));
  console.log('🔧 RECALCULANDO ESTATÍSTICAS DE TODOS OS CLIENTES');
  console.log('━'.repeat(80));
  console.log(`📍 Tenant: ${TENANT_ID}\n`);

  // ========================================
  // 1. BUSCAR TODOS OS PEDIDOS COM CLIENT_ID
  // ========================================
  console.log('1️⃣  Buscando todos os pedidos vinculados...');
  
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('client_id, total, created_at, status, payment_status')
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null);

  if (ordersError) {
    console.error('❌ Erro ao buscar pedidos:', ordersError);
    process.exit(1);
  }

  console.log(`✅ Encontrados ${orders?.length || 0} pedidos vinculados\n`);

  // ========================================
  // 2. AGRUPAR POR CLIENT_ID E CALCULAR STATS
  // ========================================
  console.log('2️⃣  Calculando estatísticas por cliente...');

  const clientStats = new Map();

  for (const order of orders || []) {
    const cid = order.client_id;
    if (!cid) continue;

    const existing = clientStats.get(cid) || {
      total_orders: 0,
      ltv: 0,
      last_order_at: null,
      orders: []
    };

    existing.total_orders += 1;
    existing.ltv += Number(order.total) || 0;
    existing.orders.push({
      created_at: order.created_at,
      total: order.total,
      status: order.status,
      payment_status: order.payment_status
    });

    if (!existing.last_order_at || order.created_at > existing.last_order_at) {
      existing.last_order_at = order.created_at;
    }

    clientStats.set(cid, existing);
  }

  console.log(`✅ Processados ${clientStats.size} clientes únicos\n`);

  // ========================================
  // 3. ATUALIZAR CLIENTS NO BANCO
  // ========================================
  console.log('3️⃣  Atualizando estatísticas no banco...');

  let updated = 0;
  let errors = 0;
  let inconsistencies = [];

  for (const [clientId, stats] of clientStats.entries()) {
    const avg_ticket = stats.total_orders > 0 ? stats.ltv / stats.total_orders : 0;

    // Buscar dados atuais do cliente para comparar
    const { data: currentClient } = await supabase
      .from('clients')
      .select('id, name, phone, total_orders, ltv, avg_ticket')
      .eq('id', clientId)
      .single();

    if (!currentClient) {
      console.log(`⚠️  Cliente ${clientId} não encontrado no banco`);
      continue;
    }

    // Detectar inconsistência
    const oldTotalOrders = currentClient.total_orders || 0;
    const newTotalOrders = stats.total_orders;
    const diff = newTotalOrders - oldTotalOrders;

    if (diff !== 0) {
      inconsistencies.push({
        id: clientId,
        name: currentClient.name,
        phone: currentClient.phone,
        old: oldTotalOrders,
        new: newTotalOrders,
        diff: diff
      });
    }

    // Atualizar
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        total_orders: stats.total_orders,
        ltv: stats.ltv,
        avg_ticket: avg_ticket,
        last_order_at: stats.last_order_at
      })
      .eq('id', clientId);

    if (updateError) {
      console.error(`❌ Erro ao atualizar ${clientId}:`, updateError.message);
      errors++;
    } else {
      updated++;
      if (updated % 100 === 0) {
        process.stdout.write(`   Processados: ${updated}/${clientStats.size}\r`);
      }
    }
  }

  console.log(`\n✅ Atualizados ${updated} clientes`);
  if (errors > 0) {
    console.log(`❌ Erros: ${errors}`);
  }

  // ========================================
  // 4. ZERAR STATS DE CLIENTES SEM PEDIDOS
  // ========================================
  console.log('\n4️⃣  Zerando stats de clientes sem pedidos...');

  const { data: clientsWithOrders } = await supabase
    .from('clients')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .not('id', 'in', `(${Array.from(clientStats.keys()).join(',')})`);

  if (clientsWithOrders && clientsWithOrders.length > 0) {
    const { error: zeroError } = await supabase
      .from('clients')
      .update({
        total_orders: 0,
        ltv: 0,
        avg_ticket: 0
      })
      .in('id', clientsWithOrders.map(c => c.id));

    if (zeroError) {
      console.error('❌ Erro ao zerar stats:', zeroError.message);
    } else {
      console.log(`✅ Zerados ${clientsWithOrders.length} clientes sem pedidos`);
    }
  }

  // ========================================
  // 5. RELATÓRIO DE INCONSISTÊNCIAS
  // ========================================
  if (inconsistencies.length > 0) {
    console.log('\n━'.repeat(80));
    console.log('⚠️  INCONSISTÊNCIAS ENCONTRADAS E CORRIGIDAS');
    console.log('━'.repeat(80));

    // Ordenar por diferença (maior primeiro)
    inconsistencies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    console.log(`\n📊 Total de clientes com diferenças: ${inconsistencies.length}\n`);

    // Top 20 maiores diferenças
    console.log('🔝 Top 20 maiores discrepâncias:\n');
    inconsistencies.slice(0, 20).forEach((item, idx) => {
      const emoji = item.diff > 0 ? '📈' : '📉';
      console.log(`${idx + 1}. ${emoji} ${item.name || 'Sem nome'}`);
      console.log(`   📞 ${item.phone || 'Sem telefone'}`);
      console.log(`   📊 Era: ${item.old} pedidos → Agora: ${item.new} pedidos (${item.diff > 0 ? '+' : ''}${item.diff})`);
      console.log();
    });

    // Estatísticas
    const totalDiff = inconsistencies.reduce((sum, i) => sum + Math.abs(i.diff), 0);
    const avgDiff = totalDiff / inconsistencies.length;
    const maxDiff = Math.max(...inconsistencies.map(i => Math.abs(i.diff)));

    console.log('📈 Estatísticas:');
    console.log(`   • Diferença total: ${totalDiff} pedidos`);
    console.log(`   • Diferença média: ${avgDiff.toFixed(2)} pedidos/cliente`);
    console.log(`   • Maior diferença: ${maxDiff} pedidos`);
  }

  console.log('\n━'.repeat(80));
  console.log('✅ RECÁLCULO CONCLUÍDO COM SUCESSO!');
  console.log('━'.repeat(80));
  console.log('\n💡 Recomendações:');
  console.log('   1. Recarregue a página de clientes para ver os dados atualizados');
  console.log('   2. Execute este script após cada sync manual do FacilZap');
  console.log('   3. Configure para rodar automaticamente após auto-sync');
  console.log();
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
