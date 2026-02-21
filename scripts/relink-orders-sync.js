/**
 * relink-orders-sync.js
 *
 * Cruzamento COMPLETO de pedidos órfãos da FacilZap com clientes.
 *
 * Rounds de match (em ordem de confiança):
 *   1.  WhatsApp E.164 (cliente_whatsapp_e164)
 *   2.  Telefone — todas as chaves + variações (9 dígito, sem 9, canonical)
 *   3.  FacilZap ID (cliente_id_facilzap)
 *   4.  CPF limpo (11 dígitos)
 *   5.  CNPJ limpo (14 dígitos)
 *   6.  Email (cliente_email | email | demais_dados.email)
 *   7.  CEP + primeiro nome
 *   8.  Nome completo (match exato)
 *   9.  Nome parcial (primeiro + último)
 *   10. Nome parcial (primeiro + penúltimo)
 *
 * Uso:
 *   node scripts/relink-orders-sync.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env.local');
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Phone helpers ─────────────────────────────────────────────────────────────

function cleanPhone(raw) {
  return (raw || '').replace(/\D/g, '');
}

function normalizePhone(raw) {
  if (!raw) return '';
  const d = cleanPhone(raw);
  if (!d || d.length < 8) return '';
  const withDDI = d.startsWith('55') && d.length >= 12 ? d : '55' + d;
  const wo = withDDI.slice(2);
  if (/^(\d{2})(9)(\d{8})$/.test(wo)) return '55' + wo;
  const m = wo.match(/^(\d{2})(\d{8})$/);
  if (m && '6789'.includes(m[2][0])) return '55' + m[1] + '9' + m[2];
  return withDDI;
}

function canonicalPhone(raw) {
  if (!raw) return '';
  const d = cleanPhone(raw);
  if (!d || d.length < 8) return '';
  const withDDI = d.startsWith('55') && d.length >= 12 ? d : '55' + d;
  const wo = withDDI.slice(2);
  const m = wo.match(/^(\d{2})(9)(\d{8})$/);
  if (m) return '55' + m[1] + m[3];
  if (/^(\d{2})(\d{8})$/.test(wo)) return '55' + wo;
  return withDDI;
}

/** Gera todas as variações de um número de telefone */
function phoneVariants(raw) {
  if (!raw) return [];
  const clean = cleanPhone(String(raw));
  if (!clean || clean.length < 8) return [];
  const variants = new Set();
  variants.add(clean);
  variants.add(normalizePhone(clean));
  variants.add(canonicalPhone(clean));
  const wo55 = clean.startsWith('55') ? clean.slice(2) : clean;
  variants.add(wo55);
  variants.add(normalizePhone(wo55));
  variants.add(canonicalPhone(wo55));
  const with55 = wo55.startsWith('55') ? wo55 : '55' + wo55;
  variants.add(with55);
  variants.add(normalizePhone(with55));
  variants.add(canonicalPhone(with55));
  return [...variants].filter(v => v && v.length >= 8);
}

// ── Helpers gerais ────────────────────────────────────────────────────────────

function cleanDoc(raw) { return (raw || '').replace(/\D/g, ''); }
function cleanCep(raw) { return (raw || '').replace(/\D/g, ''); }

