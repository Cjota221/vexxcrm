import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/products
 * Lista produtos do tenant com paginação.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabase = createServerSupabaseClient();

    // Verificar token e obter tenant_id
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

    // Parâmetros de busca
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '50');

    // Query builder
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    // Filtro de busca
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Paginação
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Products API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (error) {
    console.error('❌ Products API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar produtos' }, { status: 500 });
  }
}
