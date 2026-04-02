import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/reativacao/leads
 * Retorna clientes sem nenhum pedido (leads não convertidos).
 * Filtra por total_pedidos = 0 (campo mantido pela sync da FacilZap).
 *
 * Query params:
 *  - page: número da página (default 1)
 *  - per_page: itens por página (default 50, máx 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    const rl = checkRateLimit(`${tenantId}:reativacao-leads`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em breve.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')));
    const offset = (page - 1) * perPage;

    // Clientes com zero pedidos
    const { data, error, count } = await supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('total_orders', 0)
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      console.error('[reativacao/leads] Erro ao buscar leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Total geral de clientes do tenant (para calcular % de leads)
    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      total_clients: totalClients ?? 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count ?? 0) / perPage),
    });
  } catch (err) {
    console.error('[reativacao/leads] Erro inesperado:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
