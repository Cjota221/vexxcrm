const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function check() {
  // 1. Verificar se cpf/birthday existem
  const { data: sample, error: sampleErr } = await sb
    .from('clients')
    .select('id')
    .limit(1);
  console.log('clients table:', sampleErr ? sampleErr.message : 'OK');

  // 2. Testar inserção com cpf
  const { error: testErr } = await sb
    .from('clients')
    .upsert({
      tenant_id: '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd',
      name: '__TEST_IMPORT__',
      phone: '0000000000',
      phone_normalized: '0000000000',
      cpf: '00000000000',
      status: 'active',
      source: 'test'
    }, { onConflict: 'tenant_id,phone_normalized' });
  console.log('Upsert com cpf:', testErr ? testErr.message : 'OK');

  // 3. Limpar test
  if (!testErr) {
    await sb.from('clients').delete().eq('phone_normalized', '0000000000').eq('tenant_id', '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd');
    console.log('Teste limpo');
  }

  // 4. Verificar tabelas intelligence v2
  const tables = ['seasonal_events', 'client_seasonal_profiles', 'product_trends', 'product_affinity', 'client_grade_preferences'];
  for (const t of tables) {
    const { error } = await sb.from(t).select('id').limit(1);
    console.log(`${t}:`, error ? error.message : 'EXISTS');
  }

  // 5. Verificar unique constraint
  const { data: constr, error: constrErr } = await sb.rpc('exec_sql', {
    sql: "SELECT conname FROM pg_constraint WHERE conrelid = 'public.clients'::regclass AND contype = 'u'"
  });
  console.log('Constraints:', constrErr ? constrErr.message : JSON.stringify(constr));
}

check().catch(e => console.error(e));
