/**
 * Script para adicionar colunas cpf e birthday à tabela clients no Supabase.
 * 
 * INSTRUÇÕES:
 * 1. Vá em https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/settings/database
 * 2. Copie a "Connection string" (URI) do Transaction Pooler (porta 6543)
 * 3. Substitua [YOUR-PASSWORD] pela senha do banco
 * 4. Execute: node scripts/apply-migration-columns.js "postgresql://postgres.qjjflshqdaapwneeirdq:SENHA@..."
 * 
 * Ou configure DATABASE_URL no .env.local
 */

const { Client } = require('pg');

async function main() {
  // Pegar DATABASE_URL do argumento ou env
  const dbUrl = process.argv[2] || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log('❌ DATABASE_URL não fornecida!\n');
    console.log('Uso: node scripts/apply-migration-columns.js "postgresql://postgres.qjjflshqdaapwneeirdq:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"');
    console.log('\nOu execute o SQL diretamente no Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql/new\n');
    console.log('SQL:');
    console.log('  ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);');
    console.log('  ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birthday DATE;');
    console.log('  CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(tenant_id, cpf) WHERE cpf IS NOT NULL;');
    process.exit(1);
  }

  console.log('🔌 Conectando ao PostgreSQL...');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const sqls = [
      { label: 'Coluna cpf', sql: 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14)' },
      { label: 'Coluna birthday', sql: 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birthday DATE' },
      { label: 'Índice cpf', sql: 'CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(tenant_id, cpf) WHERE cpf IS NOT NULL' },
    ];

    for (const { label, sql } of sqls) {
      try {
        await client.query(sql);
        console.log(`✅ ${label}: OK`);
      } catch (err) {
        console.log(`⚠️ ${label}: ${err.message}`);
      }
    }

    // Verificar
    console.log('\n--- Verificação ---');
    const result = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name IN ('cpf', 'birthday') ORDER BY column_name"
    );

    if (result.rows.length === 2) {
      console.log('✅ Ambas as colunas existem:');
      result.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));
    } else if (result.rows.length > 0) {
      console.log('⚠️ Parcialmente criado:');
      result.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));
    } else {
      console.log('❌ Nenhuma coluna encontrada — algo deu errado.');
    }

    // Verificar constraint unique
    console.log('\n--- Unique constraints ---');
    const constraints = await client.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'public.clients'::regclass AND contype = 'u'"
    );
    constraints.rows.forEach(r => console.log(`   - ${r.conname}`));

  } catch (err) {
    console.error('❌ Erro de conexão:', err.message);
    if (err.message.includes('password')) {
      console.log('\n💡 Dica: Verifique se a senha do banco está correta.');
      console.log('   Vá em: Supabase Dashboard → Settings → Database → Reset password');
    }
  } finally {
    await client.end();
  }
}

main();
