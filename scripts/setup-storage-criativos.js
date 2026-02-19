/**
 * Script para criar o bucket "criativos" no Supabase Storage.
 * Usa a Management API (aceita service_role key).
 *
 * Executar: node scripts/setup-storage-criativos.js
 */

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

const HEADERS = {
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type':  'application/json',
};

async function criarBucket() {
  console.log('🪣  Criando bucket "criativos"...');

  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      id:                'criativos',
      name:              'criativos',
      public:            true,
      file_size_limit:   52428800,   // 50 MB
      allowed_mime_types: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'audio/webm',
      ],
    }),
  });

  const json = await res.json();

  if (res.ok) {
    console.log('✅ Bucket criado com sucesso:', json);
    return true;
  }

  // Já existe → apenas confirmar
  if (json.error === 'Duplicate' || json.statusCode === '409' || res.status === 409) {
    console.log('ℹ️  Bucket já existe — atualizando configurações...');
    return await atualizarBucket();
  }

  console.error('❌ Erro ao criar bucket:', json);
  return false;
}

async function atualizarBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/criativos`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({
      public:            true,
      file_size_limit:   52428800,
      allowed_mime_types: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'audio/webm',
      ],
    }),
  });

  const json = await res.json();
  if (res.ok) {
    console.log('✅ Bucket atualizado:', json);
    return true;
  }
  console.error('❌ Erro ao atualizar bucket:', json);
  return false;
}

async function criarPolicies() {
  console.log('\n📋 Criando RLS policies via SQL...');

  const sql = `
    DROP POLICY IF EXISTS "Criativos: authenticated upload" ON storage.objects;
    CREATE POLICY "Criativos: authenticated upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'criativos');

    DROP POLICY IF EXISTS "Criativos: public read" ON storage.objects;
    CREATE POLICY "Criativos: public read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'criativos');

    DROP POLICY IF EXISTS "Criativos: authenticated update" ON storage.objects;
    CREATE POLICY "Criativos: authenticated update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'criativos');

    DROP POLICY IF EXISTS "Criativos: authenticated delete" ON storage.objects;
    CREATE POLICY "Criativos: authenticated delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'criativos');
  `;

  // Usar pg-meta via REST para executar DDL (requer service_role)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) {
    console.log('✅ Policies criadas com sucesso');
    return true;
  }

  // exec_sql pode não existir — tentar via pg-meta
  const res2 = await fetch(`${SUPABASE_URL}/pg-meta/v1/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: sql }),
  });

  const json2 = await res2.json().catch(() => ({}));
  if (res2.ok) {
    console.log('✅ Policies criadas via pg-meta');
    return true;
  }

  // Policies não críticas — o bucket público já permite leitura
  console.warn('⚠️  Não foi possível criar policies via API (normal em projetos Supabase).');
  console.warn('   As policies podem ser criadas manualmente no Dashboard → Authentication → Policies.');
  console.warn('   Detalhe:', JSON.stringify(json2).substring(0, 200));
  return false;
}

async function verificarBucket() {
  console.log('\n🔍 Verificando bucket...');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/criativos`, {
    headers: HEADERS,
  });
  const json = await res.json();
  if (res.ok) {
    console.log('✅ Bucket verificado:', {
      id:               json.id,
      public:           json.public,
      file_size_limit:  json.file_size_limit,
    });
    return true;
  }
  console.error('❌ Bucket não encontrado após criação:', json);
  return false;
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log(' Setup Storage — bucket "criativos"  ');
  console.log('══════════════════════════════════════\n');

  const bucketOk = await criarBucket();
  if (!bucketOk) {
    console.error('\n❌ Falhou na criação do bucket. Abortando.');
    process.exit(1);
  }

  await criarPolicies();
  await verificarBucket();

  console.log('\n══════════════════════════════════════');
  console.log(' ✅ Pronto! Upload de criativos deve  ');
  console.log('    funcionar agora.                  ');
  console.log('══════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
