/**
 * POST /api/meta/transcricao  — dispara transcrição de um criativo
 * GET  /api/meta/transcricao?id=xxx — consulta status
 *
 * IMPORTANTE: roda de forma síncrona (não em background) para garantir
 * que o resultado seja persistido antes de a função serverless encerrar.
 * maxDuration = 120s para suportar o pipeline completo (download + Groq + GPT).
 */
export const maxDuration = 120;

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

  // Roda síncrono — a função aguarda o resultado antes de retornar.
  // Sem isso, a Netlify mata o processo assim que o response é enviado.
  const resultado = await processarCriativo(criativoId, tenantId);

  return NextResponse.json({
    ok: resultado.ok,
    status: resultado.ok ? 'concluida' : 'erro',
    erro: resultado.erro,
  });
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
