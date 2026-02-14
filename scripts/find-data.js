/**
 * 🔍 BUSCAR DADOS NO BANCO
 * Encontra tenants, clientes e pedidos no Supabase
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dhknxyjsibqdrgwpgvob.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa254eWpzaWJxZHJnd3Bndm9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjEwMTc4NiwiZXhwIjoyMDUxNjc3Nzg2fQ.DdOEn0nDmObHhLEk8xn-6OvVLn-Gj_WIFPd0hnTbQmQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🔍 BUSCANDO DADOS NO SUPABASE...\n');

  // Buscar todos os tenants
  console.log('1️⃣  Buscando Tenants...');
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('*')
    .limit(10);

  if (tenantsError) {
    console.log('❌ Erro ao buscar tenants:', tenantsError.message);
  } else {
    console.log(`✅ Encontrados ${tenants?.length || 0} tenants:`);
    tenants?.forEach(t => {
      console.log(`   • ${t.name || 'Sem nome'} (${t.id})`);
    });
  }

  // Buscar clientes (sem filtro de tenant)
  console.log('\n2️⃣  Buscando Clientes...');
  const { data: clients, error: clientsError, count: clientsCount } = await supabase
    .from('clients')
    .select('id, name, phone, tenant_id, total_orders', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10);

  if (clientsError) {
    console.log('❌ Erro ao buscar clientes:', clientsError.message);
  } else {
    console.log(`✅ Total de Clientes no banco: ${clientsCount || 0}`);
    console.log(`📋 Amostra dos 10 primeiros:`);
    clients?.forEach((c, idx) => {
      console.log(`   ${idx + 1}. ${c.name || 'Sem nome'} - ${c.phone || 'Sem tel'}`);
      console.log(`      Tenant: ${c.tenant_id}`);
      console.log(`      Pedidos: ${c.total_orders || 0}`);
    });
  }

  // Buscar pedidos (sem filtro de tenant)
  console.log('\n3️⃣  Buscando Pedidos...');
  const { data: orders, error: ordersError, count: ordersCount } = await supabase
    .from('orders')
    .select('id, order_number, total, client_id, tenant_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10);

  if (ordersError) {
    console.log('❌ Erro ao buscar pedidos:', ordersError.message);
  } else {
    console.log(`✅ Total de Pedidos no banco: ${ordersCount || 0}`);
    console.log(`📋 Amostra dos 10 primeiros:`);
    orders?.forEach((o, idx) => {
      console.log(`   ${idx + 1}. Pedido #${o.order_number || o.id}`);
      console.log(`      Valor: R$ ${(o.total || 0).toFixed(2)}`);
      console.log(`      Client ID: ${o.client_id || 'ÓRFÃO'}`);
      console.log(`      Tenant: ${o.tenant_id}`);
      console.log(`      Data: ${new Date(o.created_at).toLocaleDateString('pt-BR')}`);
    });
  }

  // Contar órfãos por tenant
  console.log('\n4️⃣  Analisando Órfãos por Tenant...');
  const { data: orphansByTenant } = await supabase
    .from('orders')
    .select('tenant_id')
    .is('client_id', null);

  if (orphansByTenant) {
    const tenantOrphans = orphansByTenant.reduce((acc, o) => {
      acc[o.tenant_id] = (acc[o.tenant_id] || 0) + 1;
      return acc;
    }, {});

    Object.entries(tenantOrphans).forEach(([tenantId, count]) => {
      console.log(`   • Tenant ${tenantId}: ${count} órfãos`);
    });
  }

  // Contar clientes com total_orders = 0
  console.log('\n5️⃣  Clientes com total_orders = 0...');
  const { count: zeroOrdersCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .or('total_orders.eq.0,total_orders.is.null');

  console.log(`   ⚠️  ${zeroOrdersCount || 0} clientes com total_orders = 0 ou null`);

  console.log('\n✅ Busca concluída!');
}

main().catch(console.error);
