/**
 * POST /api/meta/upload — recebe arquivo, faz upload para o Meta e salva no banco
 * GET  /api/meta/upload — lista criativos do tenant
 *
 * Limitado a 500MB pelo Netlify. Para vídeos maiores, usar upload resumível (futuro).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  uploadVideoParaMeta,
  uploadImagemParaMeta,
  salvarCriativoNoBanco,
} from '@/lib/services/meta-upload.service';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('tenant_id', tenantId)
    .neq('status', 'arquivado')
    .order('created_at', { ascending: false });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Envie como multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file') as File | null;
  const nome = (form.get('nome') as string | null) || file?.name || 'criativo';
  const duracaoStr = form.get('duracao') as string | null;

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });

  const isVideo  = file.type.startsWith('video/');
  const isImagem = file.type.startsWith('image/');

  if (!isVideo && !isImagem) {
    return NextResponse.json({ error: 'Tipo não suportado. Envie vídeo ou imagem.' }, { status: 400 });
  }

  try {
    // Upload para o Meta
    const uploadResult = isVideo
      ? await uploadVideoParaMeta(tenantId, file, nome)
      : await uploadImagemParaMeta(tenantId, file, nome);

    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error }, { status: 400 });
    }

    // Salvar no banco
    const id = await salvarCriativoNoBanco({
      tenantId,
      nome,
      tipo:            isVideo ? 'video' : 'imagem',
      metaVideoId:     isVideo  ? uploadResult.metaId : undefined,
      metaImageHash:   isImagem ? uploadResult.metaId : undefined,
      urlPreview:      uploadResult.thumbUrl,
      tamanhoBytes:    file.size,
      duracaoSegundos: duracaoStr ? parseInt(duracaoStr) : undefined,
    });

    // Disparar transcrição em background para vídeos
    if (isVideo && id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      fetch(`${appUrl}/api/meta/transcricao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ criativoId: id }),
      }).catch(err => console.error('[Upload] Erro ao disparar transcrição:', err));
    }

    return NextResponse.json({
      ok: true,
      id,
      metaId:   uploadResult.metaId,
      thumbUrl: uploadResult.thumbUrl,
    });
  } catch (err) {
    console.error('[Upload] Erro interno:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
