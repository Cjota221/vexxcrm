import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/orders
 * Lista pedidos do tenant autenticado
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Criar cliente com o token do usuário para validação
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Cliente admin para queries
    const supabase = createServerSupabaseClient();

    // Buscar profile para pegar tenant_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const tenant_id = profile.tenant_id;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const client_id = searchParams.get('client_id');
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '50');

    // Query builder
    let query = supabase
      .from('orders')
      .select('*, clients(name, phone)', { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`order_number.ilike.%${search}%,external_id.ilike.%${search}%,metadata->>cliente_nome.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (client_id) {
      query = query.eq('client_id', client_id);
    }

    // Paginação
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar pedidos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (error: any) {
    console.error('❌ Erro no endpoint de pedidos:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
