import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

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

    // Rate limiting: 60 req/min por tenant
    const rl = checkRateLimit(`${tenantId}:chats`);
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
        remote_jid,
        contact_name,
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
      `, { count: 'planned' })
      .eq('tenant_id', tenantId)
      // Ordenar por last_message_at desc; conversas sem mensagem ficam por último
      .order('last_message_at', { ascending: false, nullsFirst: false })
      // Ordenação secundária por updated_at para desempate
      .order('updated_at', { ascending: false });

    // 4a. Busca server-side: pré-filtrar por client_id correspondente ao search
    // Evita a limitação de buscar apenas nos primeiros N resultados da página.
    if (search) {
      const s = `%${search}%`;
      const { data: matchingClients } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .or(`name.ilike.${s},phone.ilike.${s},phone_normalized.ilike.${s}`);

      const clientIds = (matchingClients || []).map((c: { id: string }) => c.id);

      if (clientIds.length > 0) {
        query = query.or(`client_id.in.(${clientIds.join(',')}),contact_name.ilike.${s}`);
      } else {
        // Nenhum cliente correspondeu — buscar apenas por contact_name (grupos)
        query = query.ilike('contact_name', s);
      }
    }

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
        // Mostrar todas as conversas EXCETO arquivadas.
        // Inclui explicitamente: open, waiting, resolved, etc.
        query = query.neq('status', 'archived');
        break;
    }

    // 5. Paginação cursor-based.
    // O cursor é o last_message_at do último item da página anterior.
    // Conversas com last_message_at = null usam updated_at como fallback.
    if (cursor) {
      // Busca itens mais antigos que o cursor (ou sem last_message_at)
      query = query.or(`last_message_at.lt.${cursor},last_message_at.is.null`);
    }

    // 6. Limitar resultados + 1 para detectar hasMore
    query = query.limit(limit + 1);

    const { data: conversations, error, count } = await query;

    if (error) {
      console.error('❌ Chats API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log de diagnóstico — tenant_id e total de registros antes de filtrar por search
    console.log(`[/api/chats] tenant=${tenantId} filter=${filter} raw_count=${count} rows=${conversations?.length ?? 0}`);

    // 7. Detectar se há mais páginas
    const hasMore = (conversations?.length || 0) > limit;
    const items = hasMore ? conversations?.slice(0, limit) : conversations;

    const filteredItems = items || [];

    // 9. Transformar no formato esperado pelo ChatList (interface Chat)
    const chats = filteredItems
      .filter((conv: Record<string, unknown>) => conv.client || conv.remote_jid) // Incluir grupos (sem client)
      .map((conv: Record<string, unknown>) => {
        const client = conv.client as Record<string, unknown> | null;
        const isGroup = !!(conv.remote_jid as string)?.includes('@g.us');

        // Para grupos: usar contact_name como nome; para individuais: nome do cliente
        let displayName: string;
        if (isGroup) {
          displayName = (conv.contact_name as string) || `Grupo ${String(conv.remote_jid || '').slice(-9)}`;
        } else {
          const rawName = (client?.name as string) || '';
          const phone = (client?.phone as string) || (client?.phone_normalized as string) || '';
          displayName = rawName.trim() !== '' ? rawName.trim() : phone || 'Desconhecido';
        }

        return {
          id: conv.id,
          is_group: isGroup,
          client: {
            id: (client?.id as string) || (conv.remote_jid as string) || '',
            name: displayName,
            phone: (client?.phone as string) || '',
            phone_normalized: (client?.phone_normalized as string) || '',
            email: (client?.email as string) || '',
            status: (client?.status as string) || 'active',
            tags: (client?.tags as string[]) || [],
            avatar_url: (client?.avatar_url as string) || null,
            ltv: (client?.ltv as number) || 0,
            ticket_medio: (client?.avg_ticket as number) || 0,
            total_pedidos: (client?.total_orders as number) || 0,
            ultima_compra: (client?.last_order_at as string) || null,
          },
          last_message: conv.last_message_text
            ? {
                id: conv.id,
                tenant_id: tenantId,
                client_id: (client?.id as string) || '',
                remote_jid: (conv.remote_jid as string) || '',
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
          _cursor: (conv.last_message_at as string) || (conv.updated_at as string) || (conv.created_at as string) || '',
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
