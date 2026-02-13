/**
 * Testa os endpoints de intelligence em produção
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI3MTgsImV4cCI6MjA4NjQ4ODcxOH0.GkQTYazhBmlY7aQTkXn6N4nB7_SYeLbkH7G3Jqhkp8A';

const sb = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  // Login
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: 'carolineazevedo075@gmail.com',
    password: 'Cj221100@',
  });

  if (authErr) {
    console.error('❌ Auth error:', authErr.message);
    return;
  }

  const token = auth.session.access_token;
  console.log('✅ Token obtido');

  // Testar overview
  console.log('\n=== GET /api/intelligence/overview ===');
  try {
    const r1 = await fetch('https://vexxcrm.netlify.app/api/intelligence/overview', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body1 = await r1.text();
    console.log('Status:', r1.status);
    if (r1.status !== 200) {
      console.log('Response:', body1.substring(0, 500));
    } else {
      const j = JSON.parse(body1);
      console.log('Success:', j.success);
      console.log('RFM total:', j.overview?.rfm?.total_calculated);
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }

  // Testar rfm
  console.log('\n=== GET /api/intelligence/rfm ===');
  try {
    const r2 = await fetch('https://vexxcrm.netlify.app/api/intelligence/rfm', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body2 = await r2.text();
    console.log('Status:', r2.status);
    if (r2.status !== 200) {
      console.log('Response:', body2.substring(0, 500));
    } else {
      const j = JSON.parse(body2);
      console.log('Success:', j.success);
      console.log('Total:', j.summary?.total);
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }

  // Testar config GET
  console.log('\n=== GET /api/tenants/config ===');
  try {
    const r3 = await fetch('https://vexxcrm.netlify.app/api/tenants/config', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body3 = await r3.text();
    console.log('Status:', r3.status);
    console.log('Response:', body3.substring(0, 300));
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

main().catch(console.error);
