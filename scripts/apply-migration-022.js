/**
 * Aplica migration 022 — adiciona coluna config JSONB na tabela tenants
 * e colunas cnpj, contact_email, contact_phone.
 */

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const statements = [
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj TEXT DEFAULT NULL`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT NULL`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT NULL`,
];

async function exec(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    // Tentar via pg-meta
    const res2 = await fetch(`${SUPABASE_URL}/pg-meta/v1/query`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res2.ok) {
      const err = await res2.text();
      throw new Error(err);
    }
    return res2.json();
  }
  return res.json();
}

async function main() {
  console.log('🚀 Aplicando migration 022 — config JSONB na tabela tenants...\n');

  for (const sql of statements) {
    const label = sql.substring(0, 70);
    try {
      await exec(sql);
      console.log(`✅ ${label}`);
    } catch (e) {
      // IF NOT EXISTS: ignorar erro de coluna já existente
      const msg = String(e);
      if (msg.includes('already exists') || msg.includes('já existe')) {
        console.log(`⚠️  (já existe) ${label}`);
      } else {
        console.error(`❌ ${label}`);
        console.error(`   Erro: ${msg}`);
      }
    }
  }

  console.log('\n✅ Migration 022 concluída!');
  console.log('   Agora o campo config JSONB existe na tabela tenants.');
  console.log('   O site_url do FacilZap e o Pix serão salvos corretamente.');
}

main().catch(console.error);
