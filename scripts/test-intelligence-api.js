const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

(async () => {
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'cjota221@hotmail.com',
    password: 'Cj221100@',
  });

  if (error) {
    console.error('Auth error:', error.message);
    process.exit(1);
  }

  const token = data.session.access_token;
  console.log('Token OK');

  // Test overview
  try {
    const r1 = await fetch('https://vexxcrm.netlify.app/api/intelligence/overview', {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('\n=== OVERVIEW ===');
    console.log('Status:', r1.status);
    const t1 = await r1.text();
    console.log(t1.substring(0, 1000));
  } catch (e) {
    console.error('Overview fetch error:', e.message);
  }

  // Test rfm
  try {
    const r2 = await fetch('https://vexxcrm.netlify.app/api/intelligence/rfm', {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('\n=== RFM ===');
    console.log('Status:', r2.status);
    const t2 = await r2.text();
    console.log(t2.substring(0, 1000));
  } catch (e) {
    console.error('RFM fetch error:', e.message);
  }

  process.exit(0);
})();
