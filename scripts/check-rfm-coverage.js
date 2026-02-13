const{createClient}=require('@supabase/supabase-js');
const sb=createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);
const TID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function main() {
  const [r1,r2,r3,r4,r5,r6] = await Promise.all([
    sb.from('clients').select('id',{count:'exact',head:true}).eq('tenant_id',TID),
    sb.from('clients').select('id',{count:'exact',head:true}).eq('tenant_id',TID).not('rfm_segment','is',null),
    sb.from('clients').select('id',{count:'exact',head:true}).eq('tenant_id',TID).gt('total_orders',0),
    sb.from('orders').select('id',{count:'exact',head:true}).eq('tenant_id',TID),
    sb.from('orders').select('id',{count:'exact',head:true}).eq('tenant_id',TID).not('client_id','is',null),
    sb.from('orders').select('id',{count:'exact',head:true}).eq('tenant_id',TID).is('client_id',null),
  ]);

  console.log('=== CLIENTES ===');
  console.log('Total clientes:', r1.count);
  console.log('Com RFM calculado:', r2.count);
  console.log('Com total_orders > 0:', r3.count);
  console.log('');
  console.log('=== PEDIDOS ===');
  console.log('Total pedidos:', r4.count);
  console.log('Vinculados (com client_id):', r5.count);
  console.log('Orfaos (sem client_id):', r6.count);
  console.log('');
  console.log('🔍 Diferença:', r1.count - r2.count, 'clientes SEM RFM');
  console.log('   Motivo provável: esses clientes não têm pedidos vinculados');
}

main().catch(console.error);
