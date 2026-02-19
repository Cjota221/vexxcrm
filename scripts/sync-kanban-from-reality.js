/**
 * sync-kanban-from-reality.js
 *
 * Varre TODAS as conversas do tenant e sincroniza o kanban
 * com base na realidade:
 *
 * Lógica de mapeamento (pedido mais recente do cliente):
 *   delivered  → CONCLUIDO
 *   shipped    → DESPACHADO
 *   confirmed  → PAGO
 *   processing → AGUARDANDO_PAGAMENTO
 *   pending    → AGUARDANDO_PAGAMENTO
 *   (sem pedido, conversa ativa) → EM_NEGOCIACAO
 *   (sem pedido, sem atividade recente) → PRIMEIRO_CONTATO
 *
 * O script:
 *   1. Apaga cards duplicados (mesmo client_id, múltiplos chat_ids)
 *   2. Apaga os cards seeded artificialmente (que não têm
 *      client_id correspondente a uma conversa real)
 *   3. Para cada conversa real, cria ou atualiza o card
 *      com a coluna correta
 *   4. Registra uma transição "auto" para auditoria
 *
 * Uso:
 *   node scripts/sync-kanban-from-reality.js
 *   node scripts/sync-kanban-from-reality.js --dry-run
 *   node scripts/sync-kanban-from-reality.js --tenant=<id>
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const TENANT_ARG = args.find(a => a.startsWith('--tenant='))?.split('=')[1] || null;
const VERBOSE  = args.includes('--verbose');

const s = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Mapeamento order status → kanban coluna ──────────────────
const ORDER_STATUS_TO_COLUMN = {
  delivered:  'CONCLUIDO',
  shipped:    'DESPACHADO',
  confirmed:  'PAGO',
  processing: 'AGUARDANDO_PAGAMENTO',
  pending:    'AGUARDANDO_PAGAMENTO',
  cancelled:  'CANCELADO',
  refunded:   'CANCELADO',
};

/**
 * Normaliza um número de telefone para o formato WhatsApp remoteJid.
 * Garante que números brasileiros tenham o 9° dígito quando DDD >= 11.
 * Ex: "5511987654321" → "5511987654321@s.whatsapp.net" (já tem 9°)
 *     "5511 8765-4321" → "55118765432109" → "55119876543210" (adiciona 9°)
 * Números de 8 dígitos locais (DDD 11-99): adiciona o 9°
 */
function buildChatId(phone) {
  const digits = phone.replace(/\D/g, '');

  // Formato esperado: 55 + DDD(2) + número(8 ou 9) = 12 ou 13 dígitos
  if (digits.startsWith('55') && digits.length === 12) {
    // Número com 8 dígitos após DDD — adicionar 9° dígito
    const country = digits.slice(0, 2);  // '55'
    const ddd = digits.slice(2, 4);       // DDD
    const num = digits.slice(4);          // 8 dígitos
    const numWith9 = '9' + num;
    return `${country}${ddd}${numWith9}@s.whatsapp.net`;
  }

  // 13 dígitos ou formato diferente — usar como está
  return `${digits}@s.whatsapp.net`;
}

/**
 * Determina a coluna correta para uma conversa baseado nos pedidos do cliente.
 * Usa o pedido mais recente como referência principal.
 */
