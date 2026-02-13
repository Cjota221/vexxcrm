const{createClient}=require('@supabase/supabase-js');
const sb=createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  const { data } = await sb.from('orders')
    .select('id, metadata')
    .eq('tenant_id', '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd')
    .is('client_id', null)
    .limit(10);

  for (const o of data) {
    const m = o.metadata || {};
    console.log('---');
    console.log('nome:', m.cliente_nome);
    console.log('whatsapp:', JSON.stringify(m.cliente_whatsapp));
    console.log('telefone:', JSON.stringify(m.cliente_telefone));
    console.log('email:', JSON.stringify(m.cliente_email));
    console.log('cpf:', JSON.stringify(m.cliente_cpf_cnpj));
    console.log('fz_id:', JSON.stringify(m.cliente_id_facilzap));
    console.log('wpp_e164:', JSON.stringify(m.cliente_whatsapp_e164));
  }
}

main().catch(console.error);
