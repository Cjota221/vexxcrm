// Diagnóstico: testar diferentes endpoints e params da FacilZap
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const FZ_API = 'https://api.facilzap.app.br';

async function main() {
  const { data: tenants } = await sb.from('tenants').select('id, facilzap_token');
  const tenant = tenants.find(t => t.facilzap_token);
  const token = tenant.facilzap_token;

  // Testar sem data
  console.log('--- Teste 1: /pedidos sem params ---');
  let res = await fetch(`${FZ_API}/pedidos`, { headers: { Authorization: `Bearer ${token}` } });
  let json = await res.json();
  console.log('Status:', res.status);
  console.log('Keys:', Object.keys(json));
  console.log('Total:', json.total);
  console.log('Last page:', json.last_page);
  console.log('Per page:', json.per_page);
  console.log('Current page:', json.current_page);
  console.log('Data length:', json.data?.length);
  
  // Teste com per_page=100
  console.log('\n--- Teste 2: /pedidos?per_page=100 ---');
  res = await fetch(`${FZ_API}/pedidos?per_page=100`, { headers: { Authorization: `Bearer ${token}` } });
  json = await res.json();
  console.log('Total:', json.total);
  console.log('Last page:', json.last_page);
  console.log('Data length:', json.data?.length);
  
  // Teste com data_inicial longa
  const di = new Date(); di.setFullYear(di.getFullYear() - 5);
  const diStr = di.toISOString().split('T')[0];
  const dfStr = new Date().toISOString().split('T')[0];
  console.log(`\n--- Teste 3: /pedidos?data_inicial=${diStr}&data_final=${dfStr} ---`);
  res = await fetch(`${FZ_API}/pedidos?data_inicial=${diStr}&data_final=${dfStr}`, { headers: { Authorization: `Bearer ${token}` } });
  json = await res.json();
  console.log('Total:', json.total);
  console.log('Last page:', json.last_page);
  console.log('Data length:', json.data?.length);
  
  // Teste com 1 ano
  const di2 = new Date(); di2.setFullYear(di2.getFullYear() - 1);
  console.log(`\n--- Teste 4: /pedidos?data_inicial=${di2.toISOString().split('T')[0]}&data_final=${dfStr} ---`);
  res = await fetch(`${FZ_API}/pedidos?data_inicial=${di2.toISOString().split('T')[0]}&data_final=${dfStr}`, { headers: { Authorization: `Bearer ${token}` } });
  json = await res.json();
  console.log('Total:', json.total);
  console.log('Last page:', json.last_page);
  console.log('Data length:', json.data?.length);
  
  // Teste com 2 anos
  const di3 = new Date(); di3.setFullYear(di3.getFullYear() - 2);
  console.log(`\n--- Teste 5: /pedidos?data_inicial=${di3.toISOString().split('T')[0]}&data_final=${dfStr}&per_page=100 ---`);
  res = await fetch(`${FZ_API}/pedidos?data_inicial=${di3.toISOString().split('T')[0]}&data_final=${dfStr}&per_page=100`, { headers: { Authorization: `Bearer ${token}` } });
  json = await res.json();
  console.log('Total:', json.total);
  console.log('Last page:', json.last_page);
  console.log('Data length:', json.data?.length);

  // Teste endpoint /vendas
  console.log('\n--- Teste 6: /vendas ---');
  res = await fetch(`${FZ_API}/vendas`, { headers: { Authorization: `Bearer ${token}` } });
  console.log('Status:', res.status);
  if (res.ok) {
    json = await res.json();
    console.log('Keys:', Object.keys(json));
    console.log('Total:', json.total);
    console.log('Data length:', json.data?.length);
  }
}

main().catch(e => console.error(e));
