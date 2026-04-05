/**
 * POST /api/meta/transcricao/callback
 * Recebe o resultado da transcrição processada pelo n8n.
 * Valida o secret, atualiza o banco e notifica via Supabase Realtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const N8N_CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET ?? 'vexx-n8n-2026';

interface CallbackPayload {
  ok: boolean;
  criativoId: string;
  transcricao?: string;
  classificacao?: Record<string, unknown>;
  erro?: string;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-n8n-secret');
  if (secret !== N8N_CALLBACK_SECRET) {
    console.warn('[Callback] Secret inválido:', secret);
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await req.json() as CallbackPayload;
  const { ok, criativoId, transcricao, classificacao, erro } = body;

  if (!criativoId) {
    return NextResponse.json({ error: 'criativoId obrigatório' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (ok && transcricao && transcricao.length >= 10) {
    await supabase
      .from('ad_creatives')
      .update({
        transcricao,
        transcricao_status:   'concluida',
        transcricao_modelo:   'whisper-large-v3',
        classificacao:        classificacao ?? null,
        classificacao_modelo: classificacao ? 'claude-haiku-4-5' : null,
        transcricao_erro:     null,
      })
      .eq('id', criativoId);

    console.log(`[Callback] ✅ Transcrição concluída para criativo ${criativoId}`);
  } else {
    const erroMsg = erro ?? 'Transcrição falhou ou áudio sem fala';
    await supabase
      .from('ad_creatives')
      .update({
        transcricao_status:   'erro',
        transcricao_erro:     erroMsg,
        transcricao_modelo:   'whisper-large-v3',
      })
      .eq('id', criativoId);

    console.warn(`[Callback] ❌ Erro na transcrição ${criativoId}: ${erroMsg}`);
  }

  return NextResponse.json({ ok: true });
}
