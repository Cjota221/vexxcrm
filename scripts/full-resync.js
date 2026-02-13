// Script de re-sync completa + relink final
// Puxa TODAS as páginas de pedidos da FacilZap (5 anos) e re-vincula
// Executar: node scripts/full-resync.js

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const FZ_API = 'https://api.facilzap.app.br';

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

async function fetchFacilZap(token, endpoint, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${FZ_API}${endpoint}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` }
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      console.log(`  Retry ${i}/${retries}...`);
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

async function fetchAll(table, select, filter) {
  const all = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data } = await q;
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  console.log('=== FULL RE-SYNC + RELINK ===\n');

  // 1. Buscar token FacilZap
  const { data: tenants } = await sb.from('tenants').select('id, facilzap_token');
  const tenant = tenants.find(t => t.facilzap_token);
  if (!tenant) { console.log('Sem token FacilZap!'); return; }
  const tenantId = tenant.id;
  const fzToken = tenant.facilzap_token;
  console.log('Tenant:', tenantId);

  // 2. Buscar TODOS os pedidos da FacilZap (todas as páginas, 5 anos)
  const di = new Date(); di.setFullYear(di.getFullYear() - 5);
  const df = new Date();
  const params = `data_inicial=${di.toISOString().split('T')[0]}&data_final=${df.toISOString().split('T')[0]}`;
  
  let allFzOrders = [];
  let page = 1;
  while (page <= 50) {
    console.log(`Buscando pedidos página ${page}...`);
    try {
      const json = await fetchFacilZap(fzToken, `/pedidos?page=${page}&per_page=100&${params}`);
      const orders = json.data || [];
      if (!orders.length) break;
      allFzOrders.push(...orders);
      console.log(`  ${orders.length} pedidos (total acumulado: ${allFzOrders.length})`);
      
      const totalPages = json.last_page || json.total_pages || Math.ceil((json.total || 0) / 100);
      if (page >= totalPages) break;
      page++;
    } catch (e) {
      console.log(`  Erro na página ${page}: ${e.message}`);
      break;
    }
  }
  console.log(`\nTotal pedidos da FacilZap: ${allFzOrders.length}`);

  // 3. Carregar TODOS os clientes do banco
  const clients = await fetchAll('clients', 'id, phone, phone_normalized, name, email, custom_fields', q => q.eq('tenant_id', tenantId));
  console.log(`Clientes no banco: ${clients.length}`);

  // Criar mapas de lookup
  const phoneMap = new Map();
  const fzIdMap = new Map();
  const emailMap = new Map();
  const nameMap = new Map();
  for (const c of clients) {
    for (const raw of [c.phone_normalized, c.phone]) {
      if (!raw) continue;
      const cl = PhoneNormalizer.clean(raw);
      if (cl) {
        phoneMap.set(cl, c.id);
        phoneMap.set(PhoneNormalizer.canonical(cl), c.id);
        phoneMap.set(PhoneNormalizer.normalize(cl), c.id);
      }
    }
    const fzId = c.custom_fields?.facilzap_id;
    if (fzId) fzIdMap.set(String(fzId), c.id);
    if (c.email) emailMap.set(c.email.toLowerCase().trim(), c.id);
    if (c.name && c.name !== 'Sem nome') nameMap.set(c.name.toLowerCase().trim(), c.id);
  }

  // 4. Processar pedidos — atualizar metadados e vincular
  const parseNum = v => { const n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const isTruthy = v => v === '1' || v === 1 || v === true || v === 'true' || v === 'sim';

  let updated = 0, newOrders = 0, relinked = 0;
  
  for (let i = 0; i < allFzOrders.length; i += 50) {
    const batch = allFzOrders.slice(i, i + 50);
    const upsertData = batch.map(o => {
      // Extrair telefone com +55
      const rawPhone = (o.cliente?.whatsapp_e164 || o.cliente?.whatsapp || o.cliente?.telefone || '');
      const ph = rawPhone.replace(/\D/g, '');
      
      // Vincular por múltiplas estratégias
      let clientId = null;
      if (ph && ph.length >= 8) {
        clientId = phoneMap.get(ph) || phoneMap.get(PhoneNormalizer.canonical(ph)) || phoneMap.get(PhoneNormalizer.normalize(ph)) || null;
      }
      if (!clientId && o.cliente?.id) clientId = fzIdMap.get(String(o.cliente.id)) || null;
      if (!clientId && o.cliente?.email) clientId = emailMap.get(o.cliente.email.toLowerCase().trim()) || null;
      if (!clientId && o.cliente?.nome && o.cliente.nome !== 'Sem nome') clientId = nameMap.get(o.cliente.nome.toLowerCase().trim()) || null;
      
      // Status
      let orderStatus = 'pending';
      if (isTruthy(o.status_entregue)) orderStatus = 'delivered';
      else if (isTruthy(o.status_despachado)) orderStatus = 'shipped';
      else if (isTruthy(o.status_separado) || isTruthy(o.status_em_separacao)) orderStatus = 'processing';
      else if (isTruthy(o.status_pago)) orderStatus = 'confirmed';
      else if (o.status === 'cancelado' || o.status_pedido === 'cancelado') orderStatus = 'cancelled';

      const paymentStatus = isTruthy(o.status_pago) ? 'paid' : 'pending';
      
      let paymentMethod = null;
      if (typeof o.metodo_pagamento === 'string') paymentMethod = o.metodo_pagamento;
      else if (o.metodo_pagamento?.nome) paymentMethod = o.metodo_pagamento.nome;
      else if (typeof o.forma_pagamento === 'string') paymentMethod = o.forma_pagamento;

      const items = o.itens || o.produtos || [];
      const totalItems = items.reduce((s, it) => s + (parseNum(it.quantidade) || 1), 0);

      let orderDate;
      try { const d = o.data ? new Date(o.data) : null; orderDate = (d && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString(); }
      catch { orderDate = new Date().toISOString(); }

      const orderNumber = (() => {
        const c = o.codigo || o.numero || o.number || o.numero_pedido;
        return c ? String(c).trim() || String(o.id) : String(o.id);
      })();

      return {
        tenant_id: tenantId,
        client_id: clientId,
        external_id: String(o.id),
        order_number: orderNumber,
        status: orderStatus,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        subtotal: parseNum(o.subtotal),
        discount: parseNum(o.desconto_total || o.desconto),
        shipping: parseNum(o.valor_frete),
        total: parseNum(o.total || o.valor_total) || (parseNum(o.subtotal) - parseNum(o.desconto_total || o.desconto) + parseNum(o.valor_frete)),
        notes: o.observacoes || null,
        coupon_code: o.cupom_info?.codigo || null,
        created_at: orderDate,
        metadata: {
          cliente_nome: o.cliente?.nome || null,
          cliente_telefone: rawPhone || null,
          cliente_whatsapp: o.cliente?.whatsapp || null,
          cliente_whatsapp_e164: o.cliente?.whatsapp_e164 || null,
          cliente_whatsapp_ddi: o.cliente?.whatsapp_ddi || null,
          cliente_cpf_cnpj: o.cliente?.cpf_cnpj || null,
          cliente_email: o.cliente?.email || null,
          cliente_id_facilzap: o.cliente?.id || null,
          total_items: totalItems,
          itens: items.slice(0, 50).map(it => ({
            nome: it.nome || it.name || '',
            quantidade: parseNum(it.quantidade) || 1,
            valor: parseNum(it.preco_unitario || it.valor_unitario || it.preco || it.valor) || 0,
            sku: it.sku || it.codigo || null,
          })),
          pagamentos: o.pagamentos || [],
          forma_entrega: typeof o.forma_entrega === 'object' ? (o.forma_entrega?.nome || '') : (o.forma_entrega || null),
          status_pago: o.status_pago || null,
          status_entregue: o.status_entregue || null,
          status_despachado: o.status_despachado || null,
          data_original: o.data || null,
        },
        synced_at: new Date().toISOString(),
      };
    });

    // Deduplicar
    const seen = new Set();
    const unique = upsertData.filter(o => { if (seen.has(o.external_id)) return false; seen.add(o.external_id); return true; });
    
    const { error } = await sb.from('orders').upsert(unique, { onConflict: 'tenant_id,external_id' });
    if (error) {
      // Fallback: delete + insert
      const ids = unique.map(o => o.external_id);
      await sb.from('orders').delete().eq('tenant_id', tenantId).in('external_id', ids);
      await sb.from('orders').insert(unique);
    }
    updated += unique.length;
    process.stdout.write(`\r  Processados: ${updated}/${allFzOrders.length}`);
  }
  console.log(`\n\nPedidos processados: ${updated}`);

  // 5. Recalcular stats
  console.log('Recalculando stats...');
  const allOrders = await fetchAll('orders', 'client_id, total, created_at', q => q.eq('tenant_id', tenantId));
  const statsMap = new Map();
  for (const c of clients) statsMap.set(c.id, { total: 0, count: 0, last: '' });
  for (const o of allOrders) {
    if (!o.client_id) continue;
    const prev = statsMap.get(o.client_id) || { total: 0, count: 0, last: '' };
    prev.total += Number(o.total) || 0;
    prev.count += 1;
    if (o.created_at > prev.last) prev.last = o.created_at;
    statsMap.set(o.client_id, prev);
  }

  let statsUpdated = 0;
  const entries = Array.from(statsMap.entries());
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await Promise.all(batch.map(([cid, s]) =>
      sb.from('clients').update({
        ltv: Math.round(s.total * 100) / 100,
        total_orders: s.count,
        avg_ticket: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
        last_order_at: s.last || null,
      }).eq('id', cid)
    ));
    statsUpdated += batch.length;
  }

  // 6. Resultado final
  const { count: fO } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('client_id', null);
  const { count: fL } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('client_id', 'is', null);
  const { count: fT } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`Total pedidos: ${fT}`);
  console.log(`Vinculados: ${fL} (${Math.round(fL/fT*100)}%)`);
  console.log(`Órfãos: ${fO}`);
  console.log(`Stats atualizadas: ${statsUpdated} clientes`);
}

main().then(() => process.exit(0)).catch(e => { console.error('ERRO:', e); process.exit(1); });
