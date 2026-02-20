import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/types';

/**
 * GET /api/messages/[clientId]
 *
 * Retorna mensagens de uma conversa com um cliente específico.
 * Traduz o schema SQL (direction, external_id) → tipo Message do TS (from_me, message_id).
 *
 * Query params:
 *   - limit: número máximo de mensagens (default: 100)
 *   - before: cursor para paginação (ISO date)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const { clientId } = await params;

    if (!clientId) {
      return NextResponse.json(
        { error: 'clientId é obrigatório' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Buscar parâmetros de paginação
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const before = searchParams.get('before');

    // 1. Buscar a conversa deste cliente (suporta múltiplas conversas — pega a mais recente)
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('channel', 'whatsapp')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const conversation = conversations?.[0] || null;

    console.log(`[Messages GET] clientId=${clientId} | tenant=${tenantId} | conv=${conversation?.id ?? 'NENHUMA'} | convErr=${convError?.message ?? 'ok'}`);

    if (!conversation) {
      // Sem conversa ainda — retornar array vazio (não é erro)
      return NextResponse.json({ data: [] });
    }

    // 2. Buscar mensagens da conversa
    let query = supabase
      .from('messages')
      .select(`
        id,
        tenant_id,
        conversation_id,
        client_id,
        type,
        content,
        media_url,
        media_mime_type,
        media_filename,
        media_size,
        direction,
        sender_name,
        sender_phone,
        status,
        external_id,
        reply_to_id,
        metadata,
        is_from_bot,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(limit);

    // Cursor-based pagination
    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('❌ Messages API error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log(`[Messages GET] conv=${conversation.id} → ${messages?.length ?? 0} mensagens retornadas | último: ${messages?.[messages.length - 1]?.id ?? 'nenhum'}`);

    // 3. Traduzir para o formato Message do TypeScript
    // O front-end espera: from_me, message_id, remote_jid, timestamp
    // O banco salva: direction, external_id, sender_phone, created_at
    const translatedMessages: Message[] = (messages || []).map((msg) => ({
      id: msg.id,
      tenant_id: msg.tenant_id,
      client_id: msg.client_id || clientId,
      remote_jid: msg.sender_phone
        ? `${msg.sender_phone}@s.whatsapp.net`
        : '',
      message_id: msg.external_id || msg.id,
      from_me: msg.direction === 'outbound',
      content: msg.content || '',
      type: msg.type as Message['type'],
      media_url: msg.media_url || undefined,
      media_type: msg.media_mime_type || undefined,
      media_size: msg.media_size || undefined,
      timestamp: msg.created_at,
      status: msg.status as Message['status'],
      metadata: msg.metadata || {},
      created_at: msg.created_at,
    }));

    // 4. Marcar mensagens inbound como lidas (zerar unread_count)
    const hasUnread = (messages || []).some(
      (m) => m.direction === 'inbound' && m.status !== 'read'
    );

    if (hasUnread) {
      // Atualizar status das mensagens inbound para 'read'
      await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversation.id)
        .eq('direction', 'inbound')
        .neq('status', 'read');

      // Zerar unread_count na conversa
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversation.id)
        .eq('tenant_id', tenantId);
    }

    return NextResponse.json({ data: translatedMessages });
  } catch (error: any) {
    console.error('❌ Messages API error:', error);

    if (error.message?.includes('Não autorizado') || error.message?.includes('Token')) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
