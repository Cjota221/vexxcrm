/**
 * recover-client-names.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Recupera o nome real dos clientes que estão com nome = número de telefone.
 *
 * Fontes (em ordem de prioridade):
 *   1. orders.customer_name — nome real do pedido (mais confiável)
 *   2. pushName da Evolution API — nome do WhatsApp do contato
 *
 * Uso:
 *   node scripts/recover-client-names.js            ← modo real
 *   node scripts/recover-client-names.js --dry-run  ← só mostra o que seria feito
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// ─── Config ──────────────────────────────────────────────────────────────────

const TENANT_ID     = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
const INSTANCE      = `vexx-${TENANT_ID.replace(/-/g, '').slice(0, 12)}`;
const DRY_RUN       = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Retorna true se o nome é apenas um número de telefone (sem nome real) */
function isPhoneName(name) {
  if (!name || !name.trim()) return true;
  const stripped = name.trim().replace(/[\s\-\+\(\)\.]/g, '');
  return /^\d{8,15}$/.test(stripped);
}

/** Retorna true se o nome é um nome real válido */
function isGoodName(name) {
  if (!name || !name.trim()) return false;
  const t = name.trim();
  if (t.length < 3) return false;
  const BLACKLIST = [
    'você', 'voce', 'loja', 'cjota', 'rasteirinhas',
    'atendente', 'suporte', 'desconhecido', 'j rasteirinhas',
  ];
  if (BLACKLIST.some(b => t.toLowerCase().includes(b))) return false;
  if (isPhoneName(t)) return false;
  return true;
}

