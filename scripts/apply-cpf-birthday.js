/**
 * Aplica colunas cpf e birthday na tabela clients do Supabase
 * Usa a Supabase Management API (pg-meta) para executar DDL
 */

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';
const PROJECT_REF = 'qjjflshqdaapwneeirdq';

const SQLS = [
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14)",
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday DATE",
  "CREATE INDEX IF NOT EXISTS idx_clients_cpf ON clients(tenant_id, cpf) WHERE cpf IS NOT NULL",
];

async function tryEndpoints() {
  // Tentativa 1: pg-meta query endpoint
  const endpoints = [
    `/pg-meta/default/query`,
    `/rest/v1/rpc/exec_sql`,
  ];

  for (const ep of endpoints) {
    console.log(`Tentando ${ep}...`);
    try {
      const res = await fetch(`${SUPABASE_URL}${ep}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: 'SELECT 1 as test' }),
      });
      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Body: ${text.substring(0, 200)}`);
      if (res.ok) {
        console.log(`  ✅ Endpoint funciona!`);
        return ep;
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  return null;
}

async function main() {
  console.log('=== Aplicando colunas cpf + birthday ===\n');

  const workingEndpoint = await tryEndpoints();

  if (!workingEndpoint) {
    console.log('\n--- Tentando abordagem alternativa: criar função SQL via API ---');

    // Abordagem: criar uma função RPC via Supabase Dashboard e chamá-la
    // Como fallback, vamos tentar inserir via REST diretamente
    // O Supabase realmente precisa do Dashboard para DDL

    // Alternativa: usar a database connection string diretamente
    // Mas não temos pg instalado aqui

    // Última tentativa: usar Supabase JS client para criar a função
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      db: { schema: 'public' },
    });

    // Tentar via .rpc com raw SQL wrapping
    for (const sql of SQLS) {
      console.log(`\nExecutando: ${sql.substring(0, 60)}...`);
      
      // Tentar múltiplas formas
      const { data, error } = await sb.rpc('query', { sql_query: sql });
      if (error) {
        console.log(`  rpc('query'): ${error.message}`);
      } else {
        console.log(`  ✅ OK`);
        continue;
      }

      // Se nenhuma funciona, precisamos do Dashboard
    }

    console.log('\n=============================================');
    console.log('⚠️  NÃO FOI POSSÍVEL EXECUTAR DDL VIA API.');
    console.log('');
    console.log('Execute o SQL abaixo no Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql/new');
    console.log('=============================================\n');
    console.log(SQLS.join(';\n') + ';');
    console.log('\n=============================================');
    return;
  }

  // Se encontrou endpoint, executar
  for (const sql of SQLS) {
    console.log(`\nExecutando: ${sql.substring(0, 60)}...`);
    const res = await fetch(`${SUPABASE_URL}${workingEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      console.log('  ✅ OK');
    } else {
      console.log(`  ❌ Status ${res.status}: ${await res.text()}`);
    }
  }

  // Verificar
  console.log('\n--- Verificando ---');
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await sb.from('clients').select('id,cpf,birthday').limit(2);
  console.log(error ? `❌ ${error.message}` : `✅ Colunas cpf/birthday existem! (${data.length} rows)`);
}

main().catch(e => console.error('Fatal:', e.message));
