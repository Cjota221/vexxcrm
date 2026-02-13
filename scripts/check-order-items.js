const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);
const TID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

(async () => {
  // 1. Verificar order_items table
  const { data: oi, error: oiErr } = await sb.from('order_items').select('*').limit(2);
  if (oiErr) {
    console.log('order_items table:', oiErr.message);
  } else {
    console.log('order_items exists! count:', (oi||[]).length);
    if (oi?.[0]) console.log('  sample:', JSON.stringify(oi[0]));
  }

  // 2. Verificar metadata dos orders
  const { data: orders } = await sb.from('orders').select('id, metadata').not('client_id', 'is', null).eq('tenant_id', TID).limit(3);
  for (const o of (orders || [])) {
    const m = o.metadata || {};
    console.log('\nOrder', o.id);
    console.log('  metadata keys:', Object.keys(m).join(', '));
    console.log('  metadata preview:', JSON.stringify(m).substring(0, 500));
  }

  process.exit(0);
})();
