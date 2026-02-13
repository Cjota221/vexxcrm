const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI3MTgsImV4cCI6MjA4NjQ4ODcxOH0.GkQTYazhBmlY7aQTkXn6N4nB7_SYeLbkH7G3Jqhkp8A'
);

(async () => {
  try {
    // Login
    const { data: { session }, error } = await sb.auth.signInWithPassword({
      email: 'cjota221@hotmail.com',
      password: 'Cj221100@'
    });
    
    if (error) {
      console.error('Auth error:', error.message);
      // Try alternate email
      const { data: { session: s2 }, error: e2 } = await sb.auth.signInWithPassword({
        email: 'carolineazevedo075@gmail.com',
        password: 'Cj221100@'
      });
      if (e2) {
        console.error('Auth error 2:', e2.message);
        process.exit(1);
      }
      var token = s2.access_token;
    } else {
      var token = session.access_token;
    }
    
    console.log('Token OK');

    // Test each endpoint
    const endpoints = [
      { name: 'GET seasonal', url: 'https://vexxcrm.netlify.app/api/intelligence/seasonal', method: 'GET' },
      { name: 'GET products trends', url: 'https://vexxcrm.netlify.app/api/intelligence/products?type=trends', method: 'GET' },
      { name: 'GET products affinity', url: 'https://vexxcrm.netlify.app/api/intelligence/products?type=affinity', method: 'GET' },
      { name: 'POST seasonal', url: 'https://vexxcrm.netlify.app/api/intelligence/seasonal', method: 'POST' },
      { name: 'POST products', url: 'https://vexxcrm.netlify.app/api/intelligence/products', method: 'POST' },
    ];

    for (const ep of endpoints) {
      console.log(`\n--- ${ep.name} ---`);
      try {
        const r = await fetch(ep.url, {
          method: ep.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          }
        });
        console.log('Status:', r.status);
        const contentType = r.headers.get('content-type');
        console.log('Content-Type:', contentType);
        const text = await r.text();
        if (contentType && contentType.includes('json')) {
          const json = JSON.parse(text);
          console.log('Response:', JSON.stringify(json).substring(0, 500));
        } else {
          console.log('Response (text):', text.substring(0, 300));
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    }
  } catch (e) {
    console.error('Fatal:', e.message);
  }
  process.exit(0);
})();
