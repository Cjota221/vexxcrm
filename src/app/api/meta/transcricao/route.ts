/**
 * POST /api/meta/transcricao  — dispara transcrição de um criativo
 * GET  /api/meta/transcricao?id=xxx — consulta status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processarCriativo } from '@/lib/services/meta-transcricao.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { criativoId } = await req.json() as { criativoId: string };
  if (!criativoId) return NextResponse.json({ error: 'criativoId obrigatório' }, { status: 400 });

  // Dispara em background — retorna imediatamente para não estourar timeout
  processarCriativo(criativoId, tenantId).catch(err =>
    console.error('[Transcrição] Erro:', err)
  );

  return NextResponse.json({ ok: true, status: 'processando' });
}

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const criativoId = req.nextUrl.searchParams.get('id');
  if (!criativoId) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ad_creatives')
    .select('transcricao, transcricao_status, classificacao, transcricao_erro')
    .eq('id', criativoId)
    .eq('tenant_id', tenantId)
    .single();

  return NextResponse.json(data ?? { transcricao_status: 'nao_encontrado' });
}
