// Script: Preencher imagens dos itens nos pedidos - com retry e throttle
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function updateWithRetry(id, metadata, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { error } = await supabase
      .from('orders')
      .update({ metadata })
      .eq('id', id);
    if (!error) return true;
    if (attempt < retries) {
      await sleep(2000 * attempt);
    }
  }
  return false;
}

async function main() {
  console.log('🔄 Preenchendo imagens (com throttle)...\n');

  // 1. Carregar todos os produtos com imagem
  const { data: products } = await supabase
    .from('products')
    .select('external_id, sku, name, image_url')
    .not('image_url', 'is', null);

  const bySku = new Map();
  const byExtId = new Map();
  const byName = new Map();

  for (const p of (products || [])) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p.image_url);
    if (p.external_id) byExtId.set(String(p.external_id), p.image_url);
    if (p.name) byName.set(p.name.toLowerCase().trim(), p.image_url);
  }

  console.log(`📦 ${products?.length} produtos com imagem\n`);

  // 2. Buscar SOMENTE pedidos que precisam de atualização (itens sem imagem)
  const PAGE_SIZE = 50;
  let offset = 0;
  let totalUpdated = 0;
  let totalItemsFixed = 0;
  let totalItemsNoMatch = 0;
  let totalOrders = 0;
  let totalSkipped = 0;

  while (true) {
    await sleep(500); // Throttle entre lotes

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, external_id, metadata')
      .not('metadata', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar pedidos:', error.message?.substring(0, 80));
      await sleep(5000);
      // Retry
      continue;
    }

    if (!orders || orders.length === 0) break;

    totalOrders += orders.length;

    for (const order of orders) {
      let meta = order.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { continue; }
      }

      const itens = meta?.itens;
      if (!itens || !Array.isArray(itens) || itens.length === 0) continue;

      // Checar se já tem imagem em TODOS os itens
      const needsFix = itens.some(it => !it.imagem);
      if (!needsFix) {
        totalSkipped++;
        continue;
      }

      let changed = false;

      for (const item of itens) {
        if (item.imagem) continue;

        let imageUrl = null;

        // 1. Por SKU direto
        if (item.sku) {
          imageUrl = bySku.get(String(item.sku).toLowerCase());
          if (!imageUrl) {
            const baseSku = String(item.sku).split('.')[0];
            imageUrl = bySku.get(baseSku.toLowerCase());
          }
        }

        // 2. Por produto_id como external_id
        if (!imageUrl && item.produto_id) {
          imageUrl = byExtId.get(String(item.produto_id));
        }

        // 3. Por ID como external_id
        if (!imageUrl && item.id) {
          imageUrl = byExtId.get(String(item.id));
        }

        // 4. FZ{id} -> external_id
        if (!imageUrl && item.sku) {
          const match = String(item.sku).match(/^FZ(\d+)/i);
          if (match) imageUrl = byExtId.get(match[1]);
        }

        // 5. Por nome do produto
        if (!imageUrl && item.nome) {
          imageUrl = byName.get(item.nome.toLowerCase().trim());
        }

        if (imageUrl) {
          item.imagem = imageUrl;
          changed = true;
          totalItemsFixed++;
        } else {
          totalItemsNoMatch++;
        }
      }

      if (changed) {
        await sleep(100); // Throttle entre updates
        const ok = await updateWithRetry(order.id, { ...meta, itens });
        if (ok) totalUpdated++;
      }
    }

    console.log(`  Lote ${Math.floor(offset / PAGE_SIZE) + 1}: ${orders.length} pedidos | ${totalUpdated} atualizados | ${totalSkipped} já ok`);

    if (orders.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log('\n✅ CONCLUÍDO!');
  console.log(`   Pedidos analisados: ${totalOrders}`);
  console.log(`   Pedidos atualizados: ${totalUpdated}`);
  console.log(`   Pedidos já com imagens: ${totalSkipped}`);
  console.log(`   Itens com imagem adicionada: ${totalItemsFixed}`);
  console.log(`   Itens sem match: ${totalItemsNoMatch}`);
}

main().catch(console.error);
