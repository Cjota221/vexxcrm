import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantEvolutionConfig, sendReaction } from '@/lib/services/evolution.service';

/**
 * POST /api/messages/:messageId/react
 * Body: { emoji: string }
 *
 * Envia uma reaction a uma mensagem via WhatsApp.
 * Emoji vazio ("") remove a reaction existente.
 * O webhook messages.reaction receberá o evento de volta e persistirá no banco.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { clientId: messageId } = await params;
    const { emoji } = await request.json() as { emoji?: string };

    if (!messageId) {
      return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Buscar mensagem para obter external_id e fromMe
    const { data: msg } = await supabase
      .from('messages')
      .select('id, external_id, direction, conversation_id')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (!msg.external_id) {
      return NextResponse.json({ error: 'Mensagem sem ID externo' }, { status: 422 });
    }

    // 2. Buscar remote_jid da conversa
    const { data: conv } = await supabase
      .from('conversations')
      .select('remote_jid, client:clients!conversations_client_id_fkey(phone_normalized)')
      .eq('id', msg.conversation_id)
      .eq('tenant_id', tenantId)
      .single();

    const rawClient = conv?.client as { phone_normalized?: string } | null;
    const remoteJid = conv?.remote_jid ||
      (rawClient?.phone_normalized ? `${rawClient.phone_normalized}@s.whatsapp.net` : null);

    if (!remoteJid) {
      return NextResponse.json({ error: 'Não foi possível identificar o destinatário' }, { status: 422 });
    }

    // 3. Chamar Evolution API
    const config = getTenantEvolutionConfig(tenantId);
    await sendReaction(
      config,
      remoteJid,
      msg.external_id,
      msg.direction === 'outbound',
      emoji || ''
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[REACT message]', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao reagir à mensagem' },
      { status: 500 }
    );
  }
}
