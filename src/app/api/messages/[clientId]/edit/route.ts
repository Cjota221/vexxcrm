import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantEvolutionConfig, editMessage } from '@/lib/services/evolution.service';

/**
 * PATCH /api/messages/:messageId/edit
 * Body: { content: string }
 *
 * Edita o texto de uma mensagem enviada por nós.
 * 1. Chama Evolution API para editar no WhatsApp
 * 2. Atualiza no banco otimisticamente
 * O webhook messages.update (editedMessage) confirmará a edição.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { clientId: messageId } = await params;
    const { content } = await request.json() as { content?: string };

    if (!messageId) {
      return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Conteúdo não pode ser vazio' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Buscar mensagem
    const { data: msg } = await supabase
      .from('messages')
      .select('id, external_id, direction, type, conversation_id')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (msg.direction !== 'outbound') {
      return NextResponse.json({ error: 'Só é possível editar mensagens enviadas por você' }, { status: 403 });
    }

    if (msg.type !== 'text') {
      return NextResponse.json({ error: 'Só é possível editar mensagens de texto' }, { status: 422 });
    }

    if (!msg.external_id) {
      return NextResponse.json({ error: 'Mensagem sem ID externo' }, { status: 422 });
    }

    // 2. Buscar remote_jid
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
    await editMessage(config, remoteJid, msg.external_id, content.trim());

    // 4. Atualizar banco otimisticamente
    await supabase
      .from('messages')
      .update({
        content: content.trim(),
        edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[EDIT message]', error);
    const isNotSupported = error?.message?.includes('não suportada');
    return NextResponse.json(
      { error: error?.message || 'Erro ao editar mensagem' },
      { status: isNotSupported ? 422 : 500 }
    );
  }
}
