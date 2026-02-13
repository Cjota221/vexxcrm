const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

(async () => {
  // Test 1: Basic select orders with tenant filter
  console.log('Test 1: select com tenant_id + not null client_id');
  const { data: d1, error: e1 } = await sb.from('orders')
    .select('id, client_id, total, created_at')
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null)
    .limit(5);
  console.log('  error:', e1?.message || 'none');
  console.log('  count:', (d1||[]).length);
  if (d1?.[0]) console.log('  sample:', JSON.stringify(d1[0]));

  // Test 2: Same but with items
  console.log('\nTest 2: select com items');
  const { data: d2, error: e2 } = await sb.from('orders')
    .select('id, client_id, total, items, created_at, status')
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('  error:', e2?.message || 'none');
  console.log('  count:', (d2||[]).length);
  if (d2?.[0]) {
    console.log('  sample id:', d2[0].id);
    console.log('  items type:', typeof d2[0].items);
    console.log('  items isArray:', Array.isArray(d2[0].items));
    console.log('  items length:', Array.isArray(d2[0].items) ? d2[0].items.length : 'N/A');
    if (Array.isArray(d2[0].items) && d2[0].items.length > 0) {
      console.log('  first item:', JSON.stringify(d2[0].items[0]).substring(0, 300));
    }
  }

  // Test 3: range query
  console.log('\nTest 3: range(0, 999)');
  const { data: d3, error: e3 } = await sb.from('orders')
    .select('id, client_id, total, items, created_at, status')
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(0, 999);
  console.log('  error:', e3?.message || 'none');
  console.log('  count:', (d3||[]).length);

  // Test 4: without tenant filter  
  console.log('\nTest 4: sem tenant filter');
  const { data: d4, error: e4 } = await sb.from('orders')
    .select('id, tenant_id, client_id')
    .not('client_id', 'is', null)
    .limit(5);
  console.log('  error:', e4?.message || 'none');
  console.log('  count:', (d4||[]).length);
  if (d4?.[0]) console.log('  sample tenant:', d4[0].tenant_id);

  // Test 5: products table
  console.log('\nTest 5: products');
  const { data: d5, error: e5 } = await sb.from('products')
    .select('id, name, category, price')
    .eq('tenant_id', TENANT_ID)
    .limit(3);
  console.log('  error:', e5?.message || 'none');
  console.log('  count:', (d5||[]).length);
  if (d5?.[0]) console.log('  sample:', JSON.stringify(d5[0]));

  process.exit(0);
})();
