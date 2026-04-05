/**
 * POST /api/meta/transcricao  — dispara transcrição via n8n (assíncrono)
 * GET  /api/meta/transcricao?id=xxx — consulta status
 *
 * O n8n processa em background e chama /api/meta/transcricao/callback quando termina.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? '';
const N8N_CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET ?? 'vexx-n8n-2026';

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

  if (!N8N_WEBHOOK_URL) {
    return NextResponse.json({ error: 'N8N_WEBHOOK_URL não configurada' }, { status: 500 });
  }

  const supabase = createServerSupabaseClient();

  const { data: criativo } = await supabase
    .from('ad_creatives')
    .select('nome, meta_video_id, tipo, transcricao_status')
    .eq('id', criativoId)
    .eq('tenant_id', tenantId)
    .single();

  if (!criativo) {
    return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 });
  }
  if (criativo.tipo !== 'video') {
    return NextResponse.json({ error: 'Não é um vídeo' }, { status: 400 });
  }
  if (!criativo.meta_video_id) {
    return NextResponse.json({ error: 'meta_video_id não disponível' }, { status: 400 });
  }
  // Não bloqueia re-tentativa — vídeos travados em 'processando' devem poder ser re-acionados

  // Marcar como processando
  await supabase
    .from('ad_creatives')
    .update({ transcricao_status: 'processando', transcricao_erro: null })
    .eq('id', criativoId)
    .eq('tenant_id', tenantId);

  // Buscar token Meta do tenant
  let tokenMeta: string;
  try {
    const tokenConfig = await resolverTokenMeta(tenantId);
    tokenMeta = tokenConfig.token;
  } catch (err) {
    await supabase
      .from('ad_creatives')
      .update({ transcricao_status: 'erro', transcricao_erro: String(err) })
      .eq('id', criativoId);
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const callbackUrl = `${appUrl}/api/meta/transcricao/callback`;

  // Fire-and-forget — não aguarda o n8n processar
  fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      criativoId,
      tenantId,
      meta_video_id: criativo.meta_video_id,
      nome: criativo.nome,
      meta_token: tokenMeta,
      groq_key: process.env.GROQ_API_KEY ?? '',
      anthropic_key: process.env.ANTHROPIC_API_KEY ?? '',
      callback_url: callbackUrl,
      callback_secret: N8N_CALLBACK_SECRET,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(err => {
    console.error('[Transcrição] Erro ao acionar n8n:', err);
    supabase
      .from('ad_creatives')
      .update({ transcricao_status: 'erro', transcricao_erro: `Falha ao acionar n8n: ${String(err)}` })
      .eq('id', criativoId)
      .then(() => {});
  });

  return NextResponse.json({
    ok: true,
    status: 'processando',
    mensagem: 'Transcrição iniciada — aguarde alguns segundos',
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
