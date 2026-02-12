import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * GET /api/clients
 * Lista clientes do tenant com filtros e paginação.
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
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '20');

    // Query builder
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    // Filtros
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (status && status !== '') {
      query = query.eq('status', status);
    }

    // Paginação
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Clients API error:', error);
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
    console.error('❌ Clients API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar clientes' }, { status: 500 });
  }
}

/**
 * POST /api/clients
 * Cria novo cliente.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // Normalizar telefone
    const phone = PhoneNormalizer.canonical(body.phone);

    // Criar cliente
    const { data, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: profile.tenant_id,
        full_name: body.full_name,
        phone,
        email: body.email || null,
        status: body.status || 'novo',
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Create client error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('❌ Create client error:', error);
    return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 });
  }
}
