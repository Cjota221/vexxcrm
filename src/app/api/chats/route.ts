import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/chats
 *
 * Lista conversas (chats) do tenant com filtros e paginação.
 * Retorna conversations + client info + última mensagem.
 *
 * Query params:
 *   - filter: 'all' | 'unread' | 'waiting' | 'mine' | 'archived'
 *   - cursor: ISO timestamp para paginação (last_message_at do último item)
 *   - limit: quantidade por página (default: 25, max: 100)
 *   - search: busca por nome/telefone do cliente
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticação via helper (usa x-tenant-id/x-user-id do middleware)
    const { tenantId, userId } = await getTenantFromRequest(request);

    const supabase = createServerSupabaseClient();

    // 2. Parâmetros de paginação e filtro
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const cursor = searchParams.get('cursor'); // ISO timestamp
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const search = searchParams.get('search')?.trim();

    // 3. Query conversations com join em clients
    let query = supabase
      .from('conversations')
      .select(`
        id,
        status,
        channel,
        assigned_to,
        last_message_text,
        last_message_at,
        last_message_type,
        unread_count,
        message_count,
        is_pinned,
        is_muted,
        created_at,
        updated_at,
        client:clients!conversations_client_id_fkey (
          id,
          name,
          phone,
          phone_normalized,
          email,
          status,
          tags,
          avatar_url,
          ltv,
          avg_ticket,
          total_orders,
          last_order_at
        )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    // 4. Aplicar filtros
    switch (filter) {
      case 'unread':
        query = query.gt('unread_count', 0);
        break;
      case 'waiting':
        query = query.eq('status', 'waiting');
        break;
      case 'mine':
        query = query.eq('assigned_to', userId);
        break;
      case 'archived':
        query = query.eq('status', 'archived');
        break;
      case 'all':
      default:
        // Excluir arquivados por padrão
        query = query.neq('status', 'archived');
        break;
    }

    // 5. Paginação cursor-based (performance para milhares de registros)
    if (cursor) {
      query = query.lt('last_message_at', cursor);
    }

    // 6. Limitar resultados + 1 para detectar hasMore
    query = query.limit(limit + 1);

    const { data: conversations, error, count } = await query;

    if (error) {
      console.error('❌ Chats API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 7. Detectar se há mais páginas
    const hasMore = (conversations?.length || 0) > limit;
    const items = hasMore ? conversations?.slice(0, limit) : conversations;

    // 8. Filtrar por busca se especificado (client-side search for now)
    let filteredItems = items || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredItems = filteredItems.filter((conv: Record<string, unknown>) => {
        const client = conv.client as Record<string, unknown> | null;
        if (!client) return false;
        const name = ((client.name as string) || '').toLowerCase();
        const phone = ((client.phone as string) || '').toLowerCase();
        return name.includes(searchLower) || phone.includes(searchLower);
      });
    }

    // 9. Transformar no formato esperado pelo ChatList (interface Chat)
    const chats = filteredItems
      .filter((conv: Record<string, unknown>) => conv.client) // Ignorar conversas sem cliente
      .map((conv: Record<string, unknown>) => {
        const client = conv.client as Record<string, unknown>;
        
        // Determinar nome real: priorizar nome do cliente vinculado a pedidos, depois pushName
        const displayName = client.name && client.name !== 'Desconhecido' && client.name !== phoneToDisplay(client.phone as string)
          ? client.name
          : client.name || 'Desconhecido';
        
        return {
          id: conv.id,
          client: {
            id: client.id,
            name: displayName as string,
            phone: client.phone || '',
            phone_normalized: client.phone_normalized || '',
            email: client.email || '',
            status: client.status || 'active',
            tags: client.tags || [],
            avatar_url: client.avatar_url || null,
            ltv: client.ltv || 0,
            ticket_medio: client.avg_ticket || 0,
            total_pedidos: client.total_orders || 0,
            ultima_compra: client.last_order_at || null,
          },
          last_message: conv.last_message_text
            ? {
                id: conv.id, // placeholder
                tenant_id: tenantId,
                client_id: (client.id as string) || '',
                remote_jid: '',
                message_id: '',
                from_me: false,
                content: conv.last_message_text as string,
                type: (conv.last_message_type as string) || 'text',
                timestamp: (conv.last_message_at as string) || '',
                status: 'read' as const,
                created_at: (conv.last_message_at as string) || '',
              }
            : undefined,
          unread_count: (conv.unread_count as number) || 0,
          is_pinned: (conv.is_pinned as boolean) || false,
          is_archived: conv.status === 'archived',
          is_muted: (conv.is_muted as boolean) || false,
          assigned_to: (conv.assigned_to as string) || undefined,
          updated_at: (conv.updated_at as string) || (conv.created_at as string) || '',
          // Campo usado para cursor de paginação
          _cursor: (conv.last_message_at as string) || (conv.updated_at as string) || '',
        };
      });

    // 10. Calcular nextCursor usando last_message_at (campo usado na query .lt())
    const lastItem = chats[chats.length - 1];
    const nextCursor = hasMore && lastItem?._cursor ? lastItem._cursor : null;

    return NextResponse.json({
      data: chats,
      pagination: {
        total: count || 0,
        limit,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error('❌ Chats API error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * Formata telefone para exibição
 */
function phoneToDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}
