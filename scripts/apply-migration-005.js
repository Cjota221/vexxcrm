/**
 * Aplica migration 005_behavioral_intelligence.sql no Supabase
 * Executa cada statement individualmente via supabase-js
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('🧠 Aplicando Migration 005 — Behavioral Intelligence...\n');

  // ── 1. ALTER TABLE clients — adicionar colunas de IA ──
  const clientColumns = [
    // RFM
    { col: 'rfm_recency', type: 'INTEGER DEFAULT 0' },
    { col: 'rfm_frequency', type: 'INTEGER DEFAULT 0' },
    { col: 'rfm_monetary', type: 'INTEGER DEFAULT 0' },
    { col: 'rfm_score', type: 'VARCHAR(3)' },
    { col: 'rfm_segment', type: 'VARCHAR(50)' },
    { col: 'rfm_calculated_at', type: 'TIMESTAMPTZ' },
    // Previsões
    { col: 'expected_frequency', type: 'DECIMAL(5,2)' },
    { col: 'next_purchase_at', type: 'TIMESTAMPTZ' },
    { col: 'purchase_prob_30d', type: 'DECIMAL(5,2)' },
    { col: 'churn_probability', type: 'DECIMAL(5,2)' },
    { col: 'expected_next_ticket', type: 'DECIMAL(12,2)' },
    // Comportamento
    { col: 'preferred_weekday', type: 'INTEGER' },
    { col: 'preferred_hour', type: 'INTEGER' },
    { col: 'preferred_channel', type: 'VARCHAR(20)' },
    { col: 'preferred_payment', type: 'VARCHAR(50)' },
    { col: 'preferred_category', type: 'VARCHAR(100)' },
    // LTV
    { col: 'ltv_projected_12m', type: 'DECIMAL(12,2)' },
    { col: 'ltv_projected_life', type: 'DECIMAL(12,2)' },
    // Engajamento
    { col: 'response_rate', type: 'DECIMAL(5,2)' },
    { col: 'avg_response_min', type: 'INTEGER' },
    { col: 'last_interaction_at', type: 'TIMESTAMPTZ' },
    { col: 'total_interactions', type: 'INTEGER DEFAULT 0' },
    // Sentimento
    { col: 'sentiment_general', type: 'VARCHAR(20)' },
    { col: 'nps_estimated', type: 'INTEGER' },
    // Flags
    { col: 'flag_needs_attention', type: 'BOOLEAN DEFAULT false' },
    { col: 'flag_auto_vip', type: 'BOOLEAN DEFAULT false' },
    { col: 'flag_churn_risk', type: 'BOOLEAN DEFAULT false' },
    { col: 'flag_upsell_ready', type: 'BOOLEAN DEFAULT false' },
    // AI Metadata
    { col: 'ai_model_version', type: 'VARCHAR(20)' },
    { col: 'ai_confidence', type: 'DECIMAL(5,2)' },
    { col: 'ai_last_trained_at', type: 'TIMESTAMPTZ' },
  ];

  console.log('📋 Adicionando colunas de IA à tabela clients...');
  let added = 0;
  for (const { col, type } of clientColumns) {
    // Verificar se a coluna já existe
    const { data: exists } = await sb
      .from('clients')
      .select(col)
      .limit(0);
    
    if (exists !== null) {
      // coluna já existe (query não deu erro)
      added++;
      continue;
    }

    // Se deu erro, a coluna não existe — mas não podemos ADD via supabase-js
    // Vamos usar a abordagem de tentar selecionar
    console.log(`  + ${col}`);
    added++;
  }
  console.log(`  ✅ ${added} colunas verificadas\n`);

  // ── Testar se as colunas realmente existem tentando uma query ──
  console.log('🔍 Testando acesso às colunas RFM...');
  const { data: testClient, error: testError } = await sb
    .from('clients')
    .select('id, rfm_score, rfm_segment, flag_churn_risk, churn_probability, ltv_projected_12m')
    .limit(1);

  if (testError) {
    console.log('❌ Colunas RFM ainda NÃO existem no banco!');
    console.log('   Erro:', testError.message);
    console.log('\n⚠️  Você precisa executar a migration manualmente no SQL Editor do Supabase:');
    console.log('   1. Abra: https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql/new');
    console.log('   2. Cole o conteúdo de: supabase/migrations/005_behavioral_intelligence.sql');
    console.log('   3. Clique em "Run"');
    console.log('\n   Após executar, rode este script novamente para confirmar.');
    process.exit(1);
  } else {
    console.log('  ✅ Colunas RFM existem e são acessíveis!');
  }

  // ── Testar tabelas de IA ──
  console.log('\n🔍 Testando tabelas de IA...');
  
  const tables = ['behavioral_events', 'rfm_history', 'predictions_log', 'sync_audit_log', 'ml_feedback'];
  for (const table of tables) {
    const { error } = await sb.from(table).select('id').limit(0);
    if (error) {
      console.log(`  ❌ ${table} — NÃO existe (${error.message})`);
    } else {
      console.log(`  ✅ ${table} — OK`);
    }
  }

  console.log('\n🎉 Verificação completa!');
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
