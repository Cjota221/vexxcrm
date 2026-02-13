const{createClient}=require('@supabase/supabase-js');
const sb=createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function main() {
  // Check tenant_settings
  const r1 = await sb.from('tenant_settings').select('*').limit(1);
  console.log('tenant_settings:', r1.error?.message || 'exists', r1.data?.length);

  // Check profiles to get tenant_id
  const r2 = await sb.from('profiles').select('id, tenant_id, role').limit(5);
  console.log('profiles:', r2.error?.message || 'ok', JSON.stringify(r2.data));

  // Now let's look at what overview route actually does — it uses profiles + tenants
  // The 500 on overview is caused by selecting anne columns from tenants
  // But wait — overview route doesn't select anne columns. Let me re-read the route.
  
  // Actually the 500 on overview/rfm was ALREADY FIXED for column names.
  // But maybe the fix didn't reach Netlify yet, OR maybe there's another issue.
  // Let me test the exact queries overview does:
  
  const tid = r2.data?.[0]?.tenant_id;
  if (!tid) { console.log('no tenant_id in profiles'); return; }
  console.log('tenant_id:', tid);

  // Overview query 1: clients with rfm
  const q1 = await sb.from('clients').select('rfm_segment, nps_estimated').eq('tenant_id', tid);
  console.log('q1 clients rfm:', q1.error?.message || 'ok', q1.data?.length);

  // Overview query 2: behavioral events
  const since = new Date(Date.now() - 30*86400000).toISOString();
  const q2 = await sb.from('behavioral_events').select('category, occurred_at').eq('tenant_id', tid).gte('occurred_at', since);
  console.log('q2 events:', q2.error?.message || 'ok', q2.data?.length);

  // Overview query 3: predictions
  const q3 = await sb.from('predictions_log').select('prediction_correct, predicted_at').eq('tenant_id', tid);
  console.log('q3 predictions:', q3.error?.message || 'ok', q3.data?.length);

  // Overview query 4: sync audit
  const q4 = await sb.from('sync_audit_log').select('status, started_at, records_imported').eq('tenant_id', tid).order('started_at', { ascending: false }).limit(5);
  console.log('q4 sync:', q4.error?.message || 'ok', q4.data?.length);

  // PUT config 500 — this is definitely the anne columns issue
  // The PUT tries to update anne_enabled, anne_model, anne_system_prompt on tenants
  // but those columns don't exist!
  const q5 = await sb.from('tenants').select('openai_api_key').eq('id', tid).single();
  console.log('q5 tenant openai:', q5.error?.message || 'ok');

  // Try updating with anne columns
  const q6 = await sb.from('tenants').update({ anne_enabled: true }).eq('id', tid);
  console.log('q6 update anne_enabled:', q6.error?.message || 'ok');
}
main().catch(e => console.error(e));
