import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantEvolutionConfig, deleteMessage } from '@/lib/services/evolution.service';

/**
 * DELETE /api/messages/:messageId/delete
 *
 * Apaga uma mensagem do WhatsApp (apenas mensagens enviadas por nós — from_me=true).
 * 1. Chama Evolution API para apagar no WhatsApp
 * 2. Marca como deleted=true no banco otimisticamente
 * O webhook messages.delete receberá o evento de volta como confirmação.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { clientId: messageId } = await params;

    if (!messageId) {
      return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Buscar a mensagem no banco para obter external_id e remote_jid
    const { data: msg } = await supabase
      .from('messages')
      .select('id, external_id, direction, conversation_id')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (msg.direction !== 'outbound') {
      return NextResponse.json({ error: 'Só é possível apagar mensagens enviadas por você' }, { status: 403 });
    }

    if (!msg.external_id) {
      return NextResponse.json({ error: 'Mensagem sem ID externo — não pode ser apagada via WhatsApp' }, { status: 422 });
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
    await deleteMessage(config, remoteJid, msg.external_id, true);

    // 4. Soft-delete otimístico no banco (webhook confirmará via messages.delete)
    await supabase
      .from('messages')
      .update({
        deleted: true,
        content: '',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[DELETE message]', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao apagar mensagem' },
      { status: 500 }
    );
  }
}
