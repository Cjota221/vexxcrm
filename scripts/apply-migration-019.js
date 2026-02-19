/**
 * Aplica migration 019 — RPCs de contadores de campanhas
 * Usa a Supabase Management API (pg-meta) para executar SQL diretamente.
 */
const fs = require('fs');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

async function run() {
  const sql = fs.readFileSync('supabase/migrations/019_campaign_rpc_counters.sql', 'utf8');

  // Executar o SQL inteiro de uma vez pelo endpoint de query do Supabase
  // Tentativa 1: via pg endpoint (Supabase internamente expõe isso)
  const endpoints = [
    '/pg/query',
    '/rest/v1/rpc/exec_sql',
  ];

  // Abordagem alternativa: executar diretamente via supabase-js usando SQL raw
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Executar cada statement separadamente
  const statements = [
    // 1. Criar função increment_campaign_sent
    `CREATE OR REPLACE FUNCTION increment_campaign_sent(campanha_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET sent_count = COALESCE(sent_count, 0) + 1
  WHERE id = campanha_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,

    // 2. Criar função increment_campaign_failed
    `CREATE OR REPLACE FUNCTION increment_campaign_failed(campanha_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET failed_count = COALESCE(failed_count, 0) + 1
  WHERE id = campanha_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,

    // 3. Adicionar colunas
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count int DEFAULT 0;`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count int DEFAULT 0;`,
  ];

  console.log('🚀 Aplicando migration 019...\n');

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.split('\n')[0].substring(0, 70);

    try {
      const { data, error } = await supabase.rpc('exec_sql', { query: stmt });
      if (error) {
        // Se exec_sql não existe, tente via REST SQL diretamente
        console.log(`  ⚠️ [${i + 1}] ${label}`);
        console.log(`      RPC exec_sql failed: ${error.message}`);
      } else {
        console.log(`  ✅ [${i + 1}] ${label}`);
      }
    } catch (e) {
      console.log(`  ❌ [${i + 1}] ${label}: ${e.message}`);
    }
  }

  // Verificar se as colunas existem
  const { data, error } = await supabase
    .from('campaigns')
    .select('sent_count, failed_count')
    .limit(1);

  if (error) {
    console.log('\n⚠️ Colunas sent_count/failed_count não encontradas:', error.message);
    console.log('\n📋 Execute manualmente no Supabase SQL Editor:');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
  } else {
    console.log('\n✅ Colunas sent_count e failed_count existem na tabela campaigns!');
  }

  // Testar se as RPCs existem
  const { error: rpcErr1 } = await supabase.rpc('increment_campaign_sent', {
    campanha_id: '00000000-0000-0000-0000-000000000000',
  });
  const { error: rpcErr2 } = await supabase.rpc('increment_campaign_failed', {
    campanha_id: '00000000-0000-0000-0000-000000000000',
  });

  if (rpcErr1 && rpcErr1.message.includes('not found')) {
    console.log('❌ RPC increment_campaign_sent NÃO existe');
  } else {
    console.log('✅ RPC increment_campaign_sent existe');
  }

  if (rpcErr2 && rpcErr2.message.includes('not found')) {
    console.log('❌ RPC increment_campaign_failed NÃO existe');
  } else {
    console.log('✅ RPC increment_campaign_failed existe');
  }
}

run();
