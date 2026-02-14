/**
 * API Intelligence — Seasonal Buyers
 *
 * GET /api/intelligence/seasonal/buyers?event=black_friday&page=1&limit=50
 * Retorna a lista de clientes que compraram em determinado evento sazonal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

// Mapeamento de eventos sazonais → períodos do ano
const SEASON_PERIODS: Record<string, { months: number[]; label: string }> = {
  carnaval: { months: [2, 3], label: 'Carnaval' },
  dia_mulher: { months: [3], label: 'Dia da Mulher' },
  pascoa: { months: [3, 4], label: 'Páscoa' },
  dia_maes: { months: [5], label: 'Dia das Mães' },
  dia_namorados: { months: [6], label: 'Dia dos Namorados' },
  dia_pais: { months: [8], label: 'Dia dos Pais' },
  dia_criancas: { months: [10], label: 'Dia das Crianças' },
  black_friday: { months: [11], label: 'Black Friday' },
  natal: { months: [12], label: 'Natal' },
  ano_novo: { months: [12, 1], label: 'Ano Novo' },
};

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const tenantId = profile.tenant_id;
    const { searchParams } = new URL(request.url);
    const eventSlug = searchParams.get('event');
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!eventSlug || !SEASON_PERIODS[eventSlug]) {
      return NextResponse.json({
        error: 'Parâmetro event é obrigatório. Valores válidos: ' + Object.keys(SEASON_PERIODS).join(', '),
      }, { status: 400 });
    }

    const season = SEASON_PERIODS[eventSlug];
    const offset = (page - 1) * limit;

    // Buscar pedidos do período sazonal com paginação
    // Precisamos buscar TODOS para agrupar por cliente, então fazemos em lotes
    const PAGE_SIZE = 1000;
    let allOrders: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('orders')
        .select('id, client_id, total, created_at, status, payment_status, metadata')
        .eq('tenant_id', tenantId)
        .not('client_id', 'is', null);

      // Filtrar por meses do evento no ano especificado
      const monthFilters: string[] = [];
      for (const month of season.months) {
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
        monthFilters.push(`and(created_at.gte.${startDate},created_at.lte.${endDate})`);
      }

      // Supabase OR filter para múltiplos meses
      if (season.months.length === 1) {
        const m = season.months[0];
        const startDate = new Date(year, m - 1, 1).toISOString();
        const endDate = new Date(year, m, 0, 23, 59, 59).toISOString();
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      } else {
        // Para múltiplos meses, pegar o range completo
        const minMonth = Math.min(...season.months);
        const maxMonth = Math.max(...season.months);
        // Se cruza ano (ex: dez-jan), ajustar
        if (maxMonth < minMonth) {
          // Caso ano_novo: dez do ano anterior + jan do ano atual
          const startDate = new Date(year - 1, 11, 1).toISOString(); // dez anterior
          const endDate = new Date(year, 0, 31, 23, 59, 59).toISOString(); // jan atual
          query = query.gte('created_at', startDate).lte('created_at', endDate);
        } else {
          const startDate = new Date(year, minMonth - 1, 1).toISOString();
          const endDate = new Date(year, maxMonth, 0, 23, 59, 59).toISOString();
          query = query.gte('created_at', startDate).lte('created_at', endDate);
        }
      }

      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: orders, error: qErr } = await query;
      if (qErr) {
        console.error('Erro ao buscar pedidos sazonais:', qErr);
        break;
      }

      allOrders = allOrders.concat(orders || []);
      hasMore = (orders || []).length === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    if (allOrders.length === 0) {
      return NextResponse.json({
        success: true,
        event: eventSlug,
        event_name: season.label,
        year,
        buyers: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
        summary: { total_buyers: 0, total_orders: 0, total_revenue: 0 },
      });
    }

    // Agrupar por client_id
    const buyerMap = new Map<string, {
      client_id: string;
      order_count: number;
      total_spent: number;
      last_order_at: string;
      items_count: number;
    }>();

    for (const order of allOrders) {
      const cid = order.client_id;
      if (!cid) continue;
      const existing = buyerMap.get(cid) || {
        client_id: cid,
        order_count: 0,
        total_spent: 0,
        last_order_at: order.created_at,
        items_count: 0,
      };
      existing.order_count++;
      existing.total_spent += parseFloat(order.total) || 0;
      if (order.created_at > existing.last_order_at) {
        existing.last_order_at = order.created_at;
      }
      // Contar itens do metadata
      const itens = order.metadata?.itens || order.metadata?.items || [];
      existing.items_count += Array.isArray(itens)
        ? itens.reduce((s: number, i: any) => s + (i.quantidade || i.qty || 1), 0)
        : 0;
      buyerMap.set(cid, existing);
    }

    // Ordenar por total gasto (desc) e paginar
    const allBuyers = Array.from(buyerMap.values())
      .sort((a, b) => b.total_spent - a.total_spent);

    const totalBuyers = allBuyers.length;
    const pagedBuyers = allBuyers.slice(offset, offset + limit);

    // Buscar dados dos clientes
    const clientIds = pagedBuyers.map(b => b.client_id);
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, name, phone, email, rfm_segment, rfm_score, flag_auto_vip, flag_churn_risk, total_orders, total_spent, avg_ticket, last_order_at')
      .eq('tenant_id', tenantId)
      .in('id', clientIds);

    const clientMap = new Map((clientsData || []).map(c => [c.id, c]));

    // Montar resultado
    const buyers = pagedBuyers.map(b => {
      const client = clientMap.get(b.client_id);
      return {
        client_id: b.client_id,
        name: client?.name || 'Desconhecido',
        phone: client?.phone || '',
        email: client?.email || '',
        rfm_segment: client?.rfm_segment || null,
        rfm_score: client?.rfm_score || null,
        is_vip: client?.flag_auto_vip || false,
        is_at_risk: client?.flag_churn_risk || false,
        // Dados do período sazonal
        seasonal_orders: b.order_count,
        seasonal_spent: b.total_spent,
        seasonal_items: b.items_count,
        seasonal_last_order: b.last_order_at,
        // Dados gerais do cliente
        total_orders: client?.total_orders || 0,
        total_spent: client?.total_spent || 0,
        avg_ticket: client?.avg_ticket || 0,
        last_order_at: client?.last_order_at || null,
      };
    });

    const totalRevenue = allBuyers.reduce((s, b) => s + b.total_spent, 0);

    return NextResponse.json({
      success: true,
      event: eventSlug,
      event_name: season.label,
      year,
      buyers,
      pagination: {
        page,
        limit,
        total: totalBuyers,
        total_pages: Math.ceil(totalBuyers / limit),
      },
      summary: {
        total_buyers: totalBuyers,
        total_orders: allOrders.length,
        total_revenue: totalRevenue,
      },
    });
  } catch (error) {
    console.error('Erro na API seasonal/buyers:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}
