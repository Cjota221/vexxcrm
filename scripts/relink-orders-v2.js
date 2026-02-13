// Script para re-vincular pedidos órfãos usando múltiplas estratégias
// Executar: node scripts/relink-orders-v2.js

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

class PhoneNormalizer {
  static clean(raw) { return (raw || '').replace(/\D/g, ''); }
  static ensureDDI(digits) {
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    return '55' + digits;
  }
  static normalize(raw) {
    if (!raw) return '';
    const digits = this.clean(raw);
    if (!digits) return '';
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);
    if (/^(\d{2})(9)(\d{8})$/.test(withoutDDI)) return '55' + withoutDDI;
    const m = withoutDDI.match(/^(\d{2})(\d{8})$/);
    if (m && ['6','7','8','9'].includes(m[2][0])) return '55' + m[1] + '9' + m[2];
    return withDDI;
  }
  static canonical(raw) {
    if (!raw) return '';
    const digits = this.clean(raw);
    if (!digits) return '';
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);
    const m = withoutDDI.match(/^(\d{2})(9)(\d{8})$/);
    if (m) return '55' + m[1] + m[3];
    if (/^(\d{2})(\d{8})$/.test(withoutDDI)) return '55' + withoutDDI;
    return withDDI;
  }
}

async function main() {
  console.log('=== RELINK ORDERS V2 ===\n');

  // Carregar clientes
  const { data: clients } = await sb.from('clients').select('id, phone, phone_normalized, name, custom_fields, tenant_id');
  console.log(`Clientes carregados: ${clients.length}`);

  // Criar mapas por tenant
  const tenantMaps = {};
  for (const c of clients) {
    const tid = c.tenant_id;
    if (!tenantMaps[tid]) tenantMaps[tid] = { phone: new Map(), facilzapId: new Map(), name: new Map() };
    const maps = tenantMaps[tid];

    // Mapa por telefone (todas as variações)
    for (const raw of [c.phone_normalized, c.phone]) {
      if (!raw) continue;
      const cleaned = PhoneNormalizer.clean(raw);
      if (cleaned) {
        maps.phone.set(cleaned, c.id);
        maps.phone.set(PhoneNormalizer.canonical(cleaned), c.id);
        maps.phone.set(PhoneNormalizer.normalize(cleaned), c.id);
      }
    }

    // Mapa por facilzap_id
    const fzId = c.custom_fields?.facilzap_id;
    if (fzId) maps.facilzapId.set(String(fzId), c.id);

    // Mapa por nome (normalizado, lowercase, sem espaços extras)
    if (c.name) maps.name.set(c.name.toLowerCase().trim(), c.id);
  }

  // Carregar pedidos órfãos
  const { data: orphans } = await sb.from('orders').select('id, metadata, tenant_id').is('client_id', null);
  console.log(`Pedidos órfãos: ${orphans.length}\n`);

  let byPhone = 0, byFzId = 0, byName = 0, notFound = 0;

  for (const order of orphans) {
    const meta = order.metadata || {};
    const maps = tenantMaps[order.tenant_id];
    if (!maps) { notFound++; continue; }

    let clientId = null;
    let method = '';

    // Estratégia 1: Telefone
    const rawPhone = (meta.cliente_whatsapp || meta.cliente_telefone || '');
    const ph = PhoneNormalizer.clean(rawPhone);
    if (ph) {
      clientId = maps.phone.get(ph)
        || maps.phone.get(PhoneNormalizer.canonical(ph))
        || maps.phone.get(PhoneNormalizer.normalize(ph))
        || null;
      if (clientId) method = 'phone';
    }

    // Estratégia 2: facilzap_id do cliente no pedido
    if (!clientId && meta.cliente_id_facilzap) {
      clientId = maps.facilzapId.get(String(meta.cliente_id_facilzap)) || null;
      if (clientId) method = 'facilzap_id';
    }

    // Estratégia 3: Nome do cliente (match exato)
    if (!clientId && meta.cliente_nome) {
      clientId = maps.name.get(meta.cliente_nome.toLowerCase().trim()) || null;
      if (clientId) method = 'name';
    }

    if (clientId) {
      const { error } = await sb.from('orders').update({ client_id: clientId }).eq('id', order.id);
      if (!error) {
        if (method === 'phone') byPhone++;
        else if (method === 'facilzap_id') byFzId++;
        else if (method === 'name') byName++;
      }
    } else {
      notFound++;
    }
  }

  console.log('=== VINCULAÇÕES ===');
  console.log(`Por telefone: ${byPhone}`);
  console.log(`Por FacilZap ID: ${byFzId}`);
  console.log(`Por nome: ${byName}`);
  console.log(`Total vinculados: ${byPhone + byFzId + byName}`);
  console.log(`Não encontrados: ${notFound}`);

  // Recalcular stats
  console.log('\nRecalculando stats...');
  const { data: allOrders } = await sb.from('orders').select('client_id, total, created_at, tenant_id').not('client_id', 'is', null);
  const statsMap = new Map();
  for (const o of (allOrders || [])) {
    if (!o.client_id) continue;
    const prev = statsMap.get(o.client_id) || { total: 0, count: 0, last: '', tid: o.tenant_id };
    prev.total += Number(o.total) || 0;
    prev.count += 1;
    if (o.created_at > prev.last) prev.last = o.created_at;
    statsMap.set(o.client_id, prev);
  }

  let updated = 0;
  for (const [cid, s] of statsMap) {
    await sb.from('clients').update({
      ltv: Math.round(s.total * 100) / 100,
      total_orders: s.count,
      avg_ticket: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
      last_order_at: s.last || null,
    }).eq('id', cid);
    updated++;
  }
  console.log(`Stats atualizadas: ${updated} clientes`);

  // Resultado final
  const { count: finalOrphans } = await sb.from('orders').select('id', { count: 'exact', head: true }).is('client_id', null);
  const { count: finalLinked } = await sb.from('orders').select('id', { count: 'exact', head: true }).not('client_id', 'is', null);
  console.log('\n=== RESULTADO FINAL ===');
  console.log(`Vinculados: ${finalLinked} / ${finalLinked + finalOrphans}`);
  console.log(`Órfãos restantes: ${finalOrphans}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
