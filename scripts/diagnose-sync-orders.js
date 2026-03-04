#!/usr/bin/env node

/**
 * Script de diagnóstico completo de sincronização de pedidos
 * Verifica:
 * 1. Pedidos órfãos (sem client_id)
 * 2. Clientes sem pedidos mas com dados no metadata
 * 3. Inconsistência entre total_orders e count real
 * 4. Pedidos duplicados
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('❌ Uso: node diagnose-sync-orders.js {tenantId}');
    process.exit(1);
  }

  console.log(`\n📊 DIAGNÓSTICO DE SINCRONIZAÇÃO - Tenant: ${tenantId}\n`);

  try {
    // 1. Contar pedidos órfãos
    console.log('1️⃣ Verificando pedidos órfãos (client_id = NULL)...');
    const { data: orphans, count: orphanCount } = await supabase
      .from('orders')
      .select('id,external_id,order_number,metadata', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('client_id', null)
      .order('created_at', { ascending: false });

    console.log(`   ⚠️ Encontrados ${orphanCount} pedidos órfãos\n`);
    if (orphanCount > 0 && orphanCount <= 10) {
      console.log('   Exemplos:');
      orphans.slice(0, 5).forEach((o, i) => {
        const clientPhone = o.metadata?.cliente_telefone || o.metadata?.cliente_whatsapp || 'N/A';
        const clientName = o.metadata?.cliente_nome || o.metadata?.cliente_name || 'N/A';
        console.log(`   [${i+1}] ${o.order_number} - ${clientName} (${clientPhone})`);
      });
    }

    // 2. Verificar inconsistência de total_orders
    console.log('\n2️⃣ Verificando inconsistência de total_orders...');
    const { data: clients } = await supabase
      .from('clients')
      .select('id,name,phone,total_orders')
      .eq('tenant_id', tenantId)
      .order('total_orders', { ascending: false })
      .limit(20);

    const inconsistencies = [];
    for (const client of clients || []) {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id);

      if (count !== Number(client.total_orders)) {
        inconsistencies.push({
          name: client.name,
          phone: client.phone,
          recorded: client.total_orders,
          actual: count,
        });
      }
    }

    if (inconsistencies.length > 0) {
      console.log(`   ⚠️ Encontradas ${inconsistencies.length} inconsistências\n`);
      inconsistencies.slice(0, 5).forEach((inc, i) => {
        console.log(`   [${i+1}] ${inc.name} (${inc.phone})`);
        console.log(`       Registrado: ${inc.recorded} | Real: ${inc.actual}`);
      });
    } else {
      console.log('   ✅ Nenhuma inconsistência encontrada\n');
    }

    // 3. Verificar pedidos recentes
    console.log('\n3️⃣ Verificando pedidos recentes...');
    const { data: recentOrders, count: recentCount } = await supabase
      .from('orders')
      .select('id,client_id,order_number,created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString())
      .order('created_at', { ascending: false });

    console.log(`   📦 Últimos 7 dias: ${recentCount} pedidos`);
    const recentOrphans = recentOrders.filter(o => !o.client_id).length;
    console.log(`   ⚠️ Órfãos nos últimos 7 dias: ${recentOrphans}\n`);

    // 4. Sugestões de ações
    console.log('4️⃣ Recomendações:\n');
    if (orphanCount > 0) {
      console.log(`   ⚠️ Execute: POST /api/facilzap/relink`);
      console.log(`      para vincular ${orphanCount} pedidos órfãos\n`);
    }
    if (inconsistencies.length > 0) {
      console.log('   ⚠️ Execute: POST /api/facilzap/recalc-stats');
      console.log(`      para recalcular stats de ${inconsistencies.length} clientes\n`);
    }

    // 5. Verificar status do último sync
    console.log('5️⃣ Histórico de sincronização:\n');
    const { data: recentsyncs } = await supabase
      .from('sync_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentsyncs && recentsyncs.length > 0) {
      recentsyncs.forEach((log, i) => {
        console.log(`   [${i+1}] ${new Date(log.created_at).toLocaleString()}`);
        console.log(`       Status: ${log.status} | Pedidos: ${log.orders_synced || 0}`);
      });
    } else {
      console.log('   ℹ️ Sem histórico de sync encontrado');
    }

    console.log('\n✅ Diagnóstico concluído\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
