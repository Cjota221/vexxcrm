import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
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

    // Rate limiting: 120 req/min por tenant (mensagens são paginadas, limite mais alto)
    const rl = checkRateLimit(`${tenantId}:messages`, { limit: 120 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em breve.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
        }
      );
    }

    const supabase = createServerSupabaseClient();

    // Buscar parâmetros de paginação
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const before = searchParams.get('before');

    // 1. Buscar a conversa deste cliente (suporta múltiplas conversas — pega a mais recente)
    // NOTA: NÃO filtrar por channel — o campo pode ter sido atualizado para valores diferentes
    // de 'whatsapp' em algum webhook, e perderia a conversa completamente.
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const conversation = conversations?.[0] || null;

    console.log(`[Messages GET] clientId=${clientId} | tenant=${tenantId} | conv=${conversation?.id ?? 'NENHUMA'} | convErr=${convError?.message ?? 'ok'}`);

    if (!conversation) {
      // Sem conversa ainda — retornar array vazio (não é erro)
      return NextResponse.json({ data: [] });
    }

    // 2. Buscar mensagens da conversa
    // CRÍTICO: ORDER DESC + LIMIT para pegar as N mais RECENTES.
    // Se order fosse ASC, com +100 mensagens a nova mensagem (mais recente)
    // ficaria fora do limit e nunca apareceria no chat.
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
        created_at,
        deleted,
        deleted_at,
        edited,
        edited_at
      `)
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Cursor-based pagination (paginação para trás no histórico)
    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messagesDesc, error } = await query;

    // Inverter para exibição cronológica (mais antiga primeiro)
    const messages = messagesDesc ? [...messagesDesc].reverse() : [];

    if (error) {
      console.error('❌ Messages API error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log(`[Messages GET] conv=${conversation.id} → ${messages?.length ?? 0} mensagens retornadas | mais recente: ${messages?.[messages.length - 1]?.id ?? 'nenhum'}`);

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
      // Campos de edição/deleção (adicionados em migration 041)
      deleted: (msg as Record<string, unknown>).deleted as boolean | undefined,
      deleted_at: (msg as Record<string, unknown>).deleted_at as string | undefined,
      edited: (msg as Record<string, unknown>).edited as boolean | undefined,
      edited_at: (msg as Record<string, unknown>).edited_at as string | undefined,
      // Reactions
      reactions: reactionsMap.get(msg.id),
    }));

    // 3b. Buscar reactions para estas mensagens (batch — sem N+1)
    const messageIds = (messages || []).map(m => m.id);
    const reactionsMap = new Map<string, Array<{ emoji: string; phone: string }>>();

    if (messageIds.length > 0) {
      const { data: reactionRows } = await supabase
        .from('message_reactions')
        .select('message_id, reactor_phone, emoji')
        .eq('tenant_id', tenantId)
        .in('message_id', messageIds);

      for (const r of reactionRows || []) {
        const row = r as { message_id: string; reactor_phone: string; emoji: string };
        if (!reactionsMap.has(row.message_id)) reactionsMap.set(row.message_id, []);
        reactionsMap.get(row.message_id)!.push({ emoji: row.emoji, phone: row.reactor_phone });
      }
    }

    // 4. Retornar IMEDIATAMENTE — marcar como lido em background (fire-and-forget)
    // CRÍTICO: não usar await aqui.
    // O UPDATE em messages + conversations dispara evento Realtime UPDATE em 'conversations'.
    // Esse evento chegava no canal global, chamava debouncedInvalidateChats() → invalidava
    // ['chats'] → forçava refetch de useMessages (staleTime=0) → retornava 0 msgs
    // porque a query de conversa usava .eq('channel','whatsapp') (já corrigido acima).
    // Mesmo sem o bug do channel, o ciclo de refetch era desnecessário.
    const hasUnread = (messages || []).some(
      (m) => m.direction === 'inbound' && m.status !== 'read'
    );

    if (hasUnread) {
      // Fire-and-forget: não bloquear o response nem causar cascata de eventos
      Promise.all([
        supabase
          .from('messages')
          .update({ status: 'read' })
          .eq('tenant_id', tenantId)
          .eq('conversation_id', conversation.id)
          .eq('direction', 'inbound')
          .neq('status', 'read'),
        supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversation.id)
          .eq('tenant_id', tenantId),
      ]).catch(() => { /* silencioso — não é crítico */ });
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
