import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

// ─── Tipos permitidos e limites ──────────────────────────────────────────────

type MediaKind = 'image' | 'video' | 'audio';

const MIME_MAP: Record<string, { kind: MediaKind; ext: string }> = {
  'image/jpeg':  { kind: 'image', ext: 'jpg'  },
  'image/png':   { kind: 'image', ext: 'png'  },
  'image/webp':  { kind: 'image', ext: 'webp' },
  'video/mp4':   { kind: 'video', ext: 'mp4'  },
  'video/webm':  { kind: 'video', ext: 'webm' },
  'audio/ogg':   { kind: 'audio', ext: 'ogg'  },
  'audio/mpeg':  { kind: 'audio', ext: 'mp3'  },
  'audio/mp4':   { kind: 'audio', ext: 'm4a'  },
  'audio/wav':   { kind: 'audio', ext: 'wav'  },
  'audio/webm':  { kind: 'audio', ext: 'webm' },
};

const MAX_BYTES: Record<MediaKind, number> = {
  image:  5  * 1024 * 1024, //  5 MB
  video:  50 * 1024 * 1024, // 50 MB
  audio:  10 * 1024 * 1024, // 10 MB
};

/**
 * POST /api/v2/upload/criativo
 *
 * Modo 1 (signed URL): body JSON { contentType, size }
 *   → Retorna { signedUrl, path, token, kind, publicUrl } para upload direto ao Supabase.
 *
 * Modo 2 (proxy legado / fallback): FormData com campo `file`
 *   → Faz upload proxy e retorna { url, path, kind, tamanho_original }.
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const ct = request.headers.get('content-type') ?? '';

    // ─── Modo 1: Signed URL (JSON body) ───────────────────────────────────
    if (ct.includes('application/json')) {
      const { contentType, size } = await request.json();

      if (!contentType || !size) {
        return NextResponse.json({ error: 'contentType e size são obrigatórios' }, { status: 400 });
      }

      const mimeInfo = MIME_MAP[contentType];
      if (!mimeInfo) {
        return NextResponse.json(
          { error: `Tipo não suportado: ${contentType}. Use JPEG/PNG/WebP, MP4/WebM ou OGG/MP3/WAV.` },
          { status: 400 }
        );
      }

      const { kind, ext } = mimeInfo;

      if (size > MAX_BYTES[kind]) {
        const limitMB = MAX_BYTES[kind] / 1024 / 1024;
        return NextResponse.json(
          { error: `Arquivo excede ${limitMB}MB para ${kind === 'image' ? 'imagens' : kind === 'video' ? 'vídeos' : 'áudios'}.` },
          { status: 400 }
        );
      }

      const uuid8 = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const path = `campanhas/${profile.tenant_id}/${kind}/${Date.now()}_${uuid8}.${ext}`;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('criativos')
        .createSignedUploadUrl(path);

      if (signedError) {
        console.error('[UPLOAD_CRIATIVO_SIGNED_ERROR]', signedError);
        if (
          signedError.message?.includes('Bucket not found') ||
          signedError.message?.includes('bucket') ||
          signedError.message?.includes('The resource was not found')
        ) {
          return NextResponse.json(
            { error: 'Bucket "criativos" não encontrado. Execute a migration 018_storage_criativos.sql.' },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: signedError.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from('criativos').getPublicUrl(path);

      return NextResponse.json({
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path,
        kind,
        publicUrl: urlData.publicUrl,
      });
    }

    // ─── Modo 2: Proxy legado (FormData) ──────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });
    }

    const mimeInfo = MIME_MAP[file.type];
    if (!mimeInfo) {
      return NextResponse.json(
        { error: `Tipo não suportado: ${file.type}. Use JPEG/PNG/WebP, MP4/WebM ou OGG/MP3/WAV.` },
        { status: 400 }
      );
    }

    const { kind, ext } = mimeInfo;
    const tamanho_original = file.size;

    if (tamanho_original > MAX_BYTES[kind]) {
      const limitMB = MAX_BYTES[kind] / 1024 / 1024;
      return NextResponse.json(
        { error: `Arquivo excede ${limitMB}MB para ${kind === 'image' ? 'imagens' : kind === 'video' ? 'vídeos' : 'áudios'}.` },
        { status: 400 }
      );
    }

    const uuid8 = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const path = `campanhas/${profile.tenant_id}/${kind}/${Date.now()}_${uuid8}.${ext}`;

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
      if (
        uploadError.message?.includes('Bucket not found') ||
        uploadError.message?.includes('bucket') ||
        uploadError.message?.includes('The resource was not found')
      ) {
        return NextResponse.json(
          { error: 'Bucket de armazenamento "criativos" não encontrado. Execute a migration 018_storage_criativos.sql no Supabase.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('criativos').getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
      kind,
      tamanho_original,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[UPLOAD_CRIATIVO_UNEXPECTED]', message, err);
    return NextResponse.json({ error: message || 'Erro interno' }, { status: 500 });
  }
}
