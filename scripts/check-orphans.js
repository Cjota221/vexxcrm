const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  // Amostra de pedidos órfãos - ver metadados
  const { data } = await sb.from('orders').select('id, metadata, external_id').is('client_id', null).limit(5);
  
  for (const o of (data || [])) {
    const meta = o.metadata || {};
    const keys = Object.keys(meta);
    console.log(`\n=== Order ${o.external_id} ===`);
    console.log('Metadata keys:', keys.join(', '));
    console.log('cliente_nome:', meta.cliente_nome || 'N/A');
    console.log('cliente_telefone:', meta.cliente_telefone || 'N/A');
    console.log('cliente_whatsapp:', meta.cliente_whatsapp || 'N/A');
    console.log('Has itens:', !!meta.itens);
    if (!keys.length) console.log('>>> METADATA VAZIA!');
  }

  // Quantos órfãos tem metadata vazia vs preenchida
  const { data: orphans } = await sb.from('orders').select('metadata').is('client_id', null);
  let empty = 0, hasPhone = 0, noPhone = 0;
  for (const o of (orphans || [])) {
    const m = o.metadata || {};
    if (!Object.keys(m).length) { empty++; continue; }
    const ph = m.cliente_whatsapp || m.cliente_telefone || '';
    if (ph) hasPhone++; else noPhone++;
  }
  console.log('\n=== RESUMO ORFAOS ===');
  console.log('Metadata vazia:', empty);
  console.log('Com telefone:', hasPhone);
  console.log('Sem telefone (tem metadata):', noPhone);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
