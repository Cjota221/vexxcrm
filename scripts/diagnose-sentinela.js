const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

const TID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

async function run() {
  console.log('=== DIAGNÓSTICO SENTINELA ===\n');

  // 1. Totais
  const [cRes, oRes, orphRes] = await Promise.all([
    sb.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TID),
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TID),
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TID).is('client_id', null),
  ]);
  console.log('Total clientes:', cRes.count);
  console.log('Total pedidos:', oRes.count);
  console.log('Pedidos orfãos (sem client_id):', orphRes.count);
  console.log('Pedidos vinculados:', oRes.count - orphRes.count);

  // 2. Clientes com pedidos
  const { data: orders } = await sb
    .from('orders')
    .select('client_id, created_at, total')
    .eq('tenant_id', TID)
    .not('client_id', 'is', null);

  const byClient = new Map();
  orders.forEach(o => {
    if (!byClient.has(o.client_id)) byClient.set(o.client_id, []);
    byClient.get(o.client_id).push(o);
  });

  console.log('\nClientes com pelo menos 1 pedido:', byClient.size);
  console.log('Clientes sem nenhum pedido:', cRes.count - byClient.size);

  // 3. Distribuição de pedidos por cliente
  const dist = { '1': 0, '2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
  byClient.forEach((ords) => {
    const n = ords.length;
    if (n === 1) dist['1']++;
    else if (n === 2) dist['2']++;
    else if (n <= 5) dist['3-5']++;
    else if (n <= 10) dist['6-10']++;
    else dist['11+']++;
  });
  console.log('\nDistribuição pedidos/cliente:', JSON.stringify(dist, null, 2));

  // 4. Recência
  const now = new Date();
  const recencia = { '0-7d': 0, '8-30d': 0, '31-60d': 0, '61-90d': 0, '91-180d': 0, '180d+': 0 };
  byClient.forEach((ords) => {
    const last = new Date(ords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at);
    const dias = Math.floor((now - last) / (86400000));
    if (dias <= 7) recencia['0-7d']++;
    else if (dias <= 30) recencia['8-30d']++;
    else if (dias <= 60) recencia['31-60d']++;
    else if (dias <= 90) recencia['61-90d']++;
    else if (dias <= 180) recencia['91-180d']++;
    else recencia['180d+']++;
  });
  console.log('\nRecência (dias desde última compra):', JSON.stringify(recencia, null, 2));

  // 5. Simular score para um cliente com pedidos
  const sampleClientId = byClient.keys().next().value;
  const sampleOrders = byClient.get(sampleClientId);
  const totalPedidos = sampleOrders.length;
  const ultimaCompra = new Date(sampleOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at);
  const diasInatividade = Math.floor((now - ultimaCompra) / 86400000);
  const primeiraCompra = new Date(sampleOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0].created_at);
  const mesesComoCliente = Math.max(1, Math.floor((now - primeiraCompra) / (86400000 * 30)));
  const mediaComprasMes = totalPedidos / mesesComoCliente;

  console.log('\n--- SAMPLE CLIENT:', sampleClientId, '---');
  console.log('Pedidos:', totalPedidos);
  console.log('Última compra:', ultimaCompra.toISOString());
  console.log('Dias inatividade:', diasInatividade);
  console.log('Meses como cliente:', mesesComoCliente);
  console.log('Media compras/mes:', mediaComprasMes.toFixed(2));

  // Simular score
  let score = 0;
  // Recencia (30pts)
  if (diasInatividade <= 7) score += 30;
  else if (diasInatividade <= 15) score += 25;
  else if (diasInatividade <= 30) score += 20;
  else if (diasInatividade <= 45) score += 14;
  else if (diasInatividade <= 60) score += 8;
  else if (diasInatividade <= 90) score += 4;
  console.log('Score recencia:', score);

  // Frequencia (25pts)
  let freqScore = 0;
  if (mediaComprasMes >= 3) freqScore = 25;
  else if (mediaComprasMes >= 2) freqScore = 20;
  else if (mediaComprasMes >= 1) freqScore = 15;
  else if (mediaComprasMes >= 0.5) freqScore = 10;
  else if (mediaComprasMes >= 0.25) freqScore = 5;
  else freqScore = 2;
  score += freqScore;
  console.log('Score frequencia:', freqScore, '(total:', score, ')');

  // Volume (15pts)
  let volScore = 0;
  if (totalPedidos >= 20) volScore = 15;
  else if (totalPedidos >= 10) volScore = 12;
  else if (totalPedidos >= 5) volScore = 8;
  else if (totalPedidos >= 3) volScore = 5;
  else if (totalPedidos >= 1) volScore = 3;
  score += volScore;
  console.log('Score volume:', volScore, '(total:', score, ')');

  // Classificação
  let nivel;
  if (score >= 80) nivel = 'VIP';
  else if (score >= 60) nivel = 'Ativo';
  else if (score >= 40) nivel = 'Oportunidade';
  else if (score >= 20) nivel = 'Risco';
  else nivel = 'Perdido';
  console.log('Score final (sem tendência/atividade):', score, '→', nivel);

  // 6. O que o Sentinela faz com os 507 clientes SEM pedidos
  console.log('\n=== PROBLEMA CENTRAL ===');
  console.log(cRes.count - byClient.size, 'clientes sem nenhum pedido vinculado');
  console.log('Esses clientes recebem: diasInatividade=999, totalPedidos=0');
  console.log('Score: 0 (recência) + 2 (frequência mínima) + 0 (volume) = 2 → PERDIDO');
  console.log('');
  console.log('Mas o scan mostra 993 perdidos, que é mais que os', cRes.count - byClient.size, 'sem pedidos.');
  console.log('Isso indica que clientes COM pedidos também estão sendo classificados como Perdidos.');
  console.log('Provável causa: pedidos antigos + baixa frequência → score < 20');

  // 7. Verificar clientes com pedidos que seriam "Perdido"
  let perdidosComPedidos = 0;
  byClient.forEach((ords, cid) => {
    const n = ords.length;
    const last = new Date(ords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at);
    const dias = Math.floor((now - last) / 86400000);
    const first = new Date(ords.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0].created_at);
    const meses = Math.max(1, Math.floor((now - first) / (86400000 * 30)));
    const freq = n / meses;

    let s = 0;
    if (dias <= 7) s += 30; else if (dias <= 15) s += 25; else if (dias <= 30) s += 20;
    else if (dias <= 45) s += 14; else if (dias <= 60) s += 8; else if (dias <= 90) s += 4;
    if (freq >= 3) s += 25; else if (freq >= 2) s += 20; else if (freq >= 1) s += 15;
    else if (freq >= 0.5) s += 10; else if (freq >= 0.25) s += 5; else s += 2;
    if (n >= 20) s += 15; else if (n >= 10) s += 12; else if (n >= 5) s += 8;
    else if (n >= 3) s += 5; else if (n >= 1) s += 3;
    // sem tendência e atividade recente por simplicidade

    if (s < 20) perdidosComPedidos++;
  });
  console.log('\nClientes COM pedidos mas score < 20 (Perdido):', perdidosComPedidos);
  console.log('Clientes SEM pedidos (sempre Perdido):', cRes.count - byClient.size);
  console.log('Total Perdido estimado:', perdidosComPedidos + (cRes.count - byClient.size));
}

run().catch(console.error);
