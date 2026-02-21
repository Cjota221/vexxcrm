import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/clients
 * Lista clientes do tenant com filtros e paginação.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    // Rate limiting: 60 req/min por tenant
    const rl = checkRateLimit(`${tenantId}:clients`);
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

    // Parâmetros de busca
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const hasOrders = searchParams.get('has_orders'); // 'true' | 'false' | null
    const source = searchParams.get('source');
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
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (status && status !== '') {
      query = query.eq('status', status);
    }
    
    // Filtro de pedidos: total_orders > 0 ou = 0
    if (hasOrders === 'true') {
      query = query.gt('total_orders', 0);
    } else if (hasOrders === 'false') {
      query = query.or('total_orders.eq.0,total_orders.is.null');
    }

    // Filtro por origem
    if (source && source !== '') {
      query = query.eq('source', source);
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
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const body = await request.json();

    // Normalizar telefone
    const phone = PhoneNormalizer.canonical(body.phone);

    // Criar cliente
    const { data, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
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
