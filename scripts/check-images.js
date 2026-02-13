// Diagnóstico: verificar imagens de produtos nos pedidos
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  // 1. Verificar quantos produtos têm image_url
  const { data: prods, count: prodCount } = await supabase
    .from('products')
    .select('id, name, sku, external_id, image_url, images', { count: 'exact' })
    .limit(20);

  console.log('\n=== PRODUCTS TABLE ===');
  console.log(`Total produtos: ${prodCount}`);
  const withImg = prods?.filter(p => p.image_url) || [];
  const withImgs = prods?.filter(p => p.images && p.images.length > 0) || [];
  console.log(`Com image_url (amostra 20): ${withImg.length}`);
  console.log(`Com images[] (amostra 20): ${withImgs.length}`);
  console.log('\nExemplos com imagem:');
  withImg.slice(0, 3).forEach(p => {
    console.log(`  - "${p.name}" | SKU: ${p.sku} | image_url: ${p.image_url?.substring(0, 80)}...`);
  });
  console.log('\nExemplos sem imagem:');
  prods?.filter(p => !p.image_url).slice(0, 3).forEach(p => {
    console.log(`  - "${p.name}" | SKU: ${p.sku} | external_id: ${p.external_id}`);
  });

  // 2. Verificar metadata.itens dos pedidos
  const { data: orders } = await supabase
    .from('orders')
    .select('id, external_id, metadata')
    .not('metadata', 'is', null)
    .limit(30);

  console.log('\n=== ORDERS METADATA.ITENS ===');
  let totalItems = 0;
  let itemsWithImg = 0;
  let itemsNoImg = 0;
  let sampleImgs = [];
  let sampleNoImgs = [];

  for (const o of (orders || [])) {
    let meta = o.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { continue; }
    }
    const itens = meta?.itens || [];
    for (const it of itens) {
      totalItems++;
      if (it.imagem) {
        itemsWithImg++;
        if (sampleImgs.length < 5) {
          sampleImgs.push({ order: o.external_id, nome: it.nome, imagem: it.imagem });
        }
      } else {
        itemsNoImg++;
        if (sampleNoImgs.length < 5) {
          sampleNoImgs.push({ order: o.external_id, nome: it.nome, sku: it.sku, produto_id: it.produto_id });
        }
      }
    }
  }

  console.log(`Total itens analisados (30 pedidos): ${totalItems}`);
  console.log(`Com imagem: ${itemsWithImg}`);
  console.log(`Sem imagem: ${itemsNoImg}`);
  console.log('\nExemplos COM imagem:');
  sampleImgs.forEach(s => {
    console.log(`  Pedido ${s.order} | "${s.nome}" | URL: ${s.imagem?.substring(0, 100)}`);
  });
  console.log('\nExemplos SEM imagem:');
  sampleNoImgs.forEach(s => {
    console.log(`  Pedido ${s.order} | "${s.nome}" | SKU: ${s.sku} | produto_id: ${s.produto_id}`);
  });

  // 3. Verificar se products com image_url cobrem os itens sem imagem
  if (sampleNoImgs.length > 0) {
    console.log('\n=== CROSS-REFERENCE CHECK ===');
    for (const s of sampleNoImgs.slice(0, 3)) {
      // Buscar por SKU
      if (s.sku) {
        const { data: bysku } = await supabase
          .from('products')
          .select('name, sku, image_url')
          .ilike('sku', `%${s.sku}%`)
          .limit(1);
        console.log(`  SKU "${s.sku}" -> found: ${bysku?.length > 0 ? bysku[0].image_url?.substring(0, 60) : 'NOT FOUND'}`);
      }
      // Buscar por external_id (produto_id do FacilZap)
      if (s.produto_id) {
        const { data: byext } = await supabase
          .from('products')
          .select('name, external_id, image_url')
          .eq('external_id', String(s.produto_id))
          .limit(1);
        console.log(`  ExtId "${s.produto_id}" -> found: ${byext?.length > 0 ? byext[0].image_url?.substring(0, 60) : 'NOT FOUND'}`);
      }
      // Buscar por nome
      if (s.nome) {
        const { data: byname } = await supabase
          .from('products')
          .select('name, image_url')
          .ilike('name', `%${s.nome.substring(0, 30)}%`)
          .limit(1);
        console.log(`  Nome "${s.nome?.substring(0, 40)}" -> found: ${byname?.length > 0 ? byname[0].image_url?.substring(0, 60) : 'NOT FOUND'}`);
      }
    }
  }

  // 4. Contar todos os pedidos, quantos com metadata, quantos com itens
  const { count: totalOrders } = await supabase.from('orders').select('id', { count: 'exact', head: true });
  const { count: withMeta } = await supabase.from('orders').select('id', { count: 'exact', head: true }).not('metadata', 'is', null);
  
  console.log('\n=== RESUMO GERAL ===');
  console.log(`Total pedidos: ${totalOrders}`);
  console.log(`Com metadata: ${withMeta}`);

  // 5. Verificar um pedido completo (metadata raw)
  const { data: sampleOrder } = await supabase
    .from('orders')
    .select('external_id, metadata')
    .not('metadata', 'is', null)
    .limit(1);
  
  if (sampleOrder?.[0]) {
    let meta = sampleOrder[0].metadata;
    if (typeof meta === 'string') try { meta = JSON.parse(meta); } catch {}
    const itens = meta?.itens || [];
    console.log(`\n=== PEDIDO ${sampleOrder[0].external_id} - ITENS RAW ===`);
    itens.slice(0, 2).forEach((it, i) => {
      console.log(`Item ${i}:`, JSON.stringify(it, null, 2));
    });
  }
}

main().catch(console.error);
