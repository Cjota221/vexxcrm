/**
 * reprocess-client-tracking.js
 *
 * Dado um telefone de cliente, busca DIRETAMENTE na Evolution API
 * todas as mensagens outbound (fromMe) da conversa e vincula cada
 * código de rastreio ao pedido mais próximo em data.
 *
 * Útil para corrigir clientes com múltiplos pedidos (ex: Rose Rosilene)
 * onde o recover-tracking-codes.js aplicou o mesmo código em todos.
 *
 * USO:
 *   node scripts/reprocess-client-tracking.js --phone=62999999999
 *   node scripts/reprocess-client-tracking.js --phone=62999999999 --apply
 *
 * OPÇÕES:
 *   --phone=NUMERO   Telefone do cliente (apenas dígitos, com DDD, sem 55)
 *   --apply          Grava as alterações no banco (default: dry-run)
 *   --reset          Remove todos os tracking_codes dos pedidos deste cliente
 *                    antes de re-vincular (útil para corrigir vinculações erradas)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dhknxyjsibqdrgwpgvob.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVOLUTION_URL  = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY  = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
const TENANT_ID      = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const INSTANCE       = `vexx-${TENANT_ID.replace(/-/g, '').slice(0, 12)}`;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY não encontrada no .env.local');
  process.exit(1);
}

if (!EVOLUTION_URL || !EVOLUTION_KEY) {
  console.error('❌ EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY são obrigatórias no .env.local');
  console.error('   Rodando em modo BANCO APENAS (sem Evolution API)...\n');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Argumentos
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const RESET   = args.includes('--reset');
const phoneArg = (args.find(a => a.startsWith('--phone=')) || '').replace('--phone=', '').trim();

if (!phoneArg) {
  console.error('❌ Informe o telefone: --phone=62999999999');
  process.exit(1);
}

// ─── Padrões de rastreio (mesmos do anne-pipeline) ────────────────────────────

const TRACKING_PATTERNS = [
  { name: 'Correios',      regex: /\b([A-Z]{2}\d{9}BR)\b/i },
  { name: 'Jadlog',        regex: /\b(JD\d{10})\b/i },
  { name: 'Total Express', regex: /\b(TE\d{12})\b/i },
  { name: 'J&T Express',   regex: /\b(\d{13,16})\b/ },
  { name: 'Loggi',         regex: /\b(FZ[A-Z0-9]{12,16})\b/i },
  { name: 'Shopee Xpress', regex: /\b(SP[A-Z0-9]{10,16})\b/i },
  { name: 'Sequoia',       regex: /\b(SEQ[A-Z0-9]{8,14})\b/i },
  { name: 'Genérico',      regex: /\b([A-Z]{1,3}[0-9]{6,}[A-Z0-9]{0,8}|[A-Z0-9]{3,}[0-9]{8,})\b/ },
];

function isFalsePositive(code) {
  const c = code.replace(/\D/g, '');
  if (/^\d+$/.test(code) && (c.length === 10 || c.length === 11)) return true;
  if (/^\d{11}$/.test(c)) return true;
  if (/^\d{14}$/.test(c)) return true;
  if (/^\d{8}$/.test(c)) return true;
  if (/^20\d{2}$/.test(code)) return true;
  if (/^\d{1,5}$/.test(code)) return true;
  return false;
}

function extractTrackingCode(text) {
  if (!text) return null;
  for (const p of TRACKING_PATTERNS) {
    const match = text.match(p.regex);
    if (match) {
      const code = match[1].toUpperCase().trim();
      if (isFalsePositive(code)) continue;
      return { code, carrier: p.name };
    }
  }
  return null;
}

function buildTrackingUrl(code, carrier) {
  const u = code.toUpperCase();
  if (carrier === 'Correios' || /^[A-Z]{2}\d{9}BR$/i.test(u))
    return `https://rastreamento.correios.com.br/app/index.php?objetos=${u}`;
  if (carrier === 'Jadlog' || u.startsWith('JD'))
    return `https://www.jadlog.com.br/jadlog/tracking.jad?cte=${u}`;
  if (carrier === 'Total Express' || u.startsWith('TE'))
    return `https://www.totalexpress.com.br/rastreamento/${u}`;
  if (carrier === 'J&T Express' || /^\d{13,16}$/.test(u))
    return `https://www.jtexpress.com.br/trajectoryQuery?bills=${u}`;
  if (carrier === 'Loggi' || u.startsWith('FZ'))
    return `https://www.loggi.com/rastreador/?q=${u}`;
  if (carrier === 'Shopee Xpress' || u.startsWith('SP'))
    return `https://spx.shopee.com.br/track?trackingNumber=${u}`;
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${u}`;
}

// ─── Normalizar telefone ──────────────────────────────────────────────────────

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  // Remover 55 inicial se presente
  if (digits.startsWith('55') && digits.length > 11) return digits.slice(2);
  return digits;
}

// ─── Buscar mensagens da Evolution API ───────────────────────────────────────

async function fetchMessagesFromEvolution(jid) {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return [];

  let allRecords = [];
  let page = 1;
  const offset = 100;

  while (true) {
    try {
      const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
        body: JSON.stringify({ where: { key: { remoteJid: jid } }, page, offset }),
      });
      if (!res.ok) break;
      const data = await res.json();
      const records = data.messages?.records || [];
      allRecords = allRecords.concat(records);
      if (page >= (data.messages?.pages || 1)) break;
      page++;
    } catch {
      break;
    }
  }

  return allRecords;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const phone = normalizePhone(phoneArg);
  const phoneWithCode = phone.length === 11 ? `55${phone}` : phone;
  const jid = `${phoneWithCode}@s.whatsapp.net`;

  console.log('━'.repeat(60));
  console.log('🔧 REPROCESSAR RASTREIOS — Cliente específico');
  console.log('━'.repeat(60));
  console.log(`📱 Telefone      : ${phone} (${phoneWithCode})`);
  console.log(`🆔 JID Evolution : ${jid}`);
  console.log(DRY_RUN ? '⚠️  DRY-RUN (sem alterações)' : '✅ APPLY (gravando no banco)');
  if (RESET && !DRY_RUN) console.log('🗑️  RESET ativado — tracking_codes serão limpos antes de re-vincular');
  console.log('');

  // ── 1. Localizar o cliente no banco ──────────────────────────────────────
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone_normalized')
    .eq('tenant_id', TENANT_ID)
    .or(`phone_normalized.eq.${phone},phone_normalized.eq.${phoneWithCode},phone_normalized.eq.55${phone}`)
    .maybeSingle();

  if (!client) {
    console.error(`❌ Cliente não encontrado no banco para o telefone ${phone}`);
    console.error('   Tente variações: com ou sem 55, com ou sem 9 extra');
    process.exit(1);
  }

  console.log(`👤 Cliente encontrado: ${client.name} (${client.id})`);

  // ── 2. Buscar pedidos do cliente ─────────────────────────────────────────
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, order_number, tracking_code, status, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('client_id', client.id)
    .order('created_at', { ascending: true });

  if (ordErr || !orders?.length) {
    console.error('❌ Nenhum pedido encontrado para este cliente');
    process.exit(1);
  }

  console.log(`\n📦 Pedidos encontrados: ${orders.length}`);
  for (const o of orders) {
    const trackLabel = o.tracking_code ? `✅ ${o.tracking_code}` : '⬜ sem rastreio';
    console.log(`   #${o.order_number} [${o.status}] ${o.created_at.slice(0, 10)} — ${trackLabel}`);
  }

  // ── 3. RESET: limpar tracking_codes existentes se solicitado ─────────────
  if (RESET && !DRY_RUN) {
    console.log('\n🗑️  Removendo tracking_codes existentes...');
    const { error } = await supabase
      .from('orders')
      .update({ tracking_code: null, tracking_url: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', TENANT_ID)
      .eq('client_id', client.id);
    if (error) {
      console.error('❌ Erro ao limpar:', error.message);
      process.exit(1);
    }
    for (const o of orders) {
      o.tracking_code = null;
      o.tracking_url = null;
    }
    console.log('   ✅ tracking_codes removidos');
  }

  // ── 4. Buscar mensagens — Evolution API primeiro, banco como fallback ─────
  console.log('\n📡 Buscando mensagens outbound...');

  let messages = [];

  // 4a. Tentar Evolution API
  if (EVOLUTION_URL && EVOLUTION_KEY) {
    console.log('   Tentando Evolution API...');
    const evMsgs = await fetchMessagesFromEvolution(jid);
    const outbound = evMsgs.filter(m => m.key?.fromMe && (
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption
    ));
    if (outbound.length > 0) {
      messages = outbound.map(m => ({
        source: 'evolution',
        content: (
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption || ''
        ),
        created_at: m.messageTimestamp
          ? new Date(m.messageTimestamp * 1000).toISOString()
          : null,
        external_id: m.key?.id,
      }));
      console.log(`   ✅ ${messages.length} mensagens outbound da Evolution API`);
    } else {
      console.log('   ⚠️  Nenhuma mensagem outbound encontrada na Evolution API');
    }
  }

  // 4b. Fallback: banco de dados
  if (messages.length === 0) {
    console.log('   Usando banco de dados como fallback...');
    const { data: dbMsgs } = await supabase
      .from('messages')
      .select('id, content, created_at, external_id')
      .eq('tenant_id', TENANT_ID)
      .eq('client_id', client.id)
      .eq('direction', 'outbound')
      .not('content', 'is', null)
      .order('created_at', { ascending: true });
    if (dbMsgs?.length) {
      messages = dbMsgs.map(m => ({ ...m, source: 'database' }));
      console.log(`   ✅ ${messages.length} mensagens outbound do banco`);
    } else {
      console.error('   ❌ Nenhuma mensagem outbound encontrada no banco tampouco');
      process.exit(1);
    }
  }

  // ── 5. Extrair códigos de rastreio das mensagens ──────────────────────────
  console.log('\n🔍 Procurando códigos de rastreio...\n');

  // Montar mapa: código → mensagem (data)
  // Pegar APENAS a primeira ocorrência de cada código (a mais antiga = quando foi enviado)
  const codeMap = new Map(); // code → { carrier, msgDate, msgContent }
  for (const msg of messages) {
    if (!msg.content) continue;
    const tracking = extractTrackingCode(msg.content);
    if (!tracking) continue;
    const { code, carrier } = tracking;
    if (!codeMap.has(code)) {
      codeMap.set(code, {
        carrier,
        msgDate: msg.created_at,
        msgContent: msg.content.slice(0, 80),
        source: msg.source,
      });
    }
  }

  if (codeMap.size === 0) {
    console.log('❌ Nenhum código de rastreio encontrado nas mensagens deste cliente');
    process.exit(0);
  }

  console.log(`📋 ${codeMap.size} código(s) de rastreio encontrado(s):`);
  for (const [code, info] of codeMap) {
    console.log(`   ${code} [${info.carrier}] em ${info.msgDate?.slice(0, 10)} via ${info.source}`);
  }

  // ── 6. Mapa de pedidos disponíveis (sem tracking ainda) ───────────────────
  // Recarregar para ter estado atual
  const { data: freshOrders } = await supabase
    .from('orders')
    .select('id, order_number, tracking_code, status, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('client_id', client.id)
    .order('created_at', { ascending: true });

  const availableOrders = (freshOrders || []).filter(o => !o.tracking_code);

  console.log(`\n📦 Pedidos SEM rastreio: ${availableOrders.length} de ${freshOrders?.length || 0}`);

  // ── 7. Vincular cada código ao pedido mais próximo em data ────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('🔗 Vinculações:');
  console.log('─'.repeat(60));

  const usedOrderIds = new Set();
  let linked = 0;
  let skipped = 0;

  // Ordenar códigos por data da mensagem (mais antigas primeiro)
  const sortedCodes = [...codeMap.entries()].sort((a, b) =>
    new Date(a[1].msgDate || 0).getTime() - new Date(b[1].msgDate || 0).getTime()
  );

  for (const [code, info] of sortedCodes) {
    const msgTime = info.msgDate ? new Date(info.msgDate).getTime() : 0;

    // Encontrar o pedido disponível mais próximo em data desta mensagem
    const candidates = availableOrders.filter(o => !usedOrderIds.has(o.id));

    if (candidates.length === 0) {
      console.log(`   ${code} → ❌ sem pedido disponível`);
      skipped++;
      continue;
    }

    candidates.sort((a, b) => {
      const diffA = Math.abs(new Date(a.created_at).getTime() - msgTime);
      const diffB = Math.abs(new Date(b.created_at).getTime() - msgTime);
      return diffA - diffB;
    });

    const order = candidates[0];
    const diffDays = msgTime
      ? Math.round(Math.abs(new Date(order.created_at).getTime() - msgTime) / 86400000)
      : '?';

    console.log(`   ${code} [${info.carrier}]`);
    console.log(`     → Pedido #${order.order_number} [${order.status}] (${diffDays} dias de diferença)`);
    console.log(`     → Msg: ${info.msgDate?.slice(0, 10)} | Pedido: ${order.created_at.slice(0, 10)}`);

    if (!DRY_RUN) {
      const url = buildTrackingUrl(code, info.carrier);
      const { error } = await supabase
        .from('orders')
        .update({
          tracking_code: code,
          tracking_url: url,
          status: order.status === 'pending' ? 'shipped' : order.status,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', TENANT_ID)
        .eq('id', order.id);

      if (error) {
        console.log(`     ❌ ERRO: ${error.message}`);
        skipped++;
        continue;
      }

      // Mover kanban
      await supabase
        .from('kanban_cards')
        .update({ column_id: 'DESPACHADO', updated_at: new Date().toISOString() })
        .eq('tenant_id', TENANT_ID)
        .eq('order_id', order.id);

      console.log(`     ✅ GRAVADO`);
    } else {
      console.log(`     🔵 (dry-run — não gravado)`);
    }

    usedOrderIds.add(order.id);
    linked++;
  }

  // ── 8. Resumo ─────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(60));
  console.log('📊 RESUMO');
  console.log('━'.repeat(60));
  console.log(`✅ Vinculados  : ${linked}`);
  console.log(`⚠️  Sem pedido  : ${skipped}`);

  if (DRY_RUN && linked > 0) {
    console.log('\n🚀 Para aplicar, execute:');
    console.log(`   node scripts/reprocess-client-tracking.js --phone=${phoneArg} --apply`);
    if (!RESET) {
      console.log('\n💡 Se os pedidos já têm tracking_code incorreto, adicione --reset:');
      console.log(`   node scripts/reprocess-client-tracking.js --phone=${phoneArg} --apply --reset`);
    }
  }

  if (!DRY_RUN) {
    console.log('\n✅ Reprocessamento concluído!');
  }
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
