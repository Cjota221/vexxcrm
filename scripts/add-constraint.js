// Verificar e remover duplicatas, listar SQL para constraint
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
  console.log('=== Verificando duplicatas em orders ===\n');
  
  const orders = await fetchAll('orders', 'id, external_id, tenant_id, created_at');
  console.log(`Total pedidos: ${orders.length}`);
  
  const counts = {};
  for (const o of orders) {
    const key = `${o.tenant_id}|${o.external_id}`;
    if (!counts[key]) counts[key] = [];
    counts[key].push(o);
  }
  
  const dupes = Object.entries(counts).filter(([, arr]) => arr.length > 1);
  console.log(`Duplicatas: ${dupes.length}`);
  
  if (dupes.length > 0) {
    console.log('\nRemovendo duplicatas (mantendo mais recente)...');
    let deleted = 0;
    for (const [key, arr] of dupes) {
      // Ordenar por created_at desc, manter o primeiro
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      for (let i = 1; i < arr.length; i++) {
        const { error } = await sb.from('orders').delete().eq('id', arr[i].id);
        if (!error) deleted++;
        else console.log(`  Erro deletando ${arr[i].id}: ${error.message}`);
      }
    }
    console.log(`Deletados: ${deleted}`);
  }
  
  // Contar final
  const { count } = await sb.from('orders').select('id', { count: 'exact', head: true });
  console.log(`\nTotal pedidos apos limpeza: ${count}`);
  
  console.log('\n=== Para criar constraint, execute no Supabase SQL Editor: ===');
  console.log('ALTER TABLE orders ADD CONSTRAINT orders_tenant_external_unique UNIQUE (tenant_id, external_id);');
}

main().catch(e => console.error(e));
