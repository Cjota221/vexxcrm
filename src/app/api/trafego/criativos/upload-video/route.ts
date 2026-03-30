import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

const FORMATOS_ACEITOS = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
const TAMANHO_MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

/**
 * POST /api/trafego/criativos/upload-video
 * Recebe um vídeo via FormData, envia para o Meta Ads e salva em ad_creatives.
 *
 * O progresso do upload não pode ser reportado em tempo real via route handler padrão
 * do Next.js — o frontend usa XMLHttpRequest com onprogress para isso.
 * Esta rota retorna o resultado final após o upload.
 *
 * Body (multipart/form-data):
 *   - file: arquivo de vídeo (mp4, mov, avi)
 *   - titulo: nome do vídeo (opcional)
 *
 * Retorna:
 *   { ok: true, criativo_id: UUID, meta_video_id: string, url_preview: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);

    // Parsear multipart
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Formato inválido — envie como multipart/form-data' }, { status: 400 });
    }

    const file  = formData.get('file') as File | null;
    const titulo = (formData.get('titulo') as string | null) || file?.name || 'Vídeo sem nome';

    if (!file) {
      return NextResponse.json({ error: 'Campo "file" obrigatório' }, { status: 400 });
    }

    // Validar tipo
    if (!FORMATOS_ACEITOS.includes(file.type) && !file.name.match(/\.(mp4|mov|avi)$/i)) {
      return NextResponse.json({
        error: `Formato não suportado: ${file.type || file.name}. Use MP4, MOV ou AVI.`,
      }, { status: 422 });
    }

    // Validar tamanho
    if (file.size > TAMANHO_MAX_BYTES) {
      return NextResponse.json({
        error: `Arquivo muito grande: ${(file.size / 1024 / 1024 / 1024).toFixed(1)} GB. Máximo: 4 GB.`,
      }, { status: 422 });
    }

    const supabase = createServerSupabaseClient();

    // Buscar credenciais Meta
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 });
    }

    const token     = config.meta_access_token;
    const accountId = config.meta_ad_account_id;

    // Montar FormData para o Meta
    const metaForm = new FormData();
    metaForm.append('access_token', token);
    metaForm.append('title', titulo);
    metaForm.append('source', file, file.name);

    // Enviar para o Meta
    const uploadRes = await fetch(
      `${META_BASE}/${accountId}/advideos`,
      { method: 'POST', body: metaForm }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
      const msg = err.error?.message || `Meta API retornou ${uploadRes.status}`;
      return NextResponse.json({ error: `Erro ao enviar vídeo para o Meta: ${msg}` }, { status: 502 });
    }

    const uploadData = await uploadRes.json() as { id?: string; error?: { message?: string } };

    if (!uploadData.id) {
      return NextResponse.json({ error: 'Meta não retornou ID do vídeo' }, { status: 502 });
    }

    const metaVideoId = uploadData.id;

    // Buscar thumbnail do vídeo no Meta
    let urlPreview = '';
    try {
      const thumbRes = await fetch(
        `${META_BASE}/${metaVideoId}?fields=thumbnails&access_token=${token}`
      );
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json() as {
          thumbnails?: { data: Array<{ uri: string; is_preferred: boolean }> };
        };
        const preferida = thumbData.thumbnails?.data?.find(t => t.is_preferred);
        urlPreview = preferida?.uri || thumbData.thumbnails?.data?.[0]?.uri || '';
      }
    } catch { /* thumbnail é opcional */ }

    // Salvar em ad_creatives
    const { data: criativo, error: dbErr } = await supabase
      .from('ad_creatives')
      .insert({
        tenant_id: profile.tenant_id,
        nome: titulo,
        tipo: 'video',
        meta_video_id: metaVideoId,
        url_preview: urlPreview,
        tamanho_bytes: file.size,
        status: 'pronto',
      })
      .select('id')
      .single();

    if (dbErr) {
      // Não é crítico — vídeo já foi enviado ao Meta com sucesso
      console.error('[upload-video] Erro ao salvar no banco:', dbErr);
    }

    return NextResponse.json({
      ok: true,
      criativo_id: criativo?.id ?? null,
      meta_video_id: metaVideoId,
      url_preview: urlPreview,
      nome: titulo,
      tamanho_bytes: file.size,
      mensagem: 'Vídeo enviado com sucesso. Disponível para usar em anúncios.',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
