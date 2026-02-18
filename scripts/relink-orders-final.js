/**
 * relink-orders-final.js
 * 
 * Relink pedidos (orders) que têm client_id = null mas possuem
 * metadata.cliente_whatsapp_e164 preenchido.
 * 
 * Etapas:
 * 1. Busca todos os pedidos sem client_id que têm e164
 * 2. Normaliza o telefone (remove +55, mantém só dígitos)
 * 3. Busca o client pelo phone_normalized
 * 4. Atualiza orders.client_id
 * 5. Se o client.name ainda é um telefone (nome sujo), atualiza com metadata.cliente_nome
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Normaliza telefone para o formato phone_normalized do Supabase.
 * Exemplos de phone_normalized observados no DB:
 *   5594992144690 → 559492144690  (remove o 9 extra: 55 + DDD + 8 dígitos)
 *   5581998431255 → 558198431255  (idem)
 * 
 * Regra: se após o DDI "55" + DDD (2 dígitos) o número tiver 9 dígitos
 *        começando com 9, remove o primeiro 9 → 8 dígitos.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // Garante começo com 55
  let d = digits.startsWith('55') ? digits : '55' + digits;
  // Se tiver 55 + 2(DDD) + 9(celular com 9ª) = 13 dígitos → remove 9 extra
  if (d.length === 13) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4); // 9 dígitos
    if (num.startsWith('9') && num.length === 9) {
      return '55' + ddd + num.slice(1); // 55 + DDD + 8 dígitos = 12 total
    }
  }
  return d; // 12 dígitos já normalizado, ou outro formato
}

/** Verifica se um nome parece ser um telefone (só dígitos ou formato +55xxx) */
function isPhoneName(name) {
  if (!name) return true;
  const stripped = name.replace(/[\s\-\+\(\)]/g, '');
  return /^\d{8,15}$/.test(stripped);
}

/** Valida se um nome é adequado (não é "Loja", vazio, ou telefone) */
function isGoodName(name) {
  if (!name || !name.trim()) return false;
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'loja') return false;
  if (trimmed.toLowerCase() === 'você') return false;
  if (isPhoneName(trimmed)) return false;
  if (trimmed.length < 3) return false;
  return true;
}

