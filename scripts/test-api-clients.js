const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI3MTgsImV4cCI6MjA4NjQ4ODcxOH0.GkQTYazhBmlY7aQTkXn6N4nB7_SYeLbkH7G3Jqhkp8A'
);

async function test() {
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: 'cjota221@hotmail.com',
    password: 'Cj221100@'
  });
  
  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }

  const token = auth.session.access_token;
  console.log('Token obtido ✅');

  // Testar busca por nome de cliente importado
  const searches = ['Nigel', 'Aimeth', 'jacya'];
  
  for (const search of searches) {
    const r = await fetch(`https://vexxcrm.netlify.app/api/clients?search=${search}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    console.log(`\nBusca "${search}": status=${r.status} total=${d.total}`);
    if (d.data && d.data.length > 0) {
      d.data.forEach(c => console.log(`  - ${c.name} | ltv:${c.ltv} | orders:${c.total_orders} | source:${c.source}`));
    }
  }

  // Testar busca geral (primeira página) e ver se importados aparecem
  const r2 = await fetch('https://vexxcrm.netlify.app/api/clients?per_page=5', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d2 = await r2.json();
  console.log(`\nPrimeira página: total=${d2.total}, mostrando=${d2.data?.length}`);
  if (d2.data) {
    d2.data.forEach(c => console.log(`  - ${c.name} | source:${c.source} | updated:${c.updated_at?.substring(0,10)}`));
  }
}

test().catch(e => console.error(e));
