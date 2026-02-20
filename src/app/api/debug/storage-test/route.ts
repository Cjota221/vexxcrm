import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/debug/storage-test
 *
 * Diagnóstico do bucket 'avatars' no Supabase Storage.
 * Testa: listar bucket, fazer upload de 1px e gerar URL pública.
 * USE APENAS PARA DIAGNÓSTICO — remova após resolver o problema.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const results: Record<string, unknown> = { tenantId };

    // 1. Verificar se bucket 'avatars' existe
    const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
    results.buckets = buckets?.map(b => ({ id: b.id, name: b.name, public: b.public })) ?? null;
    results.buckets_error = bucketsErr?.message ?? null;

    const avatarBucket = buckets?.find(b => b.name === 'avatars');
    results.avatars_bucket_exists = !!avatarBucket;
    results.avatars_bucket_public = avatarBucket?.public ?? null;

    if (!avatarBucket) {
      results.diagnosis = '❌ BUCKET "avatars" NÃO EXISTE — precisa criar no Supabase Dashboard > Storage';
      return NextResponse.json(results);
    }

    if (!avatarBucket.public) {
      results.diagnosis_warning = '⚠️ Bucket "avatars" NÃO é público — URLs só funcionam com token de autenticação. Tornar público em: Supabase > Storage > avatars > Settings > Public bucket';
    }

    // 2. Tentar upload de imagem de teste (1x1 pixel branco JPEG)
    const testPath = `${tenantId}/test-debug.jpg`;
    const pixel1x1 = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVIP/2Q==',
      'base64'
    );

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(testPath, pixel1x1, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    results.upload_test_error = uploadErr?.message ?? null;
    results.upload_test_ok = !uploadErr;

    if (uploadErr) {
      results.diagnosis = `❌ UPLOAD FALHOU: ${uploadErr.message}`;
      results.diagnosis_hint = 'Verifique as políticas RLS do bucket "avatars" no Supabase Dashboard > Storage > Policies';
      return NextResponse.json(results);
    }

    // 3. Gerar URL pública
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(testPath);
    results.public_url = pub.publicUrl;

    // 4. Verificar se a URL pública é acessível (HTTP GET)
    try {
      const urlRes = await fetch(pub.publicUrl, { method: 'HEAD' });
      results.public_url_status = urlRes.status;
      results.public_url_ok = urlRes.ok;
      if (!urlRes.ok) {
        results.diagnosis = `⚠️ URL pública gerada mas retorna ${urlRes.status} — bucket pode não ser público`;
      } else {
        results.diagnosis = '✅ Bucket OK — upload e URL pública funcionando corretamente';
      }
    } catch (fetchErr) {
      results.public_url_fetch_error = String(fetchErr);
    }

    // 5. Contar arquivos existentes no path do tenant
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(`${tenantId}/clients`, { limit: 5 });
    results.existing_avatars_sample = files?.map(f => f.name) ?? [];

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
