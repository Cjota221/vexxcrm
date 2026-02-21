require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // Buscar os órfãos que têm cliente_nome preenchido
  const { data, error } = await sb
    .from('orders')
    .select('id, metadata')
    .is('client_id', null)
    .not('metadata->>cliente_nome', 'is', null)
    .limit(20);

  if (error) { console.error(error); process.exit(1); }

  console.log(`Órfãos com nome: ${data.length}`);

  // Buscar clientes para comparar
  const { data: clientes } = await sb
    .from('clients')
    .select('id, name, phone')
    .limit(5000);

  for (const o of data) {
    const nome = o.metadata?.cliente_nome;
    console.log('\n--- Pedido:', o.id);
    console.log('  nome no pedido:', nome);

    // Tentar encontrar cliente com esse nome
    const nomeLower = nome.toLowerCase().trim();
    const partes = nome.trim().split(/\s+/);
    const abreviado = partes.length >= 2 ? (partes[0] + ' ' + partes[partes.length - 1]).toLowerCase() : nomeLower;

    const exato = clientes.find(c => c.name && c.name.toLowerCase().trim() === nomeLower);
    const parcial = clientes.find(c => {
      if (!c.name) return false;
      const p = c.name.trim().split(/\s+/);
      if (p.length < 2) return false;
      return (p[0] + ' ' + p[p.length - 1]).toLowerCase() === abreviado;
    });

    console.log('  match exato:', exato ? `${exato.name} (${exato.id})` : 'NÃO ENCONTRADO');
    console.log('  match parcial:', parcial ? `${parcial.name} (${parcial.id})` : 'NÃO ENCONTRADO');
  }
})();
