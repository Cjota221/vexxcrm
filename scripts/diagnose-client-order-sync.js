/**
 * 🔍 DIAGNÓSTICO COMPLETO: Inconsistência Cliente-Pedido
 * 
 * Este script investiga problemas de vinculação entre clientes e pedidos
 * Analisa: órfãos, total_orders desatualizado, integridade referencial
 */

const { createClient } = require('@supabase/supabase-js');

// Configurações - substituir pelos valores reais
const SUPABASE_URL = 'https://dhknxyjsibqdrgwpgvob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa254eWpzaWJxZHJnd3Bndm9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjEwMTc4NiwiZXhwIjoyMDUxNjc3Nzg2fQ.DdOEn0nDmObHhLEk8xn-6OvVLn-Gj_WIFPd0hnTbQmQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function main() {
  console.log('━'.repeat(80));
  console.log('🔍 DIAGNÓSTICO: Inconsistência Cliente-Pedido');
  console.log('━'.repeat(80));

  // ========================================
  // 1. VISÃO GERAL DO BANCO
  // ========================================
  console.log('\n📊 1. VISÃO GERAL DO BANCO DE DADOS');
  console.log('─'.repeat(80));

  const { data: clientsCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  const { data: ordersCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  console.log(`✅ Total de Clientes: ${clientsCount?.length || 0}`);
  console.log(`✅ Total de Pedidos: ${ordersCount?.length || 0}`);

  // ========================================
  // 2. PEDIDOS ÓRFÃOS (sem client_id)
  // ========================================
  console.log('\n🔴 2. PEDIDOS ÓRFÃOS (sem client_id)');
  console.log('─'.repeat(80));

  const { data: orphanOrders, count: orphanCount } = await supabase
    .from('orders')
    .select('id, order_number, total, created_at, metadata', { count: 'exact' })
    .eq('tenant_id', TENANT_ID)
    .is('client_id', null)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`❌ Total de Pedidos Órfãos: ${orphanCount || 0}`);
  
  if (orphanOrders && orphanOrders.length > 0) {
    console.log('\n📋 Amostra dos 10 primeiros órfãos:');
    orphanOrders.forEach((order, idx) => {
      const meta = order.metadata || {};
      console.log(`\n  ${idx + 1}. Pedido #${order.order_number || order.id}`);
      console.log(`     💰 Valor: R$ ${(order.total || 0).toFixed(2)}`);
      console.log(`     📅 Data: ${new Date(order.created_at).toLocaleDateString('pt-BR')}`);
      console.log(`     📞 Tel Metadata: ${meta.cliente_telefone || meta.cliente_whatsapp || 'N/A'}`);
      console.log(`     📧 Email Metadata: ${meta.cliente_email || 'N/A'}`);
      console.log(`     🆔 CPF Metadata: ${meta.cliente_cpf_cnpj || 'N/A'}`);
      console.log(`     🏢 FacilZap ID: ${meta.cliente_id_facilzap || 'N/A'}`);
    });
  }

  // ========================================
  // 3. CLIENTES COM total_orders = 0 MAS TEM PEDIDOS
  // ========================================
  console.log('\n\n⚠️  3. CLIENTES COM total_orders = 0 MAS QUE TÊM PEDIDOS NO BANCO');
  console.log('─'.repeat(80));

  const { data: clientsZero } = await supabase
    .from('clients')
    .select('id, name, phone, total_orders')
    .eq('tenant_id', TENANT_ID)
    .or('total_orders.eq.0,total_orders.is.null')
    .limit(100);

  let inconsistentClients = [];

  for (const client of clientsZero || []) {
    const { count: actualOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('client_id', client.id);

    if (actualOrders && actualOrders > 0) {
      inconsistentClients.push({
        ...client,
        actualOrders
      });
    }
  }

  console.log(`❌ Clientes Inconsistentes: ${inconsistentClients.length}`);
  
  if (inconsistentClients.length > 0) {
    console.log('\n📋 Clientes com total_orders desatualizado:');
    inconsistentClients.slice(0, 10).forEach((client, idx) => {
      console.log(`\n  ${idx + 1}. ${client.name || 'Sem nome'}`);
      console.log(`     📞 ${client.phone || 'Sem telefone'}`);
      console.log(`     🔢 total_orders salvo: ${client.total_orders || 0}`);
      console.log(`     ✅ Pedidos reais no banco: ${client.actualOrders}`);
      console.log(`     ⚠️  Diferença: ${client.actualOrders - (client.total_orders || 0)}`);
    });
  }

  // ========================================
  // 4. PEDIDOS COM client_id INVÁLIDO (FK quebrada)
  // ========================================
  console.log('\n\n🔗 4. PEDIDOS COM client_id INVÁLIDO (Foreign Key quebrada)');
  console.log('─'.repeat(80));

  const { data: ordersWithClient } = await supabase
    .from('orders')
    .select('id, client_id, order_number, total')
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null)
    .limit(1000);

  let brokenFKs = [];
  const clientIds = [...new Set(ordersWithClient?.map(o => o.client_id).filter(Boolean) || [])];

  // Verificar se os clientes existem
  const { data: existingClients } = await supabase
    .from('clients')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .in('id', clientIds);

  const existingClientIds = new Set(existingClients?.map(c => c.id) || []);

  for (const order of ordersWithClient || []) {
    if (order.client_id && !existingClientIds.has(order.client_id)) {
      brokenFKs.push(order);
    }
  }

  console.log(`❌ Pedidos com client_id inválido: ${brokenFKs.length}`);
  
  if (brokenFKs.length > 0) {
    console.log('\n📋 Amostra de pedidos com FK quebrada:');
    brokenFKs.slice(0, 5).forEach((order, idx) => {
      console.log(`  ${idx + 1}. Pedido #${order.order_number || order.id}`);
      console.log(`     🆔 client_id: ${order.client_id}`);
      console.log(`     💰 Valor: R$ ${(order.total || 0).toFixed(2)}`);
    });
  }

  // ========================================
  // 5. ANÁLISE DE METADATA DOS ÓRFÃOS
  // ========================================
  console.log('\n\n🔎 5. ANÁLISE DE METADATA DOS PEDIDOS ÓRFÃOS');
  console.log('─'.repeat(80));

  if (orphanOrders && orphanOrders.length > 0) {
    let withPhone = 0, withEmail = 0, withCPF = 0, withFzId = 0, withNothing = 0;

    orphanOrders.forEach(order => {
      const meta = order.metadata || {};
      const hasPhone = meta.cliente_telefone || meta.cliente_whatsapp || meta.cliente_whatsapp_e164;
      const hasEmail = meta.cliente_email;
      const hasCPF = meta.cliente_cpf_cnpj;
      const hasFzId = meta.cliente_id_facilzap;

      if (hasPhone) withPhone++;
      if (hasEmail) withEmail++;
      if (hasCPF) withCPF++;
      if (hasFzId) withFzId++;
      if (!hasPhone && !hasEmail && !hasCPF && !hasFzId) withNothing++;
    });

    console.log(`📞 Com Telefone: ${withPhone}/${orphanOrders.length}`);
    console.log(`📧 Com Email: ${withEmail}/${orphanOrders.length}`);
    console.log(`🆔 Com CPF: ${withCPF}/${orphanOrders.length}`);
    console.log(`🏢 Com FacilZap ID: ${withFzId}/${orphanOrders.length}`);
    console.log(`❌ Sem nenhum identificador: ${withNothing}/${orphanOrders.length}`);
  }

  // ========================================
  // 6. CLIENTES DUPLICADOS (mesmo telefone)
  // ========================================
  console.log('\n\n👥 6. CLIENTES DUPLICADOS (mesmo telefone)');
  console.log('─'.repeat(80));

  const { data: allClients } = await supabase
    .from('clients')
    .select('id, name, phone, total_orders')
    .eq('tenant_id', TENANT_ID)
    .not('phone', 'is', null);

  const phoneMap = new Map();
  for (const client of allClients || []) {
    const cleanPhone = client.phone?.replace(/\D/g, '');
    if (!cleanPhone) continue;

    if (!phoneMap.has(cleanPhone)) {
      phoneMap.set(cleanPhone, []);
    }
    phoneMap.get(cleanPhone).push(client);
  }

  const duplicates = Array.from(phoneMap.entries())
    .filter(([_, clients]) => clients.length > 1)
    .map(([phone, clients]) => ({ phone, clients }));

  console.log(`❌ Telefones duplicados: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('\n📋 Amostra de duplicações:');
    duplicates.slice(0, 5).forEach((dup, idx) => {
      console.log(`\n  ${idx + 1}. Telefone: ${dup.phone}`);
      dup.clients.forEach((client, cidx) => {
        console.log(`     ${cidx + 1}. ${client.name || 'Sem nome'} - ${client.total_orders || 0} pedidos`);
      });
    });
  }

  // ========================================
  // 7. RESUMO E RECOMENDAÇÕES
  // ========================================
  console.log('\n\n━'.repeat(80));
  console.log('📋 RESUMO DO DIAGNÓSTICO');
  console.log('━'.repeat(80));

  console.log(`\n🔴 PROBLEMAS CRÍTICOS:`);
  console.log(`   • ${orphanCount || 0} pedidos órfãos (sem client_id)`);
  console.log(`   • ${inconsistentClients.length} clientes com total_orders desatualizado`);
  console.log(`   • ${brokenFKs.length} pedidos com client_id inválido`);
  console.log(`   • ${duplicates.length} telefones duplicados`);

  console.log(`\n✅ RECOMENDAÇÕES:`);
  
  if ((orphanCount || 0) > 0) {
    console.log(`\n   1. 🔧 Executar RE-VINCULAÇÃO de órfãos:`);
    console.log(`      → POST /api/facilzap/relink`);
    console.log(`      → Isso tentará vincular pedidos órfãos usando telefone/CPF/email`);
  }

  if (inconsistentClients.length > 0) {
    console.log(`\n   2. 🔄 RECALCULAR total_orders:`);
    console.log(`      → Após re-vincular, execute script de atualização de stats`);
    console.log(`      → Isso sincronizará total_orders, ltv, avg_ticket`);
  }

  if (brokenFKs.length > 0) {
    console.log(`\n   3. 🗑️  LIMPAR FKs quebradas:`);
    console.log(`      → Setar client_id=null para pedidos com cliente inexistente`);
    console.log(`      → Depois tentar re-vincular novamente`);
  }

  if (duplicates.length > 0) {
    console.log(`\n   4. 👥 MESCLAR clientes duplicados:`);
    console.log(`      → Criar endpoint para merge de clientes duplicados`);
    console.log(`      → Transferir pedidos para cliente principal`);
  }

  console.log('\n━'.repeat(80));
  console.log('✅ Diagnóstico concluído!');
  console.log('━'.repeat(80));
}

main().catch(console.error);
