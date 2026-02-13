/**
 * Diagnóstico + Fix da tabela tenants
 * 1. Verifica se owner_id existe
 * 2. Adiciona colunas anne_* se faltarem
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // 1) Verificar se owner_id existe na tabela tenants
  console.log('=== Verificando owner_id na tabela tenants ===');
  const { data: row, error: ownerErr } = await sb
    .from('tenants')
    .select('id')
    .limit(1)
    .single();
  console.log('Tenant sample (id):', row?.id);

  // Testar select com owner_id
  const { data: ownerTest, error: ownerTestErr } = await sb
    .from('tenants')
    .select('id, owner_id')
    .limit(1);
  
  if (ownerTestErr) {
    console.log('❌ owner_id NÃO existe:', ownerTestErr.message);
  } else {
    console.log('✅ owner_id existe:', ownerTest);
  }

  // 2) Verificar profiles para entender como tenant_id é associado
  console.log('\n=== Verificando profiles ===');
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, tenant_id, email, role')
    .limit(5);
  
  if (profErr) {
    console.log('❌ profiles error:', profErr.message);
  } else {
    console.log('✅ profiles:', JSON.stringify(profiles, null, 2));
  }

  // 3) Adicionar colunas anne_* via rpc (SQL direto)
  console.log('\n=== Adicionando colunas anne_* ===');
  
  const alterSql = `
    ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS anne_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS anne_system_prompt TEXT,
      ADD COLUMN IF NOT EXISTS anne_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
      ADD COLUMN IF NOT EXISTS anne_max_tokens INTEGER DEFAULT 500;
  `;

  const { data: sqlResult, error: sqlErr } = await sb.rpc('exec_sql', { sql: alterSql });
  
  if (sqlErr) {
    console.log('⚠️ rpc exec_sql não disponível, tentando via REST...');
    
    // Fallback: usar fetch direto com SQL endpoint
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql: alterSql }),
    });
    
    if (!resp.ok) {
      console.log('⚠️ REST rpc também falhou. Tentando via SQL Editor endpoint...');
      
      // Usar o endpoint de SQL do management API
      const sqlResp = await fetch(`${SUPABASE_URL}/pg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: alterSql }),
      });
      
      if (!sqlResp.ok) {
        console.log('❌ Não foi possível executar ALTER TABLE automaticamente');
        console.log('   Por favor, execute o SQL manualmente no Supabase Dashboard:');
        console.log('');
        console.log(alterSql);
        console.log('');
      } else {
        console.log('✅ Colunas adicionadas via pg endpoint');
      }
    } else {
      console.log('✅ Colunas adicionadas via REST rpc');
    }
  } else {
    console.log('✅ Colunas adicionadas via rpc');
  }

  // 4) Verificar se as colunas agora existem
  console.log('\n=== Verificando se colunas anne_* existem agora ===');
  const { data: tenantCheck, error: checkErr } = await sb
    .from('tenants')
    .select('id, anne_enabled, anne_model, anne_max_tokens')
    .limit(1);
  
  if (checkErr) {
    console.log('❌ Colunas AINDA não existem:', checkErr.message);
    console.log('\n🔧 EXECUTE MANUALMENTE no Supabase SQL Editor (https://supabase.com/dashboard):');
    console.log(alterSql);
  } else {
    console.log('✅ Colunas anne_* confirmadas:', tenantCheck);
  }
}

main().catch(console.error);
