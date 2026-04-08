/**
 * GET /api/meta/criativos
 * Lista criativos do tenant com classificação Jarvis para o agente.
 *
 * Query params:
 *   limit   — máx de criativos (default 50, máx 100)
 *   meses   — filtrar pelos últimos N meses (default 12, 0 = sem filtro)
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
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 100);
  const meses = Number(url.searchParams.get('meses') ?? '12');

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from('ad_creatives')
    .select('id, nome, tipo, meta_video_id, meta_image_hash, url_preview, classificacao, transcricao_status, created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['pronto', 'processando'])   // inclui criativos ainda sendo classificados
    .or('meta_video_id.not.is.null,meta_image_hash.not.is.null')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Filtrar por data (últimos N meses), exceto se meses=0
  if (meses > 0) {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);
    query = query.gte('created_at', desde.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ criativos: data ?? [], total: data?.length ?? 0 });
}
