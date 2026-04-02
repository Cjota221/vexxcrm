import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import { META_BASE } from '@/lib/meta-config';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: criativo } = await supabase
    .from('ad_creatives')
    .select('meta_video_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!criativo?.meta_video_id) {
    return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  }

  try {
    const config = await resolverTokenMeta(tenantId);
    const res = await fetch(
      `${META_BASE}/${criativo.meta_video_id}?fields=source&access_token=${config.token}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { source?: string; error?: { message: string } };
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 });
    if (!data.source) return NextResponse.json({ error: 'URL não disponível ainda' }, { status: 404 });
    return NextResponse.json({ url: data.source });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  await supabase
    .from('ad_creatives')
    .update({ status: 'arquivado' })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ ok: true });
}
