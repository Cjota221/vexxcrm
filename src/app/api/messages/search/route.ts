import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/messages/search?q=texto&limit=20&before=cursor
 *
 * Busca full-text em mensagens do tenant.
 * Retorna mensagens com contexto da conversa (client_id, conversation_id).
 *
 * Requer migration 034 (coluna search_vector em messages).
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const { searchParams } = request.nextUrl;

    const q = searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Parâmetro q deve ter ao menos 2 caracteres' }, { status: 400 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const before = searchParams.get('before');

    const supabase = createServerSupabaseClient();

    // Montar query base com full-text search
    let query = supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        client_id,
        direction,
        content,
        type,
        created_at,
        clients (
          id,
          name,
          phone,
          avatar_url
        )
      `)
      .eq('tenant_id', profile.tenant_id)
      .textSearch('search_vector', q, { config: 'portuguese' })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback: se a coluna search_vector não existe (migration ainda não rodou),
      // usar ILIKE para não quebrar a busca
      if (error.message.includes('search_vector') || error.message.includes('column')) {
        const fallback = await supabase
          .from('messages')
          .select(`
            id, conversation_id, client_id, direction, content, type, created_at,
            clients ( id, name, phone, avatar_url )
          `)
          .eq('tenant_id', profile.tenant_id)
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(limit);

        return NextResponse.json({
          data: fallback.data ?? [],
          fallback: true,
          hint: 'Execute a migration 034 para ativar busca full-text otimizada.',
        });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], fallback: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
