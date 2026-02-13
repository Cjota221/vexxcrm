// Script para re-vincular pedidos órfãos e normalizar phones
// Executar: node scripts/relink-orders.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// PhoneNormalizer simplificado
class PhoneNormalizer {
  static clean(raw) { return (raw || '').replace(/\D/g, ''); }
  
  static ensureDDI(digits) {
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    return '55' + digits;
  }

  static normalize(raw) {
    if (!raw) return '';
    const digits = this.clean(raw);
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);
    // 11 dígitos = DDD + 9 + 8
    if (/^(\d{2})(9)(\d{8})$/.test(withoutDDI)) return '55' + withoutDDI;
    // 10 dígitos = DDD + 8 → add 9
    const m = withoutDDI.match(/^(\d{2})(\d{8})$/);
    if (m && ['6','7','8','9'].includes(m[2][0])) return '55' + m[1] + '9' + m[2];
    return withDDI;
  }

  static canonical(raw) {
    if (!raw) return '';
    const digits = this.clean(raw);
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);
    // 11 dígitos: remover 9° dígito
    const m = withoutDDI.match(/^(\d{2})(9)(\d{8})$/);
    if (m) return '55' + m[1] + m[3];
    // 10 dígitos: já está sem 9
    if (/^(\d{2})(\d{8})$/.test(withoutDDI)) return '55' + withoutDDI;
    return withDDI;
  }
}

async function main() {
  console.log('=== RELINK ORDERS ===\n');

  // 1. Contar estado atual
  const { count: totalOrders } = await sb.from('orders').select('id', { count: 'exact', head: true });
  const { count: orphanCount } = await sb.from('orders').select('id', { count: 'exact', head: true }).is('client_id', null);
  const { count: linkedCount } = await sb.from('orders').select('id', { count: 'exact', head: true }).not('client_id', 'is', null);
  const { count: clientCount } = await sb.from('clients').select('id', { count: 'exact', head: true });

  console.log(`Total pedidos: ${totalOrders}`);
  console.log(`Vinculados: ${linkedCount}`);
  console.log(`Órfãos: ${orphanCount}`);
  console.log(`Total clientes: ${clientCount}`);
  console.log('');

  // 2. Normalizar phones dos clientes
  console.log('Fase 1: Normalizando telefones dos clientes...');
  const { data: clients } = await sb.from('clients').select('id, phone, phone_normalized, tenant_id');
  let normalized = 0;
  for (const c of (clients || [])) {
    const raw = c.phone || c.phone_normalized || '';
    if (!raw) continue;
    const canonical = PhoneNormalizer.canonical(raw);
    const display = PhoneNormalizer.normalize(raw);
    if (canonical !== c.phone_normalized || display !== c.phone) {
      const { error } = await sb.from('clients').update({ phone: display, phone_normalized: canonical }).eq('id', c.id);
      if (!error) normalized++;
    }
  }
  console.log(`  ${normalized} telefones normalizados\n`);

  // 3. Recarregar clientes e criar mapa
  console.log('Fase 2: Re-vinculando pedidos órfãos...');
  const { data: freshClients } = await sb.from('clients').select('id, phone, phone_normalized, tenant_id');
  const phoneMap = new Map();
  for (const c of (freshClients || [])) {
    const key = c.tenant_id;
    if (!phoneMap.has(key)) phoneMap.set(key, new Map());
    const tm = phoneMap.get(key);
    if (c.phone_normalized) {
      tm.set(c.phone_normalized, c.id);
      tm.set(PhoneNormalizer.normalize(c.phone_normalized), c.id);
    }
    if (c.phone) {
      const cleaned = PhoneNormalizer.clean(c.phone);
      tm.set(cleaned, c.id);
      tm.set(PhoneNormalizer.canonical(cleaned), c.id);
      tm.set(PhoneNormalizer.normalize(cleaned), c.id);
    }
  }

  // 4. Buscar pedidos órfãos
  const { data: orphans } = await sb.from('orders').select('id, metadata, tenant_id').is('client_id', null);
  let relinked = 0;
  for (const order of (orphans || [])) {
    const meta = order.metadata;
    if (!meta) continue;
    const rawPhone = (meta.cliente_whatsapp || meta.cliente_telefone || '').replace(/\D/g, '');
    if (!rawPhone) continue;
    const tm = phoneMap.get(order.tenant_id);
    if (!tm) continue;
    const clientId = tm.get(rawPhone) 
      || tm.get(PhoneNormalizer.canonical(rawPhone))
      || tm.get(PhoneNormalizer.normalize(rawPhone))
      || null;
    if (clientId) {
      const { error } = await sb.from('orders').update({ client_id: clientId }).eq('id', order.id);
      if (!error) relinked++;
    }
  }
  console.log(`  ${relinked} pedidos re-vinculados\n`);

  // 5. Recalcular stats
  console.log('Fase 3: Recalculando stats dos clientes...');
  const { data: allOrders } = await sb.from('orders').select('client_id, total, created_at, tenant_id').not('client_id', 'is', null);
  const statsMap = new Map();
  for (const o of (allOrders || [])) {
    if (!o.client_id) continue;
    const prev = statsMap.get(o.client_id) || { total: 0, count: 0, last: '', tenant_id: o.tenant_id };
    prev.total += Number(o.total) || 0;
    prev.count += 1;
    if (o.created_at > prev.last) prev.last = o.created_at;
    statsMap.set(o.client_id, prev);
  }

  let updated = 0;
  const entries = Array.from(statsMap.entries());
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    for (const [cid, s] of batch) {
      await sb.from('clients').update({
        ltv: Math.round(s.total * 100) / 100,
        total_orders: s.count,
        avg_ticket: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
        last_order_at: s.last || null,
      }).eq('id', cid);
      updated++;
    }
  }
  console.log(`  ${updated} clientes atualizados\n`);

  // 6. Contar resultado final
  const { count: finalOrphans } = await sb.from('orders').select('id', { count: 'exact', head: true }).is('client_id', null);
  const { count: finalLinked } = await sb.from('orders').select('id', { count: 'exact', head: true }).not('client_id', 'is', null);
  console.log('=== RESULTADO FINAL ===');
  console.log(`Pedidos vinculados: ${finalLinked} (antes: ${linkedCount})`);
  console.log(`Pedidos órfãos: ${finalOrphans} (antes: ${orphanCount})`);
  console.log(`Re-vinculados: ${relinked}`);
  console.log('DONE!');
}

main().catch(e => console.error('ERRO:', e)).finally(() => process.exit(0));
