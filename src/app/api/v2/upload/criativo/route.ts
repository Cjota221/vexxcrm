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
 * Recebe FormData com campo `file` (imagem/vídeo/áudio já otimizado pelo client).
 * Armazena no bucket `criativos` e retorna URL pública + kind (image|video|audio).
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

    // Validar MIME
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

    // Path único por tenant / tipo
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
    console.error('[UPLOAD_CRIATIVO_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
