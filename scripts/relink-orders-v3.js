// Script FINAL para re-vincular pedidos órfãos
// Executar: node scripts/relink-orders-v3.js

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

class PhoneNormalizer {
  static clean(raw) { return (raw || '').replace(/\D/g, ''); }
  static ensureDDI(d) { return d.startsWith('55') && d.length >= 12 ? d : '55' + d; }
  static normalize(raw) {
    if (!raw) return '';
    const d = this.clean(raw); if (!d) return '';
    const w = this.ensureDDI(d); const wo = w.slice(2);
    if (/^(\d{2})(9)(\d{8})$/.test(wo)) return '55' + wo;
    const m = wo.match(/^(\d{2})(\d{8})$/);
    if (m && '6789'.includes(m[2][0])) return '55' + m[1] + '9' + m[2];
    return w;
  }
  static canonical(raw) {
    if (!raw) return '';
    const d = this.clean(raw); if (!d) return '';
    const w = this.ensureDDI(d); const wo = w.slice(2);
    const m = wo.match(/^(\d{2})(9)(\d{8})$/);
    if (m) return '55' + m[1] + m[3];
    if (/^(\d{2})(\d{8})$/.test(wo)) return '55' + wo;
    return w;
  }
}

// Buscar TODOS os registros (sem limite de 1000)
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

async function main() {
  console.log('=== RELINK ORDERS V3 (FINAL) ===\n');

  // Carregar TODOS os clientes
  const clients = await fetchAll('clients', 'id, phone, phone_normalized, name, email, custom_fields, tenant_id');
  console.log(`Clientes carregados: ${clients.length}`);

  // Criar mapas por tenant
  const tenantMaps = {};
  for (const c of clients) {
    const tid = c.tenant_id;
    if (!tenantMaps[tid]) tenantMaps[tid] = { phone: new Map(), facilzapId: new Map(), name: new Map(), email: new Map(), cpf: new Map() };
    const maps = tenantMaps[tid];

    // Telefone (todas variações)
    for (const raw of [c.phone_normalized, c.phone]) {
      if (!raw) continue;
      const cl = PhoneNormalizer.clean(raw);
      if (cl) {
        maps.phone.set(cl, c.id);
        maps.phone.set(PhoneNormalizer.canonical(cl), c.id);
        maps.phone.set(PhoneNormalizer.normalize(cl), c.id);
      }
    }

    // FacilZap ID
    const fzId = c.custom_fields?.facilzap_id;
    if (fzId) maps.facilzapId.set(String(fzId), c.id);

    // Email
    if (c.email) maps.email.set(c.email.toLowerCase().trim(), c.id);

    // CPF/CNPJ
    const cpf = c.custom_fields?.cpf_cnpj;
    if (cpf) maps.cpf.set(String(cpf).replace(/\D/g, ''), c.id);

    // Nome
    if (c.name && c.name !== 'Sem nome') maps.name.set(c.name.toLowerCase().trim(), c.id);
  }

  // Carregar TODOS os pedidos órfãos
  const orphans = await fetchAll('orders', 'id, metadata, tenant_id', { client_id: null });
  console.log(`Pedidos órfãos: ${orphans.length}\n`);

  let byPhone = 0, byFzId = 0, byEmail = 0, byCpf = 0, byName = 0, notFound = 0;

  for (const order of orphans) {
    const meta = order.metadata || {};
    const maps = tenantMaps[order.tenant_id];
    if (!maps) { notFound++; continue; }

    let clientId = null;
    let method = '';

    // 1. Telefone
    const rawPhone = (meta.cliente_whatsapp || meta.cliente_telefone || '');
    const ph = PhoneNormalizer.clean(rawPhone);
    if (ph && ph.length >= 8) {
      clientId = maps.phone.get(ph)
        || maps.phone.get(PhoneNormalizer.canonical(ph))
        || maps.phone.get(PhoneNormalizer.normalize(ph))
        || null;
      if (clientId) method = 'phone';
    }

    // 2. FacilZap ID
    if (!clientId && meta.cliente_id_facilzap) {
      clientId = maps.facilzapId.get(String(meta.cliente_id_facilzap)) || null;
      if (clientId) method = 'facilzap_id';
    }

    // 3. Email
    if (!clientId && meta.cliente_email) {
      clientId = maps.email.get(meta.cliente_email.toLowerCase().trim()) || null;
      if (clientId) method = 'email';
    }

    // 4. CPF/CNPJ
    if (!clientId && meta.cliente_cpf_cnpj) {
      const cpf = String(meta.cliente_cpf_cnpj).replace(/\D/g, '');
      if (cpf.length >= 11) {
        clientId = maps.cpf.get(cpf) || null;
        if (clientId) method = 'cpf';
      }
    }

    // 5. Nome (match exato, último recurso)
    if (!clientId && meta.cliente_nome && meta.cliente_nome !== 'Sem nome') {
      clientId = maps.name.get(meta.cliente_nome.toLowerCase().trim()) || null;
      if (clientId) method = 'name';
    }

    if (clientId) {
      const { error } = await sb.from('orders').update({ client_id: clientId }).eq('id', order.id);
      if (!error) {
        if (method === 'phone') byPhone++;
        else if (method === 'facilzap_id') byFzId++;
        else if (method === 'email') byEmail++;
        else if (method === 'cpf') byCpf++;
        else if (method === 'name') byName++;
      }
    } else {
      notFound++;
    }
  }

  console.log('=== VINCULAÇÕES ===');
  console.log(`Por telefone: ${byPhone}`);
  console.log(`Por FacilZap ID: ${byFzId}`);
  console.log(`Por email: ${byEmail}`);
  console.log(`Por CPF/CNPJ: ${byCpf}`);
  console.log(`Por nome: ${byName}`);
  console.log(`TOTAL vinculados: ${byPhone + byFzId + byEmail + byCpf + byName}`);
  console.log(`Não encontrados: ${notFound}`);

  // Recalcular stats de TODOS
  console.log('\nRecalculando stats de todos os clientes...');
  const allOrders = await fetchAll('orders', 'client_id, total, created_at');
  const statsMap = new Map();
  
  // Inicializar todos os clientes com 0
  for (const c of clients) {
    statsMap.set(c.id, { total: 0, count: 0, last: '' });
  }
  
  for (const o of allOrders) {
    if (!o.client_id) continue;
    const prev = statsMap.get(o.client_id) || { total: 0, count: 0, last: '' };
    prev.total += Number(o.total) || 0;
    prev.count += 1;
    if (o.created_at > prev.last) prev.last = o.created_at;
    statsMap.set(o.client_id, prev);
  }

  let updated = 0;
  const entries = Array.from(statsMap.entries());
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const promises = batch.map(([cid, s]) =>
      sb.from('clients').update({
        ltv: Math.round(s.total * 100) / 100,
        total_orders: s.count,
        avg_ticket: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
        last_order_at: s.last || null,
      }).eq('id', cid)
    );
    await Promise.all(promises);
    updated += batch.length;
  }
  console.log(`Stats atualizadas: ${updated} clientes`);

  // Resultado final
  const { count: fO } = await sb.from('orders').select('id', { count: 'exact', head: true }).is('client_id', null);
  const { count: fL } = await sb.from('orders').select('id', { count: 'exact', head: true }).not('client_id', 'is', null);
  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`Vinculados: ${fL} / ${fL + fO} (${Math.round(fL/(fL+fO)*100)}%)`);
  console.log(`Órfãos restantes: ${fO}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
