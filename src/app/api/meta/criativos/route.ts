/**
 * GET /api/meta/criativos
 * Lista criativos do tenant para seleção no agente (modo avançado).
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

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('ad_creatives')
    .select('id, nome, tipo, meta_video_id, meta_image_hash, url_preview')
    .eq('tenant_id', tenantId)
    .eq('status', 'pronto')
    .or('meta_video_id.not.is.null,meta_image_hash.not.is.null')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ criativos: data ?? [] });
}
