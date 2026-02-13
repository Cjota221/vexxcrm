// Diagnóstico 2: verificar match entre SKUs dos itens e products
const { createClient } = require('@supabase/supabase-js');

const s = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  // 1. Coletar SKUs dos itens de pedidos recentes
  const { data: orders } = await s
    .from('orders')
    .select('external_id, metadata')
    .not('metadata', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const skuSet = new Set();
  const nameSet = new Set();
  let total = 0;

  for (const o of (orders || [])) {
    let m = o.metadata;
    if (typeof m === 'string') try { m = JSON.parse(m); } catch { continue; }
    const itens = m?.itens || [];
    for (const it of itens) {
      total++;
      if (it.sku) skuSet.add(it.sku);
      if (it.nome) nameSet.add(it.nome.toLowerCase().trim());
    }
  }

  console.log('Total itens (50 pedidos recentes):', total);
  console.log('SKUs únicos:', skuSet.size);
  
  const skuArr = [...skuSet].slice(0, 15);
  console.log('\nSample SKUs dos pedidos:', skuArr);

  // 2. Buscar esses SKUs na tabela products
  const { data: matched } = await s
    .from('products')
    .select('sku, name, image_url')
    .in('sku', skuArr);
  
  console.log(`\nMatched por SKU (${skuArr.length} buscados): ${matched?.length} encontrados`);
  if (matched?.length > 0) {
    matched.forEach(m => console.log(`  ✓ ${m.sku} -> ${m.image_url?.substring(0, 60)}`));
  }
  
  // SKUs que NÃO foram encontrados
  const matchedSkus = new Set((matched || []).map(m => m.sku));
  const notMatched = skuArr.filter(sk => !matchedSkus.has(sk));
  console.log(`\nSKUs NÃO encontrados na products: ${notMatched.length}`);
  notMatched.forEach(sk => console.log(`  ✗ ${sk}`));

  // 3. Verificar TODOS os SKUs da tabela products para ver o padrão
  const { data: allProds } = await s
    .from('products')
    .select('sku')
    .not('sku', 'is', null)
    .limit(20);
  
  console.log('\nSample SKUs da tabela products:');
  allProds?.forEach(p => console.log(`  ${p.sku}`));

  // 4. Verificar se o SKU do item contém o formato do external_id
  console.log('\n=== MATCH POR EXTERNAL_ID ===');
  // SKU do FacilZap pode ser FZ{produto_id} ou FZ{produto_id}.{variacao}
  // O external_id na products table é o ID do produto no FacilZap
  const extIds = skuArr.map(sk => {
    // FZ2782571 -> 2782571
    const match = sk.match(/^FZ(\d+)/);
    return match ? match[1] : sk;
  });
  console.log('External IDs extraídos:', extIds);
  
  const { data: byExtId } = await s
    .from('products')
    .select('external_id, sku, name, image_url')
    .in('external_id', extIds);
  
  console.log(`Matched por external_id: ${byExtId?.length}`);
  byExtId?.forEach(p => console.log(`  ✓ ext=${p.external_id} sku=${p.sku} -> ${p.image_url?.substring(0, 60)}`));

  // 5. Tentar match por nome
  console.log('\n=== MATCH POR NOME ===');
  const nameArr = [...nameSet].slice(0, 5);
  for (const n of nameArr) {
    const searchTerm = n.substring(0, 25);
    const { data: byName } = await s
      .from('products')
      .select('name, sku, image_url')
      .ilike('name', `%${searchTerm}%`)
      .limit(1);
    
    const found = byName?.length > 0;
    console.log(`  ${found ? '✓' : '✗'} "${n.substring(0, 50)}" -> ${found ? byName[0].image_url?.substring(0, 60) : 'NOT FOUND'}`);
  }
}

main().catch(console.error);
