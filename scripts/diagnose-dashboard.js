const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const TID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function run() {
  console.log('=== DIAGNÓSTICO DASHBOARD ===\n');

  // 1. Total de pedidos
  const { count: totalOrders } = await sb
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TID);
  console.log('Total pedidos:', totalOrders);

  // 2. Faturamento total (todos os pedidos) - paginar para pegar todos
  let allOrders = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('orders')
      .select('total, status, payment_status, items')
      .eq('tenant_id', TID)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { console.error('Erro:', error); break; }
    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  console.log('Pedidos carregados:', allOrders.length);

  const fatTotal = allOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  console.log('Faturamento TOTAL (todos):', fatTotal.toFixed(2));

  // 3. Faturamento só dos pagos
  const paidOrders = allOrders.filter(o => o.payment_status === 'paid');
  const fatPaid = paidOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  console.log('Faturamento PAGOS:', fatPaid.toFixed(2), '(' + paidOrders.length + ' pedidos)');

  // 4. Verificar payment_status distribution
  const statusDist = {};
  allOrders.forEach(o => {
    const ps = o.payment_status || 'null';
    statusDist[ps] = (statusDist[ps] || 0) + 1;
  });
  console.log('\nDistribuição payment_status:', JSON.stringify(statusDist, null, 2));

  // 5. Verificar order status distribution
  const orderStatusDist = {};
  allOrders.forEach(o => {
    const s = o.status || 'null';
    orderStatusDist[s] = (orderStatusDist[s] || 0) + 1;
  });
  console.log('Distribuição status:', JSON.stringify(orderStatusDist, null, 2));

  // 6. Total de peças vendidas (items)
  let totalPecas = 0;
  let ordersWithItems = 0;
  let ordersWithoutItems = 0;
  allOrders.forEach(o => {
    if (Array.isArray(o.items) && o.items.length > 0) {
      ordersWithItems++;
      o.items.forEach(item => {
        totalPecas += Number(item.quantity || item.quantidade || 1);
      });
    } else {
      ordersWithoutItems++;
    }
  });
  console.log('\nTotal peças vendidas:', totalPecas);
  console.log('Pedidos COM items:', ordersWithItems);
  console.log('Pedidos SEM items:', ordersWithoutItems);

  // 7. Sample dos 3 primeiros pedidos para ver a estrutura
  console.log('\n--- Sample 3 pedidos ---');
  const { data: sample } = await sb
    .from('orders')
    .select('id, total, status, payment_status, items, created_at')
    .eq('tenant_id', TID)
    .order('created_at', { ascending: false })
    .limit(3);
  sample.forEach((o, i) => {
    console.log(`\nPedido ${i+1}:`, {
      total: o.total,
      status: o.status,
      payment_status: o.payment_status,
      items_count: Array.isArray(o.items) ? o.items.length : 'N/A',
      items_type: typeof o.items,
      created_at: o.created_at
    });
    if (Array.isArray(o.items) && o.items[0]) {
      console.log('  Item 0:', JSON.stringify(o.items[0]).substring(0, 200));
    }
  });
}

run().catch(console.error);
