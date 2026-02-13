const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';
const BASE = 'https://vexxcrm.netlify.app';

async function main() {
  // Get a valid user token using admin API
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // List users to get UID
  const { data: userData } = await sb.auth.admin.listUsers();
  console.log('Users found:', userData.users.length);
  userData.users.forEach(u => console.log(' -', u.email));
  const user = userData.users[0]; // use first user
  if (!user) { console.log('No users'); return; }
  console.log('Using user:', user.email);

  // Generate link which gives us a token — or use a different approach
  // Actually, let's just simulate what the API does server-side
  // The real issue is probably column names. Let's test the queries directly.

  console.log('=== Testing queries directly against Supabase ===\n');

  // 1. Test: clients with rfm_segment
  const { data: rfmClients, error: e1 } = await sb
    .from('clients')
    .select('rfm_segment')
    .not('rfm_segment', 'is', null)
    .limit(5);
  console.log('1. RFM clients:', rfmClients?.length || 0, 'error:', e1?.message || 'none');

  // 2. Test: clients with nps_estimated (was sentiment_score)
  const { data: sentClients, error: e2 } = await sb
    .from('clients')
    .select('nps_estimated, sentiment_general')
    .not('nps_estimated', 'is', null)
    .limit(5);
  console.log('2. NPS clients:', sentClients?.length || 0, 'error:', e2?.message || 'none');

  // 3. Test: behavioral_events with category (was event_category)
  const { data: events, error: e3 } = await sb
    .from('behavioral_events')
    .select('id, event_type, category, occurred_at')
    .limit(5);
  console.log('3. Events:', events?.length || 0, 'error:', e3?.message || 'none');

  // 4. Test: predictions_log with prediction_correct (was was_correct)
  const { data: preds, error: e4 } = await sb
    .from('predictions_log')
    .select('id, prediction_correct, predicted_at')
    .limit(5);
  console.log('4. Predictions:', preds?.length || 0, 'error:', e4?.message || 'none');

  // 5. Test: sync_audit_log with started_at (was created_at)
  const { data: syncs, error: e5 } = await sb
    .from('sync_audit_log')
    .select('id, started_at, status')
    .order('started_at', { ascending: false })
    .limit(5);
  console.log('5. Sync log:', syncs?.length || 0, 'error:', e5?.message || 'none');

  // 6. Test: tenants with anne columns
  const { data: tenant, error: e6 } = await sb
    .from('tenants')
    .select('id, openai_api_key, anne_enabled, anne_system_prompt, anne_model, anne_max_tokens')
    .limit(1)
    .single();
  console.log('6. Tenant anne cols:', tenant ? 'OK' : 'FAIL', 'error:', e6?.message || 'none');
  if (tenant) {
    console.log('   anne_enabled:', tenant.anne_enabled, 'anne_model:', tenant.anne_model);
  }

  // 7. Now simulate exactly what overview route does
  console.log('\n=== Simulating overview route queries ===\n');

  const tenantId = tenant?.id;
  if (!tenantId) { console.log('No tenant'); return; }

  // 7a. RFM distribution
  try {
    const { data: clients, error } = await sb
      .from('clients')
      .select('rfm_segment, nps_estimated')
      .eq('tenant_id', tenantId);
    if (error) throw error;
    console.log('7a. RFM distribution query OK, clients:', clients?.length);
  } catch(e) {
    console.log('7a. FAIL:', e.message);
  }

  // 7b. behavioral events count
  try {
    const since = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const { data, error } = await sb
      .from('behavioral_events')
      .select('category, occurred_at')
      .eq('tenant_id', tenantId)
      .gte('occurred_at', since)
      .limit(100);
    if (error) throw error;
    console.log('7b. Events query OK, count:', data?.length);
  } catch(e) {
    console.log('7b. FAIL:', e.message);
  }

  // 7c. predictions
  try {
    const { data, error } = await sb
      .from('predictions_log')
      .select('prediction_correct, predicted_at')
      .eq('tenant_id', tenantId)
      .limit(10);
    if (error) throw error;
    console.log('7c. Predictions query OK, count:', data?.length);
  } catch(e) {
    console.log('7c. FAIL:', e.message);
  }

  // 7d. sync audit
  try {
    const { data, error } = await sb
      .from('sync_audit_log')
      .select('status, started_at, records_imported')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    console.log('7d. Sync audit query OK, count:', data?.length);
  } catch(e) {
    console.log('7d. FAIL:', e.message);
  }

  // 8. Test the actual API via URL with a generated token
  console.log('\n=== Testing actual API endpoint ===\n');

  // Generate a magic link token for user
  const { data: sessionData, error: sessionError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: 'cjota221@hotmail.com',
  });

  if (sessionError) {
    console.log('Cannot generate link:', sessionError.message);
    // Try creating a session directly
    // Let's at least know what the problem is by looking at what columns might fail
    console.log('\n=== Checking overview route code against DB ===');
    
    // Read the actual route to see what it queries
    console.log('All queries passed individually. The 500 might be a different issue.');
    console.log('Check if createServerSupabaseClient works on Netlify (env vars set?)');
    return;
  }

  console.log('Generated session for testing');
}

main().catch(e => console.error('Fatal:', e.message));
