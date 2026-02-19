/**
 * seed-kanban-cards.js
 *
 * Popula a tabela kanban_cards para todos os clientes com base
 * no status do pedido mais recente de cada um.
 *
 * Mapeamento de status → coluna Kanban:
 *  pending    → AGUARDANDO_PAGAMENTO
 *  processing → PAGO
 *  confirmed  → AGUARDANDO_PAGAMENTO
 *  shipped    → DESPACHADO
 *  in_transit → DESPACHADO
 *  delivered  → CONCLUIDO
 *  completed  → CONCLUIDO
 *  cancelled  → CANCELADO
 *
 * Clientes sem pedidos → PRIMEIRO_CONTATO
 * Clientes com mensagens mas sem pedidos → EM_NEGOCIACAO
 *
 * Uso: node scripts/seed-kanban-cards.js [--dry-run]
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

const STATUS_TO_COLUMN = {
  pending:    'AGUARDANDO_PAGAMENTO',
  confirmed:  'AGUARDANDO_PAGAMENTO',
  processing: 'PAGO',
  shipped:    'DESPACHADO',
  in_transit: 'DESPACHADO',
  delivered:  'CONCLUIDO',
  completed:  'CONCLUIDO',
  cancelled:  'CANCELADO',
};

async function main() {
  console.log(`\n🚀 Seed kanban_cards${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Buscar todos os clientes
  const { data: clients, error: ce } = await sb
    .from('clients')
    .select('id, tenant_id, phone_normalized, name');

  if (ce) { console.error('❌ Erro ao buscar clientes:', ce.message); process.exit(1); }
  console.log(`✅ ${clients.length} clientes encontrados`);

  // 2. Buscar pedido mais recente por cliente (um query por tenant)
  const tenantId = clients[0]?.tenant_id;
  const { data: orders, error: oe } = await sb
    .from('orders')
    .select('client_id, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (oe) { console.error('❌ Erro ao buscar pedidos:', oe.message); process.exit(1); }

  // Indexar pedido mais recente por client_id
  const latestOrder = {};
  for (const o of orders ?? []) {
    if (!latestOrder[o.client_id]) latestOrder[o.client_id] = o;
  }
  console.log(`✅ ${Object.keys(latestOrder).length} clientes com pedidos`);

  // 3. Verificar kanban_cards existentes para não duplicar
  const { data: existing } = await sb
    .from('kanban_cards')
    .select('client_id')
    .eq('tenant_id', tenantId);

  const existingSet = new Set((existing ?? []).map(c => c.client_id));
  console.log(`ℹ️  ${existingSet.size} cards já existem\n`);

  // 4. Montar lista de upserts
  const toInsert = [];
  for (const client of clients) {
    if (existingSet.has(client.id)) continue; // já existe

    const order = latestOrder[client.id];
    let coluna = 'PRIMEIRO_CONTATO';
    if (order) {
      coluna = STATUS_TO_COLUMN[order.status] ?? 'EM_NEGOCIACAO';
    }

    const chatId = `${client.phone_normalized}@s.whatsapp.net`;

    toInsert.push({
      tenant_id: client.tenant_id,
      chat_id: chatId,
      client_id: client.id,
      coluna,
      tags: [],
      score_anne: null,
      tentativas_reativacao: 0,
    });
  }

  console.log(`📋 Cards a inserir: ${toInsert.length}`);

  // Estatísticas por coluna
  const byCol = {};
  for (const c of toInsert) byCol[c.coluna] = (byCol[c.coluna] || 0) + 1;
  console.log('📊 Distribuição:', JSON.stringify(byCol, null, 2));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — nenhum dado foi inserido.');
    return;
  }

  // 5. Inserir em lotes de 100
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error: ie } = await sb
      .from('kanban_cards')
      .upsert(batch, { onConflict: 'tenant_id,chat_id' });

    if (ie) {
      console.error(`❌ Erro no lote ${i}-${i + BATCH}:`, ie.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r✅ Inseridos: ${inserted}/${toInsert.length}`);
    }
  }

  console.log(`\n\n🎉 Concluído! ${inserted} cards inseridos no pipeline.`);

  // 6. Verificar resultado
  const { data: final } = await sb
    .from('kanban_cards')
    .select('coluna')
    .eq('tenant_id', tenantId);

  const finalCounts = {};
  for (const c of final ?? []) finalCounts[c.coluna] = (finalCounts[c.coluna] || 0) + 1;
  console.log('\n📊 Estado final do pipeline:');
  for (const [col, count] of Object.entries(finalCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${col}: ${count} cards`);
  }
}

main().catch(console.error);
