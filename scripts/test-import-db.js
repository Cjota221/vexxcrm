const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

(async () => {
  // 1. Verificar constraints
  const { data: constraints, error: cErr } = await sb.rpc('exec_sql', {
    query: "SELECT conname, contype FROM pg_constraint WHERE conrelid='clients'::regclass AND contype='u'"
  });
  
  if (cErr) {
    console.log('RPC não disponível, verificando de outra forma...');
  } else {
    console.log('Constraints:', JSON.stringify(constraints, null, 2));
  }
  
  // 2. Testar insert básico para ver se funciona
  const testPhone = '5500000000000';
  const { data: testInsert, error: insertErr } = await sb
    .from('clients')
    .upsert({
      tenant_id: '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd',
      name: 'TESTE IMPORT',
      phone: testPhone,
      phone_normalized: testPhone,
      status: 'active',
      source: 'import_test',
    }, { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: false })
    .select('id, name, phone_normalized');
    
  if (insertErr) {
    console.log('❌ Insert error:', insertErr.message, insertErr.details, insertErr.code);
  } else {
    console.log('✅ Insert OK:', JSON.stringify(testInsert));
    
    // Limpar o teste
    if (testInsert && testInsert.length > 0) {
      const { error: delErr } = await sb.from('clients').delete().eq('id', testInsert[0].id);
      console.log('Cleanup:', delErr ? delErr.message : 'OK');
    }
  }
  
  // 3. Contar clientes atuais
  const { count } = await sb.from('clients').select('id', { count: 'exact', head: true })
    .eq('tenant_id', '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd');
  console.log('Total clientes:', count);
  
  process.exit(0);
})();
