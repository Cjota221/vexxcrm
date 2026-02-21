import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/clients/group
 *
 * Lista clientes de um grupo específico para o painel lateral.
 *
 * Query params:
 *   type:   'source' | 'state'
 *   value:  valor do grupo (ex: 'whatsapp', 'SP')
 *   search: busca opcional por nome/telefone
 *   page:   número da página (default 1)
 *   per_page: itens por página (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const type     = searchParams.get('type');    // 'source' | 'state'
    const value    = searchParams.get('value');   // valor do grupo
    const search   = searchParams.get('search');
    const page     = parseInt(searchParams.get('page') || '1');
    const perPage  = parseInt(searchParams.get('per_page') || '50');

    if (!type || !value) {
      return NextResponse.json({ error: 'Parâmetros type e value são obrigatórios' }, { status: 400 });
    }

    let query = supabase
      .from('clients')
      .select('id, name, phone, status, source, address_state, ltv, total_orders, last_order_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (type === 'source') {
      // '__all__' = sem filtro de source (todos os clientes)
      if (value !== '__all__') {
        query = query.eq('source', value);
      }
    } else if (type === 'state') {
      query = query.eq('address_state', value);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Client group error:', error);
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
    console.error('❌ Client group error:', error);
    return NextResponse.json({ error: 'Erro ao buscar clientes do grupo' }, { status: 500 });
  }
}
