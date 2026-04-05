/**
 * GET /api/meta/transcricao/status-por-meta?meta_video_id=xxx
 * Retorna status de transcrição de um criativo pelo meta_video_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const metaVideoId = req.nextUrl.searchParams.get('meta_video_id');
  if (!metaVideoId) return NextResponse.json({ error: 'meta_video_id obrigatório' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ad_creatives')
    .select('transcricao_status, classificacao')
    .eq('tenant_id', tenantId)
    .eq('meta_video_id', metaVideoId)
    .single();

  return NextResponse.json(data ?? { transcricao_status: null });
}
