const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI3MTgsImV4cCI6MjA4NjQ4ODcxOH0.GkQTYazhBmlY7aQTkXn6N4nB7_SYeLbkH7G3Jqhkp8A'
);

(async () => {
  try {
    // Auth
    const { data: { session }, error: authErr } = await sb.auth.signInWithPassword({
      email: 'cjota221@hotmail.com',
      password: 'Cj221100@'
    });
    if (authErr) { console.error('Auth error:', authErr.message); return; }
    const token = session.access_token;
    console.log('✅ Token obtido');

    // 1. Testar GET seasonal (deve retornar vazio)
    console.log('\n--- GET /api/intelligence/seasonal ---');
    const getRes = await fetch('https://vexxcrm.netlify.app/api/intelligence/seasonal', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('Status:', getRes.status);
    const getData = await getRes.json();
    console.log('Response:', JSON.stringify(getData, null, 2).substring(0, 500));

    // 2. Testar POST seasonal (calcular)
    console.log('\n--- POST /api/intelligence/seasonal ---');
    const postRes = await fetch('https://vexxcrm.netlify.app/api/intelligence/seasonal', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token 
      }
    });
    console.log('Status:', postRes.status);
    const postData = await postRes.text();
    console.log('Response:', postData.substring(0, 1000));

    // 3. Testar GET products trends
    console.log('\n--- GET /api/intelligence/products?type=trends ---');
    const tRes = await fetch('https://vexxcrm.netlify.app/api/intelligence/products?type=trends&limit=5', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('Status:', tRes.status);
    const tData = await tRes.json();
    console.log('Response:', JSON.stringify(tData, null, 2).substring(0, 500));

    // 4. Testar POST products (calcular)
    console.log('\n--- POST /api/intelligence/products ---');
    const pRes = await fetch('https://vexxcrm.netlify.app/api/intelligence/products', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token 
      }
    });
    console.log('Status:', pRes.status);
    const pData = await pRes.text();
    console.log('Response:', pData.substring(0, 1000));

  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
