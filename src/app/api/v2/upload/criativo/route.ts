import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/v2/upload/criativo
 * Recebe FormData com campo `file` (imagem já otimizada pelo client)
 * Armazena no bucket `criativos` e retorna URL pública
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });
    }

    // Validações
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo não suportado. Use JPEG, PNG ou WebP.' }, { status: 400 });
    }

    const tamanho_original = file.size;
    if (tamanho_original > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo excede 5MB' }, { status: 400 });
    }

    // Path único por tenant
    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const uuid8 = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const path = `campanhas/${profile.tenant_id}/${Date.now()}_${uuid8}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('criativos')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[UPLOAD_CRIATIVO_ERROR]', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('criativos').getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
      tamanho_original,
    });
  } catch (err) {
    console.error('[UPLOAD_CRIATIVO_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