async function fetchAll(table, select, filters = {}) {
  const all = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + batchSize - 1);
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) q = q.is(key, null);
      else q = q.eq(key, val);
    }
    const { data, error } = await q;
    if (error) { console.error(`Erro ao buscar ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔗 RELINK ORDERS — Cruzamento completo (10 rounds)\n');

  // ── 1. Carregar clientes ──────────────────────────────────────────────────
  console.log('👥 Carregando clientes...');
  const clients = await fetchAll(
    'clients',
    'id, phone, phone_normalized, name, email, custom_fields',
    { tenant_id: TENANT_ID }
  );
  console.log(`   ✅ ${clients.length} clientes carregados`);

  // ── 2. Construir mapas de lookup ──────────────────────────────────────────
  const phoneMap   = new Map();
  const fzIdMap    = new Map();
  const emailMap   = new Map();
  const cpfMap     = new Map();
  const cnpjMap    = new Map();
  const cepNomeMap = new Map();
  const nameMap    = new Map();

  for (const c of clients) {
    const cf = c.custom_fields || {};
    const dd = (cf.demais_dados && typeof cf.demais_dados === 'object' && !Array.isArray(cf.demais_dados))
               ? cf.demais_dados : {};

    // Telefone — phone, phone_normalized, demais_dados.telefone, demais_dados.telefone_e164
    for (const src of [c.phone, c.phone_normalized, dd.telefone, dd.telefone_e164].filter(Boolean)) {
      for (const v of phoneVariants(src)) {
        if (!phoneMap.has(v)) phoneMap.set(v, c.id);
      }
    }

    // FacilZap ID
    const fzId = cf.facilzap_id || cf.cliente_id;
    if (fzId) fzIdMap.set(String(fzId), c.id);

    // Email — tabela + demais_dados
    for (const rawEmail of [c.email, dd.email].filter(Boolean)) {
      const em = rawEmail.toLowerCase().trim();
      if (em.includes('@') && !emailMap.has(em)) emailMap.set(em, c.id);
    }

    // CPF / CNPJ
    const doc = cleanDoc(cf.cpf_cnpj || dd.cpf_cnpj || '');
    if (doc.length === 11 && !cpfMap.has(doc))  cpfMap.set(doc, c.id);
    if (doc.length === 14 && !cnpjMap.has(doc)) cnpjMap.set(doc, c.id);

    // CEP + primeiro nome
    const cep = cleanCep(dd.cep || '');
    if (cep.length >= 7 && c.name) {
      const primeiro = c.name.trim().split(/\s+/)[0].toLowerCase();
      const key = `${cep}|${primeiro}`;
      if (!cepNomeMap.has(key)) cepNomeMap.set(key, c.id);
    }

    // Nome completo, primeiro+último, primeiro+penúltimo
    if (c.name && !c.name.startsWith('55') && c.name !== 'Sem nome' && c.name.length > 2) {
      const full = c.name.toLowerCase().trim();
      if (!nameMap.has(full)) nameMap.set(full, c.id);

      const partes = c.name.trim().split(/\s+/);
      if (partes.length >= 2) {
        const a1 = (partes[0] + ' ' + partes[partes.length - 1]).toLowerCase();
        if (!nameMap.has(a1)) nameMap.set(a1, c.id);
      }
      if (partes.length >= 3) {
        const a2 = (partes[0] + ' ' + partes[partes.length - 2]).toLowerCase();
        if (!nameMap.has(a2)) nameMap.set(a2, c.id);
      }
    }
  }

  console.log(`\n   📱 phoneMap   : ${phoneMap.size} entradas`);
  console.log(`   🔑 fzIdMap    : ${fzIdMap.size} entradas`);
  console.log(`   📧 emailMap   : ${emailMap.size} entradas`);
  console.log(`   🪪 cpfMap     : ${cpfMap.size} entradas`);
  console.log(`   🏢 cnpjMap    : ${cnpjMap.size} entradas`);
  console.log(`   📮 cepNomeMap : ${cepNomeMap.size} entradas`);
  console.log(`   👤 nameMap    : ${nameMap.size} entradas`);

  // ── 3. Carregar pedidos órfãos ────────────────────────────────────────────
  console.log('\n📦 Carregando pedidos órfãos...');
  const orphans = await fetchAll(
    'orders',
    'id, metadata, external_id',
    { tenant_id: TENANT_ID, client_id: null }
  );
  console.log(`   📋 ${orphans.length} pedidos sem cliente vinculado\n`);

  if (orphans.length === 0) {
    console.log('✅ Nenhum pedido órfão! Tudo já está vinculado.\n');
  } else {
    const counters = {
      whatsapp_e164: 0,
      phone:         0,
      facilzap_id:   0,
      cpf:           0,
      cnpj:          0,
      email:         0,
      cep_nome:      0,
      name:          0,
      name_partial:  0,
      not_found:     0,
    };

    const updates = [];

    for (let i = 0; i < orphans.length; i++) {
      const order = orphans[i];
      const meta  = order.metadata || {};
      process.stdout.write(`\r   Cruzando ${i + 1}/${orphans.length}...`);

      let clientId = null;
      let method   = '';

      // ── Round 1: WhatsApp E.164 ──────────────────────────────────────────
      if (!clientId && meta.cliente_whatsapp_e164) {
        for (const v of phoneVariants(meta.cliente_whatsapp_e164)) {
          if (phoneMap.has(v)) { clientId = phoneMap.get(v); method = 'whatsapp_e164'; break; }
        }
      }

      // ── Round 2: Telefone (todas as chaves + variações) ──────────────────
      if (!clientId) {
        const sources = [
          meta.cliente_whatsapp,
          meta.cliente_telefone,
          meta.whatsapp,
          meta.telefone,
          meta.phone,
        ].filter(Boolean);
        outer2:
        for (const src of sources) {
          for (const v of phoneVariants(src)) {
            if (phoneMap.has(v)) { clientId = phoneMap.get(v); method = 'phone'; break outer2; }
          }
        }
      }

      // ── Round 3: FacilZap ID ─────────────────────────────────────────────
      if (!clientId) {
        const fzId = meta.cliente_id_facilzap || meta.cliente_id || meta.facilzap_id;
        if (fzId) {
          const found = fzIdMap.get(String(fzId));
          if (found) { clientId = found; method = 'facilzap_id'; }
        }
      }

      // ── Round 4: CPF ─────────────────────────────────────────────────────
      if (!clientId && meta.cliente_cpf_cnpj) {
        const doc = cleanDoc(meta.cliente_cpf_cnpj);
        if (doc.length === 11 && cpfMap.has(doc)) { clientId = cpfMap.get(doc); method = 'cpf'; }
      }

      // ── Round 5: CNPJ ────────────────────────────────────────────────────
      if (!clientId && meta.cliente_cpf_cnpj) {
        const doc = cleanDoc(meta.cliente_cpf_cnpj);
        if (doc.length === 14 && cnpjMap.has(doc)) { clientId = cnpjMap.get(doc); method = 'cnpj'; }
      }

      // ── Round 6: Email ───────────────────────────────────────────────────
      if (!clientId) {
        for (const rawEmail of [meta.cliente_email, meta.email].filter(Boolean)) {
          const em = rawEmail.toLowerCase().trim();
          if (em.includes('@') && emailMap.has(em)) { clientId = emailMap.get(em); method = 'email'; break; }
        }
      }

      // ── Round 7: CEP + primeiro nome ─────────────────────────────────────
      if (!clientId && meta.cliente_nome && (meta.cep || meta.endereco_cep)) {
        const cep = cleanCep(meta.cep || meta.endereco_cep || '');
        if (cep.length >= 7) {
          const primeiro = meta.cliente_nome.trim().split(/\s+/)[0].toLowerCase();
          const key = `${cep}|${primeiro}`;
          if (cepNomeMap.has(key)) { clientId = cepNomeMap.get(key); method = 'cep_nome'; }
        }
      }

      // ── Round 8: Nome completo (exato) ───────────────────────────────────
      if (!clientId && meta.cliente_nome) {
        const nomeLower = meta.cliente_nome.toLowerCase().trim();
        const blocked   = ['loja', 'sem nome', ''];
        if (!blocked.includes(nomeLower) && !nomeLower.startsWith('55')) {
          const found = nameMap.get(nomeLower);
          if (found) { clientId = found; method = 'name'; }
        }
      }

      // ── Round 9: Nome parcial — primeiro + último ────────────────────────
      if (!clientId && meta.cliente_nome) {
        const partes = meta.cliente_nome.trim().split(/\s+/);
        if (partes.length >= 2) {
          const abrev = (partes[0] + ' ' + partes[partes.length - 1]).toLowerCase();
          const found  = nameMap.get(abrev);
          if (found) { clientId = found; method = 'name_partial'; }
        }
      }

      // ── Round 10: Nome parcial — primeiro + penúltimo ────────────────────
      if (!clientId && meta.cliente_nome) {
        const partes = meta.cliente_nome.trim().split(/\s+/);
        if (partes.length >= 3) {
          const abrev = (partes[0] + ' ' + partes[partes.length - 2]).toLowerCase();
          const found  = nameMap.get(abrev);
          if (found) { clientId = found; method = 'name_partial'; }
        }
      }

      if (clientId) {
        counters[method] = (counters[method] || 0) + 1;
        updates.push({ id: order.id, client_id: clientId });
      } else {
        counters.not_found++;
      }
    }

    // ── Aplicar updates em batches ──────────────────────────────────────────
    if (updates.length > 0) {
      console.log(`\n\n📝 Aplicando ${updates.length} vinculações...`);
      for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        process.stdout.write(`\r   Gravando ${Math.min(i + 50, updates.length)}/${updates.length}...`);
        await Promise.all(batch.map(u =>
          sb.from('orders')
            .update({ client_id: u.client_id })
            .eq('id', u.id)
            .eq('tenant_id', TENANT_ID)
        ));
      }
      console.log(`\n   ✅ ${updates.length} pedidos atualizados`);
    } else {
      console.log(`\n\n⚠️  Nenhuma vinculação nova encontrada.`);
    }

    const total = updates.length;
    console.log(`\n${'═'.repeat(46)}`);
    console.log(`📊 VINCULAÇÕES DESTA RODADA:`);
    console.log(`   📲 Por WhatsApp E.164    : ${counters.whatsapp_e164}`);
    console.log(`   📱 Por telefone          : ${counters.phone}`);
    console.log(`   🔑 Por FacilZap ID       : ${counters.facilzap_id}`);
    console.log(`   🪪 Por CPF               : ${counters.cpf}`);
    console.log(`   🏢 Por CNPJ              : ${counters.cnpj}`);
    console.log(`   📧 Por email             : ${counters.email}`);
    console.log(`   📮 Por CEP + nome        : ${counters.cep_nome}`);
    console.log(`   👤 Por nome completo     : ${counters.name}`);
    console.log(`   ✂️  Por nome parcial      : ${counters.name_partial}`);
    console.log(`   ${'─'.repeat(36)}`);
    console.log(`   ✅ TOTAL vinculados      : ${total}`);
    console.log(`   ❓ Irrecuperáveis        : ${counters.not_found}`);
    console.log(`${'═'.repeat(46)}\n`);
  }

  // ── 4. Recalcular stats ───────────────────────────────────────────────────
  console.log('📈 Recalculando stats (LTV, pedidos, ticket médio)...');
  const allOrders = await fetchAll('orders', 'client_id, total, created_at', { tenant_id: TENANT_ID });

  const statsMap = new Map();
  for (const c of clients) statsMap.set(c.id, { total: 0, count: 0, last: null });
  for (const o of allOrders) {
    if (!o.client_id) continue;
    const s = statsMap.get(o.client_id) || { total: 0, count: 0, last: null };
    s.total += Number(o.total) || 0;
    s.count += 1;
    if (!s.last || o.created_at > s.last) s.last = o.created_at;
    statsMap.set(o.client_id, s);
  }

  const entries = Array.from(statsMap.entries());
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    process.stdout.write(`\r   Atualizando ${Math.min(i + 50, entries.length)}/${entries.length} clientes...`);
    await Promise.all(batch.map(([cid, s]) =>
      sb.from('clients').update({
        ltv:           Math.round(s.total * 100) / 100,
        total_orders:  s.count,
        avg_ticket:    s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
        last_order_at: s.last || null,
      })
      .eq('id', cid)
      .eq('tenant_id', TENANT_ID)
    ));
  }
  console.log(`\n   ✅ ${entries.length} clientes com stats atualizadas\n`);

  // ── 5. Resultado final ────────────────────────────────────────────────────
  const { count: fO } = await sb.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .is('client_id', null);
  const { count: fL } = await sb.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .not('client_id', 'is', null);

  const grandTotal = (fL || 0) + (fO || 0);
  const pct = grandTotal > 0 ? Math.round((fL || 0) / grandTotal * 100) : 0;

  console.log('═'.repeat(46));
  console.log('🎉 RESULTADO FINAL (acumulado):');
  console.log(`   ✅ Vinculados  : ${fL} pedidos`);
  console.log(`   ❓ Órfãos      : ${fO} pedidos (PDV sem dados)`);
  console.log(`   📊 Cobertura   : ${pct}%`);
  console.log('═'.repeat(46));
  console.log('\n✅ Cérebro do Cliente atualizado!');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
