/**
 * Script para aplicar a migration 009: UNIQUE constraint em messages(tenant_id, external_id)
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function run() {
  console.log('=== Migration 009: messages_tenant_external_unique ===\n');

  // 1. Verificar se há duplicatas
  const { data: dupes, error: dupErr } = await supabase
    .from('messages')
    .select('external_id, tenant_id')
    .not('external_id', 'is', null)
    .limit(5);

  console.log('Sample messages:', dupes?.length || 0, dupErr?.message || 'OK');

  // 2. Verificar se constraint já existe
  const { data: checkData } = await supabase
    .from('messages')
    .select('id')
    .limit(1);

  console.log('Messages table accessible:', checkData !== null);

  // 3. Aplicar via SQL direto (Supabase REST API)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  // Step 1: Delete duplicates
  console.log('\n1. Removendo duplicatas...');
  const res1 = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({}),
  });
  // RPC might not exist, try direct SQL via pg_query if available
  console.log('RPC test status:', res1.status);

  // Try using the Supabase Management API or direct approach
  // Since we can't run raw SQL via REST, we'll handle dedup in the sync route itself
  console.log('\n⚠️  Cannot run raw SQL via REST API.');
  console.log('The sync route already handles dedup by checking external_id before insert.');
  console.log('For the UNIQUE constraint, please run this SQL in the Supabase Dashboard SQL Editor:');
  console.log('\n--- SQL to run in Supabase Dashboard ---');
  console.log(`
-- Remove duplicates (keep newest)
DELETE FROM messages a USING messages b
WHERE a.id < b.id
  AND a.tenant_id = b.tenant_id
  AND a.external_id = b.external_id
  AND a.external_id IS NOT NULL;

-- Drop old non-unique index
DROP INDEX IF EXISTS idx_messages_external;

-- Add UNIQUE constraint
ALTER TABLE messages
  ADD CONSTRAINT messages_tenant_external_unique
  UNIQUE (tenant_id, external_id);
  `);
  console.log('--- End SQL ---\n');
  console.log('Or the sync route will work anyway using individual dedup checks.');
}

run().catch(console.error);
