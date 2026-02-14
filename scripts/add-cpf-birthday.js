const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function applyFix() {
  console.log('=== Adicionando colunas cpf e birthday à tabela clients ===\n');

  // Usar REST API diretamente para executar SQL
  const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

  const sql = `
    -- Adicionar colunas faltantes
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday DATE;

    -- Índice para busca por CPF
    CREATE INDEX IF NOT EXISTS idx_clients_cpf ON clients(tenant_id, cpf) WHERE cpf IS NOT NULL;
  `;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    console.log('RPC exec_sql não existe, tentando via pg_query...');
    
    // Alternativa: usar SQL Editor via Management API
    // Vamos usar a abordagem de inserir um registro de teste para confirmar
    
    // Tentar via Supabase SQL (management API)
    const mgmtRes = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!mgmtRes.ok) {
      console.log('pg/query também não disponível. Status:', mgmtRes.status);
      console.log('Resposta:', await mgmtRes.text().catch(() => 'sem body'));
      
      // Última tentativa: Supabase SQL API
      console.log('\n--- Tentando via /sql ---');
      const sqlRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=representation',
        },
      });
      console.log('REST root:', sqlRes.status);

      console.log('\n=============================================');
      console.log('AÇÃO NECESSÁRIA: Execute este SQL no Supabase Dashboard');
      console.log('URL: https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql');
      console.log('=============================================\n');
      console.log(sql);
      console.log('\n=============================================');
      return;
    }

    const mgmtData = await mgmtRes.json();
    console.log('pg/query resultado:', JSON.stringify(mgmtData));
  } else {
    console.log('✅ SQL executado via RPC com sucesso!');
  }

  // Verificar
  console.log('\n--- Verificando resultado ---');
  const { data, error } = await sb
    .from('clients')
    .select('id, name, cpf, birthday')
    .eq('tenant_id', '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd')
    .limit(3);

  if (error) {
    console.log('❌ Ainda com erro:', error.message);
    console.log('\nVocê precisa executar o SQL manualmente no Supabase Dashboard.');
  } else {
    console.log('✅ Colunas cpf e birthday funcionando!');
    console.log('Amostra:', JSON.stringify(data, null, 2));
  }
}

applyFix().catch(e => console.error('Erro:', e.message));