function determineColumn(orders, convLastMessageAt) {
  if (!orders || orders.length === 0) {
    // Sem pedido: verificar se conversa é recente (< 7 dias = negociando)
    const daysSinceLastMsg = convLastMessageAt
      ? (Date.now() - new Date(convLastMessageAt).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    return daysSinceLastMsg < 7 ? 'EM_NEGOCIACAO' : 'PRIMEIRO_CONTATO';
  }

  // Pegar o pedido mais recente
  const latest = orders[0]; // já ordenado por created_at DESC
  return ORDER_STATUS_TO_COLUMN[latest.status] || 'EM_NEGOCIACAO';
}

async function syncTenant(tenantId) {
  console.log(`\n🏢 Tenant: ${tenantId}`);

  // 1. Buscar todas as conversas
  const { data: convs, error: convErr } = await s
    .from('conversations')
    .select('id, client_id, last_message_at, created_at, status')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false });

  if (convErr) throw new Error('Erro ao buscar conversas: ' + convErr.message);
  console.log(`   📋 Conversas encontradas: ${convs.length}`);

  // 2. Buscar clients com phone (para montar chat_id) — em lotes de 100 (limite URL Supabase)
  const clientIds = [...new Set(convs.map(c => c.client_id).filter(Boolean))];
  const allClients = [];
  for (let i = 0; i < clientIds.length; i += 100) {
    const batch = clientIds.slice(i, i + 100);
    const { data: chunk, error: cliErr } = await s
      .from('clients')
      .select('id, phone')
      .eq('tenant_id', tenantId)
      .in('id', batch);
    if (cliErr) throw new Error('Erro ao buscar clients: ' + cliErr.message);
    allClients.push(...(chunk || []));
  }
  const clientPhone = {};
  for (const c of allClients) clientPhone[c.id] = c.phone;

  // 3. Buscar todos os pedidos, agrupados por cliente
  const { data: orders, error: ordErr } = await s
    .from('orders')
    .select('client_id, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (ordErr) throw new Error('Erro ao buscar orders: ' + ordErr.message);

  // Agrupar pedidos por cliente (mais recente primeiro)
  const ordersByClient = {};
  for (const o of orders || []) {
    if (!ordersByClient[o.client_id]) ordersByClient[o.client_id] = [];
    ordersByClient[o.client_id].push(o);
  }

  // 4. Buscar kanban_cards existentes (para detectar mudanças reais)
  const { data: existingCards } = await s
    .from('kanban_cards')
    .select('id, client_id, chat_id, coluna, updated_at')
    .eq('tenant_id', tenantId);

  // ── Limpar DUPLICATAS: mesmo client_id com múltiplos chat_ids ─────
  // Agrupar por client_id e manter apenas o mais recente
  const cardsByClient = {};
  for (const c of existingCards || []) {
    if (!cardsByClient[c.client_id]) {
      cardsByClient[c.client_id] = [];
    }
    cardsByClient[c.client_id].push(c);
  }

  const dupIds = [];
  for (const [, cards] of Object.entries(cardsByClient)) {
    if (cards.length > 1) {
      // Ordenar: manter o mais recente (updated_at maior), deletar os demais
      cards.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      for (let i = 1; i < cards.length; i++) dupIds.push(cards[i].id);
    }
  }

  if (dupIds.length > 0) {
    console.log(`   🧹 Cards duplicados (mesmo cliente): ${dupIds.length}`);
    if (!DRY_RUN) {
      for (let i = 0; i < dupIds.length; i += 100) {
        const batch = dupIds.slice(i, i + 100);
        const { error: delDupErr } = await s.from('kanban_cards').delete().in('id', batch);
        if (delDupErr) console.warn(`   ⚠️  Erro ao deletar duplicatas: ${delDupErr.message}`);
      }
      console.log(`   ✅ ${dupIds.length} duplicatas removidas`);
      // Recarregar lista após limpeza
      for (const id of dupIds) {
        const clientId = Object.entries(cardsByClient).find(([,cards]) => cards.some(c => c.id === id))?.[0];
        if (clientId && cardsByClient[clientId]) {
          cardsByClient[clientId] = cardsByClient[clientId].filter(c => c.id !== id);
        }
      }
    }
  }

  const existingByClient = {};
  for (const [clientId, cards] of Object.entries(cardsByClient)) {
    if (cards.length > 0) existingByClient[clientId] = cards[0]; // mais recente
  }

  // 5. Limpar cards que não têm conversa correspondente (seeded fake)
  const realClientIds = new Set(clientIds);
  const fakeCards = (existingCards || []).filter(c => !realClientIds.has(c.client_id));
  console.log(`   🗑️  Cards falsos (sem conversa real): ${fakeCards.length}`);

  if (!DRY_RUN && fakeCards.length > 0) {
    const fakeIds = fakeCards.map(c => c.id);
    // Deletar em lotes de 100
    for (let i = 0; i < fakeIds.length; i += 100) {
      const batch = fakeIds.slice(i, i + 100);
      const { error: delErr } = await s
        .from('kanban_cards')
        .delete()
        .in('id', batch);
      if (delErr) console.warn(`   ⚠️  Erro ao deletar batch: ${delErr.message}`);
    }
    console.log(`   ✅ ${fakeCards.length} cards falsos removidos`);
  }

  // 6. Para cada conversa, determinar coluna e upsert card
  const stats = { created: 0, updated: 0, unchanged: 0, noPhone: 0 };
  const upsertBatch = [];
  const transitionBatch = [];
  const now = new Date().toISOString();

  for (const conv of convs) {
    const phone = clientPhone[conv.client_id];
    if (!phone) { stats.noPhone++; continue; }

    // Montar chat_id no formato WhatsApp com 9° dígito normalizado
    const chatId = buildChatId(phone);

    const clientOrders = ordersByClient[conv.client_id] || [];
    const targetColumn = determineColumn(clientOrders, conv.last_message_at);

    const existing = existingByClient[conv.client_id];
    const previousColumn = existing?.coluna || null;

    if (existing && existing.coluna === targetColumn) {
      stats.unchanged++;
      if (VERBOSE) console.log(`   = ${chatId.slice(0,20)} — já em ${targetColumn}`);
      continue;
    }

    if (existing) {
      stats.updated++;
      if (VERBOSE) console.log(`   ↗ ${chatId.slice(0,20)} — ${previousColumn} → ${targetColumn}`);
    } else {
      stats.created++;
      if (VERBOSE) console.log(`   + ${chatId.slice(0,20)} — novo em ${targetColumn}`);
    }

    // Se já existe card, usar o chat_id que já está no banco (preservar o existente)
    // para não criar conflito de constraint. Só atualizar a coluna.
    const finalChatId = existing ? existing.chat_id : chatId;

    upsertBatch.push({
      tenant_id: tenantId,
      chat_id: finalChatId,
      client_id: conv.client_id,
      coluna: targetColumn,
      updated_at: now,
    });

    transitionBatch.push({
      tenant_id: tenantId,
      chat_id: finalChatId,
      client_id: conv.client_id,
      de_coluna: previousColumn,
      para_coluna: targetColumn,
      autor: 'anne',
      motivo: 'Sincronização automática — varredura de realidade',
    });
  }

  if (!DRY_RUN) {
    // Upsert em lotes de 100
    for (let i = 0; i < upsertBatch.length; i += 100) {
      const batch = upsertBatch.slice(i, i + 100);
      const { error } = await s
        .from('kanban_cards')
        .upsert(batch, { onConflict: 'tenant_id,chat_id' });
      if (error) console.error(`   ❌ Upsert batch error: ${error.message}`);
    }

    // Inserir transições
    if (transitionBatch.length > 0) {
      for (let i = 0; i < transitionBatch.length; i += 100) {
        const batch = transitionBatch.slice(i, i + 100);
        const { error: tErr } = await s.from('kanban_transitions').insert(batch);
        if (tErr) console.warn('   ⚠️  Transitions insert:', tErr.message);
      }
    }
  }

  console.log(`\n   📊 Resultado:`);
  console.log(`      ✅ Criados:   ${stats.created}`);
  console.log(`      ↗  Atualizados: ${stats.updated}`);
  console.log(`      =  Sem mudança: ${stats.unchanged}`);
  console.log(`      ⚠️  Sem phone:  ${stats.noPhone}`);

  // Projeção final por coluna
  const projection = {};
  for (const item of upsertBatch) {
    projection[item.coluna] = (projection[item.coluna] || 0) + 1;
  }
  // Adicionar os unchanged (coluna atual já correta)
  for (const conv of convs) {
    const existing = existingByClient[conv.client_id];
    if (existing) {
      const clientOrders = ordersByClient[conv.client_id] || [];
      const targetColumn = determineColumn(clientOrders, conv.last_message_at);
      if (existing.coluna === targetColumn) {
        projection[targetColumn] = (projection[targetColumn] || 0) + 1;
      }
    }
  }
  console.log(`\n   🗂️  Distribuição final por coluna:`);
  for (const [col, cnt] of Object.entries(projection).sort((a,b) => b[1]-a[1])) {
    console.log(`      ${col}: ${cnt}`);
  }

  return stats;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   sync-kanban-from-reality.js — VEXX CRM                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Modo:   ${DRY_RUN ? '🔍 DRY-RUN (sem alterações)' : '🔧 SINCRONIZAÇÃO REAL'}`);
  if (TENANT_ARG) console.log(`  Tenant: ${TENANT_ARG}`);

  // Buscar tenants
  let tenantIds = [];
  if (TENANT_ARG) {
    tenantIds = [TENANT_ARG];
  } else {
    const { data: tenants } = await s.from('tenants').select('id, name');
    tenantIds = (tenants || []).map(t => { console.log(`  → ${t.name} (${t.id})`); return t.id; });
  }

  if (tenantIds.length === 0) {
    console.log('❌ Nenhum tenant encontrado.');
    return;
  }

  const totalStats = { created: 0, updated: 0, unchanged: 0 };
  for (const tenantId of tenantIds) {
    const stats = await syncTenant(tenantId);
    totalStats.created += stats.created;
    totalStats.updated += stats.updated;
    totalStats.unchanged += stats.unchanged;
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   CONCLUÍDO                                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Criados:     ${totalStats.created}`);
  console.log(`  ↗  Atualizados: ${totalStats.updated}`);
  console.log(`  =  Sem mudança: ${totalStats.unchanged}`);
  if (DRY_RUN) console.log('\n  💡 Execute sem --dry-run para aplicar as mudanças.');
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
