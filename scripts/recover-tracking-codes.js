/**
 * recover-tracking-codes.js
 *
 * Varre todas as mensagens salvas no banco procurando códigos de rastreio
 * que ainda não foram vinculados aos pedidos correspondentes.
 *
 * Corrige retroativamente casos como a Josiele — onde a FacilZap já enviou
 * a mensagem com o código mas o webhook não fez a vinculação.
 *
 * USO:
 *   node scripts/recover-tracking-codes.js           → dry-run (só mostra)
 *   node scripts/recover-tracking-codes.js --apply   → aplica as correções
 *
 * SAÍDA:
 *   - Lista de mensagens com código detectado
 *   - Pedido vinculado (ou motivo da falha)
 *   - Resumo final: X vinculados, Y já tinham código, Z sem pedido encontrado
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dhknxyjsibqdrgwpgvob.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa254eWpzaWJxZHJnd3Bndm9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjEwMTc4NiwiZXhwIjoyMDUxNjc3Nzg2fQ.DdOEn0nDmObHhLEk8xn-6OvVLn-Gj_WIFPd0hnTbQmQ';

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DRY_RUN = !process.argv.includes('--apply');
const PAGE_SIZE = 500;

// ─── Mesmos padrões do anne-pipeline.ts ───────────────────────────────────────

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

// Rejeita números que claramente são telefone, CPF, CNPJ, CEP ou ano
function isFalsePositive(code) {
  const c = code.replace(/\D/g, '');
  // Telefones BR: 10-11 dígitos numéricos puros
  if (/^\d+$/.test(code) && (c.length === 10 || c.length === 11)) return true;
  // CPF: 11 dígitos numéricos
  if (/^\d{11}$/.test(c)) return true;
  // CNPJ: 14 dígitos numéricos
  if (/^\d{14}$/.test(c)) return true;
  // CEP: 8 dígitos
  if (/^\d{8}$/.test(c)) return true;
  // Anos: 4 dígitos como 2024, 2025, 2026
  if (/^20\d{2}$/.test(code)) return true;
  // Números muito curtos (<=5 dígitos puros)
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

function extractOrderNumber(text) {
  if (!text) return null;
  const m =
    text.match(/pedido\s?#?\s?(\d{3,9})/i) ??
    text.match(/#(\d{4,9})\b/) ??
    text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━'.repeat(70));
  console.log('📦 RECUPERAÇÃO DE CÓDIGOS DE RASTREIO — Vexx CRM');
  console.log('━'.repeat(70));
  console.log(DRY_RUN
    ? '⚠️  MODO DRY-RUN — nenhuma alteração será feita (use --apply para aplicar)'
    : '✅  MODO APPLY — alterações serão gravadas no banco');
  console.log(`🏢 Tenant: ${TENANT_ID}`);
  console.log('');

  // Contadores
  let totalMessages = 0;
  let withTracking  = 0;  // mensagens onde detectamos código
  let alreadyHad    = 0;  // pedido já tinha esse código
  let linked        = 0;  // vinculados agora
  let noOrder       = 0;  // código detectado mas pedido não encontrado
  let errors        = 0;

  const results = []; // para tabela final

  // Paginar mensagens outbound (fromMe) que tenham conteúdo de texto
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, client_id, created_at')
      .eq('tenant_id', TENANT_ID)
      .eq('direction', 'outbound')
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('❌ Erro ao buscar mensagens:', error.message);
      break;
    }
    if (!messages || messages.length === 0) break;

    totalMessages += messages.length;
    process.stdout.write(`\r🔍 Varrendo... página ${page + 1} (${totalMessages} mensagens lidas)`);

    for (const msg of messages) {
      const tracking = extractTrackingCode(msg.content);
      if (!tracking) continue;

      withTracking++;
      const { code, carrier } = tracking;
      const orderNumber = extractOrderNumber(msg.content);

      // ── Buscar o pedido ──────────────────────────────────────────────────
      let order = null;

      // Estratégia A: número do pedido explícito na mensagem
      if (orderNumber) {
        const { data } = await supabase
          .from('orders')
          .select('id, order_number, tracking_code, status')
          .eq('tenant_id', TENANT_ID)
          .eq('order_number', orderNumber)
          .maybeSingle();
        if (data) order = data;
      }

      // Estratégia B: pedido do cliente sem tracking_code MAIS PRÓXIMO da data da mensagem
      // (resolve clientes com vários pedidos como Rose Rosilene — não pega sempre o mesmo)
      if (!order && msg.client_id) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, tracking_code, status, created_at')
          .eq('tenant_id', TENANT_ID)
          .eq('client_id', msg.client_id)
          .is('tracking_code', null)
          .in('status', ['shipped', 'processing', 'confirmed', 'pending']);
        if (orders?.length) {
          const msgTime = new Date(msg.created_at).getTime();
          // Ordenar por proximidade temporal com a mensagem
          orders.sort((a, b) => {
            const diffA = Math.abs(new Date(a.created_at).getTime() - msgTime);
            const diffB = Math.abs(new Date(b.created_at).getTime() - msgTime);
            return diffA - diffB;
          });
          order = orders[0];
        }
      }

      // Estratégia C: qualquer pedido sem tracking_code mais próximo da data da mensagem
      if (!order && msg.client_id) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, tracking_code, status, created_at')
          .eq('tenant_id', TENANT_ID)
          .eq('client_id', msg.client_id)
          .is('tracking_code', null);
        if (orders?.length) {
          const msgTime = new Date(msg.created_at).getTime();
          orders.sort((a, b) => {
            const diffA = Math.abs(new Date(a.created_at).getTime() - msgTime);
            const diffB = Math.abs(new Date(b.created_at).getTime() - msgTime);
            return diffA - diffB;
          });
          order = orders[0];
        }
      }

      if (!order) {
        noOrder++;
        results.push({
          status: '⚠️  SEM PEDIDO',
          code,
          carrier,
          orderNumber: orderNumber ?? '—',
          orderId: '—',
          clientId: msg.client_id ?? '—',
          msgDate: msg.created_at?.slice(0, 10),
        });
        continue;
      }

      // Já tem o mesmo código → pular
      if (order.tracking_code === code) {
        alreadyHad++;
        results.push({
          status: '✓  JÁ TINHA',
          code,
          carrier,
          orderNumber: order.order_number,
          orderId: order.id,
          clientId: msg.client_id ?? '—',
          msgDate: msg.created_at?.slice(0, 10),
        });
        continue;
      }

      // ── Aplicar vinculação ───────────────────────────────────────────────
      if (!DRY_RUN) {
        const trackingUrl = buildTrackingUrl(code, carrier);

        const { error: updErr } = await supabase
          .from('orders')
          .update({
            tracking_code: code,
            tracking_url:  trackingUrl,
            status:        order.status === 'pending' ? 'shipped' : order.status,
            updated_at:    new Date().toISOString(),
          })
          .eq('tenant_id', TENANT_ID)
          .eq('id', order.id);

        if (updErr) {
          errors++;
          results.push({
            status: '❌ ERRO',
            code,
            carrier,
            orderNumber: order.order_number,
            orderId: order.id,
            clientId: msg.client_id ?? '—',
            msgDate: msg.created_at?.slice(0, 10),
            detail: updErr.message,
          });
          continue;
        }

        // Mover kanban → DESPACHADO
        await supabase
          .from('kanban_cards')
          .update({ column_id: 'DESPACHADO', updated_at: new Date().toISOString() })
          .eq('tenant_id', TENANT_ID)
          .eq('order_id', order.id);
      }

      linked++;
      results.push({
        status: DRY_RUN ? '🔵 PENDENTE' : '✅ VINCULADO',
        code,
        carrier,
        orderNumber: order.order_number,
        orderId: order.id,
        clientId: msg.client_id ?? '—',
        msgDate: msg.created_at?.slice(0, 10),
      });
    }

    if (messages.length < PAGE_SIZE) break;
    page++;
  }

  // ─── Relatório ─────────────────────────────────────────────────────────────
  console.log('\n\n' + '━'.repeat(70));
  console.log('📊 RESULTADO');
  console.log('━'.repeat(70));
  console.log(`📩 Mensagens outbound varridas : ${totalMessages}`);
  console.log(`🔍 Com código de rastreio      : ${withTracking}`);
  console.log(`✅ Vinculados                  : ${linked}`);
  console.log(`✓  Já tinham o código          : ${alreadyHad}`);
  console.log(`⚠️  Sem pedido encontrado       : ${noOrder}`);
  console.log(`❌ Erros                        : ${errors}`);

  if (results.length > 0) {
    console.log('\n' + '━'.repeat(70));
    console.log('📋 DETALHES');
    console.log('━'.repeat(70));
    console.log(
      'Status'.padEnd(14) +
      'Código'.padEnd(22) +
      'Transportadora'.padEnd(16) +
      'Pedido'.padEnd(12) +
      'Data msg'
    );
    console.log('─'.repeat(70));
    for (const r of results) {
      console.log(
        r.status.padEnd(14) +
        r.code.padEnd(22) +
        r.carrier.padEnd(16) +
        String(r.orderNumber).padEnd(12) +
        (r.msgDate ?? '—')
      );
      if (r.detail) console.log('   └─ Detalhe:', r.detail);
    }
  }

  if (DRY_RUN && linked > 0) {
    console.log('\n' + '━'.repeat(70));
    console.log(`🚀 Para aplicar as ${linked} vinculações, execute:`);
    console.log('   node scripts/recover-tracking-codes.js --apply');
    console.log('━'.repeat(70));
  }

  if (!DRY_RUN) {
    console.log('\n✅ Recuperação concluída!');
  }
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