/** Gera todas as variações de telefone para matching */
function phoneVariants(digits) {
  const variants = new Set([digits]);
  if (!digits.startsWith('55')) variants.add('55' + digits);
  // 13 dígitos com 9 → tirar o 9 (12 dígitos)
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.startsWith('9')) variants.add('55' + ddd + num.slice(1));
  }
  // 12 dígitos → adicionar o 9 (13 dígitos)
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    variants.add('55' + ddd + '9' + num);
  }
  return Array.from(variants);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 RECOVER CLIENT NAMES ${DRY_RUN ? '[DRY-RUN]' : '[MODO REAL]'}\n`);

  // ── 1. Buscar todos os clients com nome = telefone (paginado) ───────────────
  console.log('📥 Carregando clientes com nome = telefone...');
  const allClients = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, phone, phone_normalized, name_manual')
      .eq('tenant_id', TENANT_ID)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (clientErr) { console.error('❌ Erro:', clientErr.message); process.exit(1); }
    allClients.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    page++;
  }

  // Somente clientes sem name_manual E com nome = telefone
  const dirty = allClients.filter(c => !c.name_manual && isPhoneName(c.name));
  console.log(`   Total de clients: ${allClients.length}`);
  console.log(`   Com nome = telefone: ${dirty.length}\n`);

  if (dirty.length === 0) {
    console.log('✅ Nenhum cliente com nome sujo encontrado. Nada a fazer.');
    return;
  }

  // ── 2. FONTE 1: Pedidos → customer_name ──────────────────────────────────
  console.log('📦 Fonte 1: Buscando nomes nos pedidos vinculados...');

  const dirtyIds = dirty.map(c => c.id);

  // Buscar em chunks de 100 (limite do Supabase para .in())
  const CHUNK = 100;
  const nameFromOrder = new Map();
  for (let i = 0; i < dirtyIds.length; i += CHUNK) {
    const chunk = dirtyIds.slice(i, i + CHUNK);
    const { data: orders } = await supabase
      .from('orders')
      .select('client_id, customer_name')
      .eq('tenant_id', TENANT_ID)
      .in('client_id', chunk)
      .not('customer_name', 'is', null)
      .order('created_at', { ascending: false });

    for (const o of orders || []) {
      if (!nameFromOrder.has(o.client_id) && isGoodName(o.customer_name)) {
        nameFromOrder.set(o.client_id, o.customer_name.trim());
      }
    }
  }
  console.log(`   Nomes encontrados via pedidos: ${nameFromOrder.size}`);

  // ── 3. FONTE 2: Evolution API → pushName ──────────────────────────────────
  const pushNameMap = new Map(); // phone_normalized → pushName

  if (EVOLUTION_URL && EVOLUTION_KEY) {
    console.log('\n📡 Fonte 2: Buscando pushName na Evolution API...');
    try {
      const res = await fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
        body: JSON.stringify({ where: {} }),
      });

      if (res.ok) {
        const raw = await res.json();
        const contacts = Array.isArray(raw) ? raw : (raw.contacts || raw.data || []);
        console.log(`   ${contacts.length} contatos na Evolution`);

        // Construir mapa phone → pushName para os contatos válidos
        const INSTANCE_BLACKLIST = ['cjota', 'rasteirinhas', 'você', 'voce', 'loja', INSTANCE.toLowerCase()];
        for (const c of contacts) {
          if (!c.remoteJid?.includes('@s.whatsapp.net')) continue;
          const push = (c.pushName || '').trim();
          if (!isGoodName(push)) continue;
          if (INSTANCE_BLACKLIST.some(b => push.toLowerCase().includes(b))) continue;

          const jidDigits = c.remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
          // Armazenar por todas as variações do número
          for (const v of phoneVariants(jidDigits)) {
            if (!pushNameMap.has(v)) pushNameMap.set(v, push);
          }
        }
        console.log(`   Mapa de pushNames válidos: ${pushNameMap.size} entradas`);
      } else {
        console.warn(`   ⚠️ Erro na Evolution API (${res.status}) — usando apenas pedidos`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Evolution API inacessível — usando apenas pedidos`);
    }
  } else {
    console.log('\n⚠️  EVOLUTION_API_URL não configurado — usando apenas pedidos\n');
  }

  // ── 4. Aplicar as atualizações ────────────────────────────────────────────
  console.log('\n✏️  Aplicando atualizações...\n');

  let byOrder    = 0;
  let byPushName = 0;
  let notFound   = 0;
  let errors     = 0;

  for (const client of dirty) {
    // Prioridade 1: nome do pedido
    let newName = nameFromOrder.get(client.id) || null;
    let source  = 'pedido';

    // Prioridade 2: pushName da Evolution
    if (!newName) {
      const phoneDigits = (client.phone_normalized || client.phone || '').replace(/\D/g, '');
      for (const v of phoneVariants(phoneDigits)) {
        if (pushNameMap.has(v)) {
          newName = pushNameMap.get(v);
          source  = 'pushName';
          break;
        }
      }
    }

    if (!newName) {
      notFound++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [${source}] "${client.name}" → "${newName}"`);
      if (source === 'pedido') byOrder++; else byPushName++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('clients')
      .update({ name: newName })
      .eq('id', client.id)
      .eq('tenant_id', TENANT_ID);

    if (upErr) {
      console.error(`  ❌ Erro ao atualizar ${client.id}:`, upErr.message);
      errors++;
    } else {
      console.log(`  ✅ [${source}] "${client.name}" → "${newName}"`);
      if (source === 'pedido') byOrder++; else byPushName++;
    }
  }

  // ── 5. Resumo ─────────────────────────────────────────────────────────────
  const total = byOrder + byPushName;
  console.log('\n══════════════════════════════════════════════');
  console.log('📊 RESUMO FINAL:');
  console.log(`   ✅ Total atualizados : ${total}`);
  console.log(`      └ via pedidos     : ${byOrder}`);
  console.log(`      └ via pushName    : ${byPushName}`);
  console.log(`   ❓ Sem nome encontrado: ${notFound} (nunca fizeram pedido nem mandaram msg)`);
  console.log(`   ❌ Erros             : ${errors}`);
  console.log('══════════════════════════════════════════════\n');

  if (notFound > 0) {
    console.log(`ℹ️  Os ${notFound} restantes não têm pedido vinculado nem histórico na Evolution.`);
    console.log('   São clientes que vieram de chats sem mensagens recebidas (só disparos).');
    console.log('   O nome será recuperado automaticamente quando eles responderem.');
  }
}

main().catch(console.error);
