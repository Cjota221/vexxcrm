/**
 * Simula exatamente o que overview/route.ts faz,
 * passo a passo, para encontrar o erro
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTI3MTgsImV4cCI6MjA4NjQ4ODcxOH0.GkQTYazhBmlY7aQTkXn6N4nB7_SYeLbkH7G3Jqhkp8A';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

  // 1) Simular o que route overview faz: profiles lookup
  console.log('=== Step 1: profiles lookup ===');
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('tenant_id')
    .eq('tenant_id', TENANT_ID)
    .single();
  
  if (profErr) {
    console.log('❌ Profile error:', profErr.message);
  } else {
    console.log('✅ Profile tenant_id:', profile.tenant_id);
  }

  // 2) Query de clientes (overview)
  console.log('\n=== Step 2: clients RFM query (overview) ===');
  const { data: clients, error: clientsErr } = await sb
    .from('clients')
    .select('rfm_segment, churn_probability, purchase_prob_30d, ltv_projected_12m, flag_auto_vip, flag_churn_risk, flag_needs_attention, flag_upsell_ready, nps_estimated, rfm_calculated_at')
    .eq('tenant_id', TENANT_ID)
    .not('rfm_segment', 'is', null);
  
  if (clientsErr) {
    console.log('❌ Clients error:', clientsErr.message);
  } else {
    console.log('✅ Clients com RFM:', clients.length);
  }

  // 3) Events
  console.log('\n=== Step 3: behavioral_events query ===');
  const { data: events, error: eventsErr } = await sb
    .from('behavioral_events')
    .select('category, event_type, sentiment_score, occurred_at')
    .eq('tenant_id', TENANT_ID)
    .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  if (eventsErr) {
    console.log('❌ Events error:', eventsErr.message);
  } else {
    console.log('✅ Events 7d:', events.length);
  }

  // 4) Predictions
  console.log('\n=== Step 4: predictions_log query ===');
  const { data: preds, error: predsErr } = await sb
    .from('predictions_log')
    .select('prediction_correct, confidence, prediction_type')
    .eq('tenant_id', TENANT_ID)
    .not('prediction_correct', 'is', null);
  
  if (predsErr) {
    console.log('❌ Predictions error:', predsErr.message);
  } else {
    console.log('✅ Predictions:', preds.length);
  }

  // 5) Sync audit
  console.log('\n=== Step 5: sync_audit_log query ===');
  const { data: syncs, error: syncErr } = await sb
    .from('sync_audit_log')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .order('started_at', { ascending: false })
    .limit(5);
  
  if (syncErr) {
    console.log('❌ Sync error:', syncErr.message);
  } else {
    console.log('✅ Syncs:', syncs.length);
  }

  // 6) Verificar se o environment no Netlify tem SUPABASE_SERVICE_ROLE_KEY
  console.log('\n=== Step 6: check route env vars ===');
  console.log('A route usa:');
  console.log('  - NEXT_PUBLIC_SUPABASE_URL (como supabaseUrl)');
  console.log('  - SUPABASE_SERVICE_ROLE_KEY (como supabaseServiceKey)');
  console.log('');
  console.log('⚠️ Verifique se no Netlify a env var se chama SUPABASE_SERVICE_ROLE_KEY');
  console.log('   No .env.local ela se chama SUPABASE_SERVICE_KEY (SEM _ROLE)');

  // 7) Verificar o nome exato
  const fs = require('fs');
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const serviceKeyLine = envContent.split('\n').find(l => l.startsWith('SUPABASE_SERVICE'));
  console.log('\n=== Step 7: env var name ===');
  console.log('Local env var:', serviceKeyLine?.split('=')[0]);

  // Ler a route pra ver qual nome ela usa
  const overviewRoute = fs.readFileSync('src/app/api/intelligence/overview/route.ts', 'utf-8');
  const envMatch = overviewRoute.match(/process\.env\.(\w+SERV\w+)/);
  console.log('Route espera:', envMatch ? envMatch[1] : 'NOT FOUND');
  
  if (serviceKeyLine) {
    const localName = serviceKeyLine.split('=')[0];
    const routeName = envMatch ? envMatch[1] : '';
    if (localName !== routeName) {
      console.log('\n🔴 MISMATCH! A route espera "' + routeName + '" mas o env tem "' + localName + '"');
      console.log('   ISSO CAUSA O 500! O supabaseServiceKey fica undefined!');
    } else {
      console.log('\n✅ Nomes batem');
    }
  }
}

main().catch(console.error);
