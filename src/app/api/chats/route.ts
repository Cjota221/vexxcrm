import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/chats
 *
 * Lista conversas (chats) do tenant com filtros.
 * Retorna conversations + client info + última mensagem.
 *
 * Query params:
 *   - filter: 'all' | 'unread' | 'waiting' | 'mine' | 'archived'
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticação
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const tenantId = profile.tenant_id;

    // 2. Parâmetros
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

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
          ticket_medio,
          total_pedidos,
          ultima_compra
        )
      `)
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
        query = query.eq('assigned_to', user.id);
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

    // Limitar a 100 conversas mais recentes
    query = query.limit(100);

    const { data: conversations, error } = await query;

    if (error) {
      console.error('❌ Chats API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Transformar no formato esperado pelo ChatList (interface Chat)
    const chats = (conversations || [])
      .filter((conv: Record<string, unknown>) => conv.client) // Ignorar conversas sem cliente
      .map((conv: Record<string, unknown>) => {
        const client = conv.client as Record<string, unknown>;
        return {
          id: conv.id,
          client: {
            id: client.id,
            name: client.name || 'Desconhecido',
            phone: client.phone || '',
            phone_normalized: client.phone_normalized || '',
            email: client.email || '',
            status: client.status || 'active',
            tags: client.tags || [],
            avatar_url: client.avatar_url || null,
            ltv: client.ltv || 0,
            ticket_medio: client.ticket_medio || 0,
            total_pedidos: client.total_pedidos || 0,
            ultima_compra: client.ultima_compra || null,
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
        };
      });

    return NextResponse.json({ data: chats });
  } catch (error) {
    console.error('❌ Chats API error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
