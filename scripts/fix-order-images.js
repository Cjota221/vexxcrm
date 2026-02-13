// Script: Preencher imagens dos itens nos pedidos retroativamente
// Usa cross-reference com tabela products (SKU, external_id, nome)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  console.log('🔄 Preenchendo imagens dos itens nos pedidos...\n');

  // 1. Carregar todos os produtos com imagem
  const { data: products } = await supabase
    .from('products')
    .select('external_id, sku, name, image_url')
    .not('image_url', 'is', null);

  if (!products || products.length === 0) {
    console.log('❌ Nenhum produto com image_url encontrado!');
    return;
  }

  // Criar mapas de lookup
  const bySku = new Map();
  const byExtId = new Map();
  const byName = new Map();

  for (const p of products) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p.image_url);
    if (p.external_id) byExtId.set(String(p.external_id), p.image_url);
    if (p.name) byName.set(p.name.toLowerCase().trim(), p.image_url);
  }

  console.log(`📦 ${products.length} produtos com imagem carregados`);
  console.log(`   SKU map: ${bySku.size} | ExtId map: ${byExtId.size} | Name map: ${byName.size}\n`);

  // 2. Buscar pedidos em lotes
  const PAGE_SIZE = 100;
  let offset = 0;
  let totalUpdated = 0;
  let totalItemsFixed = 0;
  let totalItemsAlready = 0;
  let totalItemsNoMatch = 0;
  let totalOrders = 0;

  while (true) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, external_id, metadata')
      .not('metadata', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar pedidos:', error.message);
      break;
    }

    if (!orders || orders.length === 0) break;

    totalOrders += orders.length;
    const updates = [];

    for (const order of orders) {
      let meta = order.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { continue; }
      }

      const itens = meta?.itens;
      if (!itens || !Array.isArray(itens) || itens.length === 0) continue;

      let changed = false;

      for (const item of itens) {
        // Pular se já tem imagem
        if (item.imagem) {
          totalItemsAlready++;
          continue;
        }

        // Tentar encontrar imagem por cross-reference
        let imageUrl = null;

        // 1. Por SKU direto
        if (item.sku) {
          imageUrl = bySku.get(String(item.sku).toLowerCase());
          // Tentar base do SKU (ex: FZ3691503.5 -> FZ3691503)
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

        // 4. Extrair número do SKU como external_id (FZ2782571 -> 2782571)
        if (!imageUrl && item.sku) {
          const match = String(item.sku).match(/^FZ(\d+)/i);
          if (match) {
            imageUrl = byExtId.get(match[1]);
          }
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
        updates.push({
          id: order.id,
          metadata: { ...meta, itens }
        });
      }
    }

    // Aplicar atualizações em batch
    if (updates.length > 0) {
      for (const upd of updates) {
        const { error: updErr } = await supabase
          .from('orders')
          .update({ metadata: upd.metadata })
          .eq('id', upd.id);

        if (updErr) {
          console.error(`  ❌ Erro no pedido ${upd.id}: ${updErr.message}`);
        } else {
          totalUpdated++;
        }
      }
    }

    console.log(`  Lote ${Math.floor(offset / PAGE_SIZE) + 1}: ${orders.length} pedidos, ${updates.length} atualizados`);

    if (orders.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log('\n✅ CONCLUÍDO!');
  console.log(`   Pedidos analisados: ${totalOrders}`);
  console.log(`   Pedidos atualizados: ${totalUpdated}`);
  console.log(`   Itens com imagem adicionada: ${totalItemsFixed}`);
  console.log(`   Itens já com imagem: ${totalItemsAlready}`);
  console.log(`   Itens sem match (produto não encontrado): ${totalItemsNoMatch}`);
}

main().catch(console.error);
