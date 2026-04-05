/**
 * GET /api/meta/criativo-url?id=<criativo_id>
 * Retorna a URL de visualização do vídeo direto do Meta API.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';

const META_BASE = 'https://graph.facebook.com/v21.0';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data: criativo } = await supabase
    .from('ad_creatives')
    .select('meta_video_id, tipo')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!criativo?.meta_video_id) {
    return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  }

  try {
    const tokenConfig = await resolverTokenMeta(tenantId);
    const res = await fetch(
      `${META_BASE}/${criativo.meta_video_id}?fields=source,thumbnails&access_token=${tokenConfig.token}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await res.json() as { source?: string; thumbnails?: { data: Array<{ uri: string; is_preferred?: boolean }> }; error?: { message: string } };

    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 });

    const thumb = data.thumbnails?.data?.find(t => t.is_preferred)?.uri ?? data.thumbnails?.data?.[0]?.uri;

    return NextResponse.json({ url: data.source ?? null, thumb: thumb ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
