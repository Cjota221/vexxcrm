import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/cron/pending-messages-timeout
 *
 * Marca como 'failed' mensagens outbound travadas em 'pending' há mais de 5
 * minutos — situação que ocorre quando o webhook de entrega da Evolution API
 * não chega (timeout, instância desconectada, falha de rede).
 *
 * Executado pelo Vercel Cron a cada 5 minutos (schedule: "* /5 * * * *" sem espaço).
 *
 * Auth: header x-cron-secret deve bater com CRON_SECRET env var.
 */

const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MS).toISOString();

  const { data: stuckMessages, error: fetchError } = await supabase
    .from('messages')
    .select('id, tenant_id, conversation_id, created_at')
    .eq('direction', 'outbound')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .limit(500);

  if (fetchError) {
    console.error('[cron/pending-timeout] Erro ao buscar mensagens:', fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!stuckMessages || stuckMessages.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ids = stuckMessages.map(m => m.id);

  const { error: updateError, count } = await supabase
    .from('messages')
    .update({ status: 'failed' })
    .in('id', ids);

  if (updateError) {
    console.error('[cron/pending-timeout] Erro ao atualizar status:', updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log(`[cron/pending-timeout] ${count ?? ids.length} mensagens marcadas como 'failed'.`);

  return NextResponse.json({
    updated: count ?? ids.length,
    cutoff,
  });
}
