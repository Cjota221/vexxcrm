const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const TENANT = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function test() {
  // Simular exatamente o que a API /api/clients faz
  console.log('=== Simulando API /api/clients ===\n');

  // Sem filtros, page 1, ordenado por created_at DESC
  const { data, error, count } = await sb
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .range(0, 29);

  if (error) {
    console.log('Erro:', error.message);
    return;
  }

  console.log(`Total: ${count} | Página 1: ${data.length} resultados`);
  console.log('\nPrimeiros 10:');
  data.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i+1}. ${c.name} | src:${c.source} | ltv:${c.ltv} | orders:${c.total_orders} | created:${c.created_at?.substring(0,10)}`);
  });

  // Verificar se importados estão na lista
  const importedInPage = data.filter(c => c.source === 'import');
  console.log(`\nImportados nesta página: ${importedInPage.length}`);

  // Buscar pelo nome
  console.log('\n--- Busca por "Nigel" ---');
  const { data: d2, count: c2 } = await sb
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('tenant_id', TENANT)
    .or('name.ilike.%Nigel%,phone.ilike.%Nigel%')
    .order('created_at', { ascending: false })
    .range(0, 29);

  console.log(`Resultados: ${c2}`);
  d2?.forEach(c => console.log(`  - ${c.name} | src:${c.source} | ltv:${c.ltv}`));

  // Verificar campos problemáticos dos importados
  console.log('\n--- Campos dos importados ---');
  const { data: imported } = await sb
    .from('clients')
    .select('id,name,phone,phone_normalized,email,status,source,ltv,total_orders,avg_ticket,tags,notes,address_city')
    .eq('tenant_id', TENANT)
    .eq('source', 'import')
    .limit(5);
    
  imported?.forEach(c => {
    console.log(`\n  ${c.name}:`);
    console.log(`    phone: ${c.phone} | norm: ${c.phone_normalized}`);
    console.log(`    status: ${c.status} | ltv: ${c.ltv} | orders: ${c.total_orders}`);
    console.log(`    email: ${c.email} | city: ${c.address_city}`);
    console.log(`    tags: ${JSON.stringify(c.tags)} | notes: ${c.notes?.substring(0,50)}`);
  });
}

test().catch(e => console.error(e));
