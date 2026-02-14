const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);
const TID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

(async () => {
  // 1. Total pedidos
  const { count } = await sb.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log('Total pedidos:', count);

  // 2. Faturamento - paginar
  let all = [];
  for (let p = 0; ; p++) {
    const { data } = await sb.from('orders').select('total, payment_status, status, metadata').eq('tenant_id', TID).range(p*1000, (p+1)*1000-1);
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
  }
  console.log('Carregados:', all.length);

  const fatTotal = all.reduce((s, o) => s + (Number(o.total) || 0), 0);
  console.log('Faturamento TOTAL:', fatTotal.toFixed(2));

  const paid = all.filter(o => o.payment_status === 'paid');
  console.log('Faturamento PAGOS:', paid.reduce((s, o) => s + (Number(o.total) || 0), 0).toFixed(2), '(' + paid.length + ')');

  // 3. Payment status dist
  const psDist = {};
  all.forEach(o => { const k = o.payment_status || 'null'; psDist[k] = (psDist[k]||0)+1; });
  console.log('payment_status:', JSON.stringify(psDist));

  // 4. Order status dist
  const sDist = {};
  all.forEach(o => { const k = o.status || 'null'; sDist[k] = (sDist[k]||0)+1; });
  console.log('status:', JSON.stringify(sDist));

  // 5. Peças - contar de metadata.itens
  let pecas = 0;
  let comItens = 0;
  all.forEach(o => {
    const m = o.metadata;
    if (m && Array.isArray(m.itens)) {
      comItens++;
      m.itens.forEach(i => { pecas += Number(i.quantidade || i.quantity || 1); });
    }
  });
  console.log('Pecas vendidas:', pecas, '(de', comItens, 'pedidos com itens)');

  // 6. order_items table
  const oi = await sb.from('order_items').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log('order_items:', oi.count, oi.error ? 'ERRO: ' + oi.error.message : 'OK');
})();
