import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import crypto from 'crypto';

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB para imagens/docs
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB para vídeos

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * POST /api/upload
 * 
 * Upload de arquivo para Supabase Storage.
 * Retorna URL pública para enviar via Evolution API.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Normalizar MIME type — remover parâmetros como "; codecs=opus"
    const baseMime = file.type.split(';')[0].trim();
    const ext = ALLOWED_MIME[baseMime];
    if (!ext) {
      return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 });
    }

    // Limite diferente por tipo
    const isVideo = baseMime.startsWith('video/');
    const limit = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > limit) {
      const limitMB = limit / 1024 / 1024;
      return NextResponse.json({ error: `Arquivo muito grande. Máximo ${limitMB}MB para ${isVideo ? 'vídeos' : 'este tipo de arquivo'}.` }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const fileName = `${tenantId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await supabase.storage
      .from('media')
      .upload(fileName, buffer, {
        contentType: baseMime,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[upload] Storage error:', error);
      return NextResponse.json(
        { error: 'Erro no upload: ' + error.message },
        { status: 500 }
      );
    }

    // Gerar URL pública
    const { data: publicUrlData } = supabase.storage
      .from('media')
      .getPublicUrl(data.path);

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path: data.path,
      fileName: file.name,
      mimeType: baseMime,
      size: file.size,
    });
  } catch (err: unknown) {
    console.error('[upload] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro no upload' },
      { status: 500 }
    );
  }
}
