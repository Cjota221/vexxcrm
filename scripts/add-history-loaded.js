/**
 * add-history-loaded.js
 * Adiciona coluna history_loaded na tabela conversations
 * para suportar lazy loading de histórico do WhatsApp.
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function run() {
  console.log('🔄 Adicionando coluna history_loaded em conversations...\n');

  // Tentativa 1: via exec_sql RPC
  const { error } = await sb.rpc('exec_sql', {
    query: `
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS history_loaded BOOLEAN NOT NULL DEFAULT FALSE;
    `
  });

  if (!error) {
    console.log('✅ Coluna history_loaded adicionada com sucesso!');
    return;
  }

  console.log('⚠️  exec_sql não disponível:', error.message);
  console.log('\n📋 Execute manualmente no SQL Editor do Supabase:');
  console.log('──────────────────────────────────────────────────');
  console.log(`ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS history_loaded BOOLEAN NOT NULL DEFAULT FALSE;`);
  console.log('──────────────────────────────────────────────────');
  console.log('\n🔗 Acesse: https://supabase.com/dashboard/project/dhknxyjsibqdrgwpgvob/sql/new');
}

run().catch(console.error);