async function main() {
  console.log('🔗 RELINK ORDERS FINAL — Iniciando...\n');

  // ── 1. Buscar pedidos sem client_id mas com e164 ──────────────────────────
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, tenant_id, metadata')
    .eq('tenant_id', TENANT_ID)
    .is('client_id', null)
    .not('metadata->>cliente_whatsapp_e164', 'is', null)
    .neq('metadata->>cliente_whatsapp_e164', '');

  if (ordersErr) {
    console.error('❌ Erro ao buscar pedidos:', ordersErr.message);
    process.exit(1);
  }

  console.log(`📦 Pedidos sem client_id com e164 encontrados: ${orders?.length ?? 0}`);

  if (!orders || orders.length === 0) {
    console.log('✅ Nenhum pedido para processar.');
    return;
  }

  // ── 2. Agrupar por telefone normalizado ──────────────────────────────────
  const byPhone = new Map(); // phone_normalized → { orderIds, bestName }
  for (const order of orders) {
    const m = order.metadata || {};
    const raw = m.cliente_whatsapp_e164 || m.cliente_whatsapp;
    const phone = normalizePhone(raw);
    if (!phone) continue;

    if (!byPhone.has(phone)) {
      byPhone.set(phone, { orderIds: [], bestName: null });
    }
    const entry = byPhone.get(phone);
    entry.orderIds.push(order.id);

    // Mantém o melhor nome encontrado (não-telefone, não-Loja)
    const nome = m.cliente_nome;
    if (isGoodName(nome) && !entry.bestName) {
      entry.bestName = nome.trim();
    }
  }

  console.log(`📱 Telefones únicos para relink: ${byPhone.size}\n`);

  // ── 3. Buscar clients pelo phone_normalized ────────────────────────────────
  const phones = Array.from(byPhone.keys());
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .select('id, name, phone, phone_normalized')
    .eq('tenant_id', TENANT_ID)
    .in('phone_normalized', phones);

  if (clientsErr) {
    console.error('❌ Erro ao buscar clients:', clientsErr.message);
    process.exit(1);
  }

  console.log(`👥 Clients encontrados por telefone: ${clients?.length ?? 0}`);

  // Mapa phone_normalized → client
  const clientByPhone = new Map();
  for (const c of (clients || [])) {
    if (c.phone_normalized) clientByPhone.set(c.phone_normalized, c);
  }

  // ── 4. Processar relink ───────────────────────────────────────────────────
  let linkedOrders = 0;
  let updatedNames = 0;
  let skippedNoClient = 0;

  for (const [phone, entry] of byPhone.entries()) {
    const client = clientByPhone.get(phone);

    if (!client) {
      skippedNoClient++;
      console.log(`  ⚠️  Sem client para telefone ${phone} (${entry.orderIds.length} pedido(s))`);
      continue;
    }

    // Atualiza orders.client_id para cada pedido desse telefone
    const { error: updateOrderErr } = await supabase
      .from('orders')
      .update({ client_id: client.id })
      .in('id', entry.orderIds)
      .eq('tenant_id', TENANT_ID);

    if (updateOrderErr) {
      console.error(`  ❌ Erro ao atualizar pedidos do tel ${phone}:`, updateOrderErr.message);
      continue;
    }

    linkedOrders += entry.orderIds.length;
    console.log(`  ✅ ${entry.orderIds.length} pedido(s) → client "${client.name}" (${phone})`);

    // Atualiza nome do client se ainda é um telefone e temos nome melhor
    if (isPhoneName(client.name) && isGoodName(entry.bestName)) {
      const { error: updateNameErr } = await supabase
        .from('clients')
        .update({ name: entry.bestName })
        .eq('id', client.id)
        .eq('tenant_id', TENANT_ID);

      if (updateNameErr) {
        console.error(`  ❌ Erro ao atualizar nome do client ${client.id}:`, updateNameErr.message);
      } else {
        updatedNames++;
        console.log(`     📝 Nome atualizado: "${client.name}" → "${entry.bestName}"`);
      }
    }
  }

  // ── 5. Resumo ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESUMO FINAL:');
  console.log(`   ✅ Pedidos relinkados: ${linkedOrders}`);
  console.log(`   📝 Nomes atualizados:  ${updatedNames}`);
  console.log(`   ⚠️  Sem client match:   ${skippedNoClient} telefones`);
  console.log('═══════════════════════════════════════\n');

  // ── 6. Bonus: atualizar clients com nome=telefone que têm pedidos já linkados ─
  console.log('🔍 Buscando clientes com nome=telefone que já têm pedidos linkados...\n');

  const { data: dirtyClients, error: dirtyErr } = await supabase
    .from('clients')
    .select('id, name, phone_normalized')
    .eq('tenant_id', TENANT_ID);

  if (dirtyErr) {
    console.error('❌ Erro ao buscar clientes sujos:', dirtyErr.message);
    return;
  }

  const phoneLikeClients = (dirtyClients || []).filter(c => isPhoneName(c.name));
  console.log(`📱 Clientes com nome=telefone: ${phoneLikeClients.length}`);

  let bonusUpdated = 0;
  for (const c of phoneLikeClients) {
    // Busca pedidos linkados deste client com nome válido
    const { data: linked } = await supabase
      .from('orders')
      .select('metadata')
      .eq('client_id', c.id)
      .eq('tenant_id', TENANT_ID)
      .limit(10);

    if (!linked || linked.length === 0) continue;

    let bestName = null;
    for (const order of linked) {
      const nome = order.metadata?.cliente_nome;
      if (isGoodName(nome)) {
        bestName = nome.trim();
        break;
      }
    }

    if (!bestName) continue;

    const { error: upErr } = await supabase
      .from('clients')
      .update({ name: bestName })
      .eq('id', c.id)
      .eq('tenant_id', TENANT_ID);

    if (!upErr) {
      bonusUpdated++;
      console.log(`  📝 "${c.name}" → "${bestName}"`);
    }
  }

  console.log(`\n✅ Nomes corrigidos via pedidos já linkados: ${bonusUpdated}`);
  console.log('\n🎉 CONCLUÍDO!');
}

main().catch(console.error);
