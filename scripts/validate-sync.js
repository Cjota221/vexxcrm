#!/usr/bin/env node

/**
 * Script para validar sincronização de pedidos
 * Mostra status ANTES e DEPOIS das correções
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getStatus(tenantId) {
  // 1. Contar pedidos órfãos
  const { count: orphanCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('client_id', null);

  // 2. Contar inconsistências de total_orders
  const { data: clients } = await supabase
    .from('clients')
    .select('id, total_orders')
    .eq('tenant_id', tenantId);

  let inconsistencies = 0;
  for (const client of clients || []) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('client_id', client.id);
    
    if (count !== Number(client.total_orders)) {
      inconsistencies++;
    }
  }

  // 3. Contar clientes com 0 pedidos registrados mas com pedidos reais
  let zeroButHasOrders = 0;
  for (const client of clients || []) {
    if (client.total_orders === 0) {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id);
      
      if (count > 0) {
        zeroButHasOrders++;
      }
    }
  }

  return {
    orphanCount,
    inconsistencies,
    zeroButHasOrders,
    totalClients: clients?.length || 0,
  };
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('❌ Uso: node validate-sync.js {tenantId}');
    process.exit(1);
  }

  console.log(`\n📊 VALIDAÇÃO DE SINCRONIZAÇÃO - Tenant: ${tenantId}\n`);

  // Status ANTES
  console.log('🔍 Status ATUAL...\n');
  const before = await getStatus(tenantId);

  console.log('📈 Resultado:');
  console.log(`   ⚠️ Pedidos órfãos: ${before.orphanCount}`);
  console.log(`   ⚠️ Inconsistências de total_orders: ${before.inconsistencies}`);
  console.log(`   ⚠️ Clientes com 0 registrado mas com pedidos: ${before.zeroButHasOrders}`);
  console.log(`   ℹ️ Total de clientes: ${before.totalClients}\n`);

  // Health check
  const health = before.orphanCount + before.inconsistencies + before.zeroButHasOrders;
  const percentHealthy = 100 - ((health / before.totalClients) * 100);

  console.log('🏥 Health Score:');
  console.log(`   ${percentHealthy.toFixed(1)}% saudável (meta: >95%)\n`);

  // Recomendações
  console.log('💡 Recomendações:\n');

  if (before.orphanCount > 0) {
    console.log(`   1️⃣ Vincular ${before.orphanCount} pedidos órfãos:`);
    console.log('      curl -X POST http://localhost:3000/api/facilzap/relink-orphans \\');
    console.log('        -H "Authorization: Bearer {token}"');
    console.log('');
  }

  if (before.inconsistencies > 0 || before.zeroButHasOrders > 0) {
    console.log(`   2️⃣ Recalcular stats de ${before.inconsistencies || before.zeroButHasOrders} clientes:`);
    console.log('      curl -X POST http://localhost:3000/api/facilzap/recalc-stats \\');
    console.log('        -H "Authorization: Bearer {token}"');
    console.log('');
  }

  if (health === 0) {
    console.log('   ✅ Nenhum problema detectado!');
    console.log('');
  }

  // Aguardar confirmação para testar corações
  if (health > 0) {
    console.log('⏳ Execute as ações acima e depois rode novamente para validar.\n');
  }
}

main().catch(console.error);
