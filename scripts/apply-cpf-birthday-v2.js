/**
 * Aplica colunas cpf e birthday no Supabase via Supabase Management API (pg-meta)
 * Usa o endpoint correto da management API
 */

const PROJECT_REF = 'qjjflshqdaapwneeirdq';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

// A Supabase Management API real é em https://api.supabase.com
// Mas precisa de um token de acesso da conta (não service role)
// Alternativa: usar o database connection URL diretamente

// Vamos tentar usar a Supabase SQL API que aceita DDL
const SUPABASE_DB_URL = `https://${PROJECT_REF}.supabase.co`;

async function main() {
  console.log('=== Tentando via Supabase SQL API ===\n');

  // O Supabase tem um endpoint SQL que aceita queries DDL
  // quando autenticado com service_role key
  // Formato: POST /sql com body como string SQL

  const sqls = [
    "ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);",
    "ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birthday DATE;",
    "CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(tenant_id, cpf) WHERE cpf IS NOT NULL;",
  ];

  const fullSql = sqls.join('\n');

  // Tentativa: endpoint /sql (novo)
  const endpoints = [
    { url: `${SUPABASE_DB_URL}/sql`, body: fullSql, contentType: 'text/plain' },
    { url: `${SUPABASE_DB_URL}/sql`, body: JSON.stringify({ query: fullSql }), contentType: 'application/json' },
    { url: `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, body: JSON.stringify({ query: fullSql }), contentType: 'application/json' },
  ];

  for (const ep of endpoints) {
    console.log(`Tentando: ${ep.url} (${ep.contentType})`);
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': ep.contentType,
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: ep.body,
      });
      const status = res.status;
      const text = await res.text().catch(() => '');
      console.log(`  Status: ${status}`);
      console.log(`  Response: ${text.substring(0, 300)}`);
      if (res.ok) {
        console.log('  ✅ SUCESSO!');
        break;
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    console.log('');
  }

  // Verificar resultado
  console.log('\n--- Verificação final ---');
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_DB_URL, SERVICE_KEY);

  // Forçar refresh do schema cache
  const { data, error } = await sb.from('clients').select('id,name,cpf,birthday').limit(1);
  if (error) {
    console.log(`❌ Colunas ainda não existem: ${error.message}`);
    console.log('\n🔧 SOLUÇÃO: Execute este SQL no Supabase Dashboard SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
    console.log(fullSql);
  } else {
    console.log('✅ Colunas cpf e birthday criadas com sucesso!');
    console.log('Amostra:', JSON.stringify(data));
  }
}

main().catch(e => console.error(e));
