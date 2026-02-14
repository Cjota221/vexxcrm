const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const TENANT = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function diagnose() {
  console.log('=== DIAGNÓSTICO DE IMPORTAÇÃO ===\n');

  // 1. Total clientes por source
  const { count: total } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  const { count: facilzap } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT).eq('source', 'facilzap');
  const { count: imported } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT).eq('source', 'import');
  const { count: other } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT).not('source', 'in', '("facilzap","import")');
  console.log(`Total: ${total} | FacilZap: ${facilzap} | Import: ${imported} | Outros: ${other}`);

  // 2. Clientes importados com LTV > 0
  const { count: withLtv } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT).eq('source', 'import').gt('ltv', 0);
  console.log(`Importados com LTV > 0: ${withLtv}`);

  // 3. Pegar nomes dos importados e verificar duplicatas com FacilZap
  const { data: importedClients } = await sb.from('clients').select('id,name,phone,phone_normalized,ltv,total_orders').eq('tenant_id', TENANT).eq('source', 'import');

  console.log(`\n--- Verificando duplicatas (import vs facilzap) ---`);
  let dupes = 0;
  for (const ic of importedClients || []) {
    if (!ic.phone_normalized) continue;
    const { data: matches } = await sb.from('clients')
      .select('id,name,phone_normalized,source,ltv,total_orders')
      .eq('tenant_id', TENANT)
      .eq('phone_normalized', ic.phone_normalized)
      .neq('id', ic.id);

    if (matches && matches.length > 0) {
      dupes++;
      console.log(`  DUPLICATA: "${ic.name}" (import, ltv:${ic.ltv}) vs "${matches[0].name}" (${matches[0].source}, ltv:${matches[0].ltv})`);
      console.log(`    phone_norm: ${ic.phone_normalized}`);
    }
  }
  console.log(`Total duplicatas encontradas: ${dupes}`);

  // 4. Clientes sem phone_normalized
  const { count: noPhone } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT).or('phone_normalized.is.null,phone_normalized.eq.');
  console.log(`\nClientes sem phone_normalized: ${noPhone}`);

  // 5. Verificar constraint unique
  console.log('\n--- Testando constraint unique ---');
  const testInsert = await sb.from('clients').upsert({
    tenant_id: TENANT,
    name: '__TEST_UNIQUE__',
    phone: '0000000000',
    phone_normalized: '0000000000',
    status: 'active',
    source: 'test',
  }, { onConflict: 'tenant_id,phone_normalized' });
  
  if (testInsert.error) {
    console.log('  Upsert FALHOU:', testInsert.error.message);
    if (testInsert.error.message.includes('there is no unique')) {
      console.log('  ⚠️ CONSTRAINT UNIQUE NÃO EXISTE! Upsert não funciona!');
    }
  } else {
    console.log('  Upsert OK. Limpando...');
    await sb.from('clients').delete().eq('phone_normalized', '0000000000').eq('tenant_id', TENANT);
  }
}

diagnose().catch(e => console.error(e));
