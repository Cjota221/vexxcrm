/**
 * Verifica migration 006_intelligence_v2.sql no Supabase.
 * Testa se tabelas e colunas existem.
 * 
 * Para aplicar a migration, copie o conteúdo do arquivo SQL
 * no SQL Editor do Supabase Dashboard.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('🧠 Verificando Migration 006 — Intelligence v2...\n');

  const newCols = ['seasonal_buyer','seasonal_score','preferred_season','variety_score','price_sensitivity','reorder_rate','sales_script_hint','last_insight_at'];
  
  const { error: colError } = await sb.from('clients').select(newCols.join(', ')).limit(0);

  if (colError) {
    console.log('❌ Novas colunas de clients NÃO existem.');
    console.log('   Erro:', colError.message);
  } else {
    console.log('✅ Novas colunas de clients — OK');
  }

  console.log('');
  const tables = ['seasonal_events','client_seasonal_profiles','product_trends','product_affinity','client_grade_preferences'];
  let allOk = !colError;

  for (const table of tables) {
    const { error } = await sb.from(table).select('id').limit(0);
    if (error) {
      console.log(`❌ ${table} — NÃO existe`);
      allOk = false;
    } else {
      console.log(`✅ ${table} — OK`);
    }
  }

  console.log('');
  const tables005 = ['behavioral_events','rfm_history','predictions_log','sync_audit_log','ml_feedback'];
  for (const table of tables005) {
    const { error } = await sb.from(table).select('id').limit(0);
    console.log(error ? `❌ ${table}` : `✅ ${table}`);
  }

  if (!allOk) {
    console.log('\n⚠️  Execute no SQL Editor:');
    console.log('https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql/new');
    console.log('Cole: supabase/migrations/006_intelligence_v2.sql');
  } else {
    console.log('\n🎉 Migration 006 OK!');
  }
}

run().catch(e => { console.error('Erro:', e.message); process.exit(1); });
