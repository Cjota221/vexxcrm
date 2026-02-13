const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function fetchAll(table, select, filter) {
  const all = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data } = await q;
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  // 1. Buscar token FacilZap
  const { data: tenants } = await sb.from('tenants').select('id, facilzap_token').limit(5);
  const tenant = tenants.find(t => t.facilzap_token);
  if (!tenant) { console.log('Sem token FacilZap!'); return; }
  console.log('Tenant:', tenant.id);
  
  // 2. Estado atual
  const allOrders = await fetchAll('orders', 'id, client_id, external_id, metadata', q => q.eq('tenant_id', tenant.id));
  const orphans = allOrders.filter(o => !o.client_id);
  const linked = allOrders.filter(o => o.client_id);
  console.log(`\nTotal pedidos: ${allOrders.length}`);
  console.log(`Vinculados: ${linked.length}`);
  console.log(`Órfãos: ${orphans.length}\n`);

  // 3. Analisar órfãos
  let semCliente = 0, comNome = 0, comFzId = 0;
  const sampleIds = [];
  for (const o of orphans) {
    const m = o.metadata || {};
    const hasName = !!m.cliente_nome;
    const hasFzId = !!m.cliente_id_facilzap;
    const hasPhone = !!(m.cliente_whatsapp || m.cliente_telefone);
    if (!hasName && !hasFzId && !hasPhone) semCliente++;
    if (hasName) comNome++;
    if (hasFzId) comFzId++;
    if (sampleIds.length < 10 && !hasPhone) sampleIds.push(o.external_id);
  }
  console.log('Órfãos sem dados de cliente:', semCliente);
  console.log('Órfãos com nome:', comNome);
  console.log('Órfãos com facilzap_id:', comFzId);
  console.log('\nAmostra external_ids sem telefone:', sampleIds.slice(0, 5));

  // 4. Buscar esses pedidos direto na API FacilZap para ver se tem cliente
  console.log('\n=== TESTANDO API FACILZAP ===');
  const fzToken = tenant.facilzap_token;
  
  // Buscar um pedido específico para ver estrutura do cliente
  for (const extId of sampleIds.slice(0, 3)) {
    try {
      const res = await fetch(`https://api.facilzap.app.br/pedidos/${extId}`, {
        headers: { Authorization: `Bearer ${fzToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const pedido = data.data || data;
        console.log(`\nPedido ${extId}:`);
        console.log('  cliente:', JSON.stringify(pedido.cliente || 'NULL').slice(0, 200));
        console.log('  whatsapp:', pedido.cliente?.whatsapp || 'N/A');
        console.log('  telefone:', pedido.cliente?.telefone || 'N/A');
        console.log('  nome:', pedido.cliente?.nome || 'N/A');
        console.log('  id_cliente:', pedido.cliente?.id || 'N/A');
      } else {
        console.log(`Pedido ${extId}: HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`Pedido ${extId}: Erro - ${e.message}`);
    }
  }

  // 5. Buscar uma página de pedidos da API para ver formato
  console.log('\n=== AMOSTRA DE PEDIDOS DA API ===');
  try {
    const res = await fetch('https://api.facilzap.app.br/pedidos?page=1&per_page=3', {
      headers: { Authorization: `Bearer ${fzToken}` }
    });
    const json = await res.json();
    const pedidos = json.data || [];
    for (const p of pedidos.slice(0, 2)) {
      console.log(`\nPedido API ${p.id}:`);
      console.log('  cliente keys:', Object.keys(p.cliente || {}).join(', '));
      console.log('  whatsapp:', p.cliente?.whatsapp || 'N/A');
      console.log('  telefone:', p.cliente?.telefone || 'N/A');
      console.log('  nome:', p.cliente?.nome || 'N/A');
    }
  } catch (e) {
    console.log('Erro ao buscar pedidos da API:', e.message);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
