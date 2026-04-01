/**
 * Upload de criativos (vídeos e imagens) para o Meta Ads via API.
 *
 * Vídeos: POST /{ad-account-id}/advideos (multipart/form-data)
 * Imagens: POST /{ad-account-id}/adimages (multipart/form-data)
 *
 * O Meta retorna um ID (video_id ou image_hash) que é usado
 * para criar criativos de anúncio nas etapas seguintes.
 */

import { META_BASE } from '@/lib/meta-config';
import { resolverTokenMeta } from './meta-token.service';
import { createServerSupabaseClient } from '@/lib/supabase';

export interface UploadResult {
  ok: boolean;
  metaId?: string;      // video_id ou image_hash
  thumbUrl?: string;    // thumbnail gerado pelo Meta (vídeos)
  error?: string;
}

/* ─── Upload de vídeo ────────────────────────────────────────────────────── */

export async function uploadVideoParaMeta(
  tenantId: string,
  file: File | Blob,
  nome: string,
): Promise<UploadResult> {
  const config = await resolverTokenMeta(tenantId);
  if (!config) return { ok: false, error: 'Token Meta não configurado' };

  const actId = config.adAccountId.startsWith('act_')
    ? config.adAccountId
    : `act_${config.adAccountId}`;

  const form = new FormData();
  form.append('source', file, nome);
  form.append('title', nome);
  form.append('access_token', config.accessToken);

  const res = await fetch(`${META_BASE}/${actId}/advideos`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000), // vídeos podem demorar
  });

  const data = await res.json() as {
    id?: string;
    error?: { message: string };
  };

  if (!res.ok || data.error) {
    return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  }

  // Buscar thumbnail gerado pelo Meta (is_preferred tem prioridade)
  let thumbUrl: string | undefined;
  if (data.id) {
    try {
      const thumbRes = await fetch(
        `${META_BASE}/${data.id}?fields=thumbnails&access_token=${config.accessToken}`
      );
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json() as {
          thumbnails?: { data: Array<{ uri: string; is_preferred?: boolean }> };
        };
        const preferida = thumbData.thumbnails?.data?.find(t => t.is_preferred);
        thumbUrl = preferida?.uri ?? thumbData.thumbnails?.data?.[0]?.uri;
      }
    } catch { /* thumbnail é opcional */ }
  }

  return { ok: true, metaId: data.id, thumbUrl };
}

/* ─── Upload de imagem ───────────────────────────────────────────────────── */

export async function uploadImagemParaMeta(
  tenantId: string,
  file: File | Blob,
  nome: string,
): Promise<UploadResult> {
  const config = await resolverTokenMeta(tenantId);
  if (!config) return { ok: false, error: 'Token Meta não configurado' };

  const actId = config.adAccountId.startsWith('act_')
    ? config.adAccountId
    : `act_${config.adAccountId}`;

  const form = new FormData();
  form.append('filename', file, nome);
  form.append('access_token', config.accessToken);

  const res = await fetch(`${META_BASE}/${actId}/adimages`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json() as {
    images?: Record<string, { hash: string; url: string }>;
    error?: { message: string };
  };

  if (!res.ok || data.error) {
    return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  }

  const imageData = data.images ? Object.values(data.images)[0] : undefined;
  return {
    ok: true,
    metaId: imageData?.hash,
    thumbUrl: imageData?.url,
  };
}

/* ─── Salvar criativo no banco após upload ───────────────────────────────── */

export async function salvarCriativoNoBanco(params: {
  tenantId: string;
  nome: string;
  tipo: 'video' | 'imagem';
  metaVideoId?: string;
  metaImageHash?: string;
  urlPreview?: string;
  tamanhoBytes?: number;
  duracaoSegundos?: number;
}): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('ad_creatives')
    .insert({
      tenant_id:        params.tenantId,
      nome:             params.nome,
      tipo:             params.tipo,
      meta_video_id:    params.metaVideoId ?? null,
      meta_image_hash:  params.metaImageHash ?? null,
      url_preview:      params.urlPreview ?? null,
      tamanho_bytes:    params.tamanhoBytes ?? null,
      duracao_segundos: params.duracaoSegundos ?? null,
      status:           'pronto',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data!.id as string;
}
