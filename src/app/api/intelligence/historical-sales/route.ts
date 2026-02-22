import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

interface OrderRow {
  id: string;
  order_number: string | null;
  total: number | null;
  status: string | null;
  created_at: string;
  client_id: string;
  clients: { id: string; name: string | null; phone: string | null; status: string | null } | Array<{ id: string; name: string | null; phone: string | null; status: string | null }> | null;
}

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * GET /api/intelligence/historical-sales
 *
 * "Hoje na História" — clientes que compraram hoje (dia/mês) em anos anteriores.
 * Também retorna o padrão do mesmo dia em meses anteriores (do ano atual e anterior).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth() + 1; // 1–12
    const day = now.getDate();

    // Busca pedidos em anos anteriores (all years < currentYear)
    const { data: rawOrders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total,
        status,
        created_at,
        client_id,
        clients!inner(
          id,
          name,
          phone,
          status
        )
      `)
      .eq('tenant_id', auth.tenantId)
      .lt('created_at', `${currentYear}-01-01T00:00:00.000Z`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[historical-sales] query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = (rawOrders ?? []) as OrderRow[];

    // Filtra no JS para dia e mês iguais ao de hoje (anos anteriores)
    const todayOrders = orders.filter((o: OrderRow) => {
      const d = new Date(o.created_at);
      return d.getMonth() + 1 === month && d.getDate() === day;
    });

    // Agrupa por ano
    const byYear: Record<
      number,
      {
        year: number;
        total_orders: number;
        total_revenue: number;
        clients: Array<{
          client_id: string;
          name: string;
          phone: string;
          status: string;
          order_number: string;
          total: number;
          created_at: string;
        }>;
      }
    > = {};

    for (const order of todayOrders) {
      const year = new Date(order.created_at).getFullYear();
      if (!byYear[year]) {
        byYear[year] = { year, total_orders: 0, total_revenue: 0, clients: [] };
      }
      byYear[year].total_orders += 1;
      byYear[year].total_revenue += order.total ?? 0;

      const client = Array.isArray(order.clients) ? order.clients[0] : order.clients;
      byYear[year].clients.push({
        client_id: order.client_id,
        name: client?.name ?? 'Desconhecido',
        phone: client?.phone ?? '',
        status: client?.status ?? 'ativo',
        order_number: order.order_number ?? String(order.id),
        total: order.total ?? 0,
        created_at: order.created_at,
      });
    }

    const years = Object.values(byYear).sort((a, b) => b.year - a.year);

    // Frequência de clientes por data (quantos anos distintos compraram nesta data)
    const clientFrequency: Record<string, number> = {};
    for (const yr of years) {
      for (const c of yr.clients) {
        clientFrequency[c.client_id] = (clientFrequency[c.client_id] ?? 0) + 1;
      }
    }

    // Clientes que compraram nesta data em 2+ anos distintos
    const loyalClients = Object.entries(clientFrequency)
      .filter(([, count]) => count >= 2)
      .map(([clientId, count]) => {
        const found = todayOrders.find((o: OrderRow) => o.client_id === clientId);
        const client = Array.isArray(found?.clients) ? found?.clients[0] : found?.clients;
        return {
          client_id: clientId,
          name: client?.name ?? 'Desconhecido',
          phone: client?.phone ?? '',
          years_count: count,
        };
      })
      .sort((a, b) => b.years_count - a.years_count)
      .slice(0, 10);

    // ── Mesmo dia em meses anteriores ──────────────────────────
    // Ex: hoje é dia 22 → mostra dia 22 de Jan/2025, Dez/2024, Nov/2024...
    const sameDayOtherMonths: Array<{
      year: number;
      month: number;
      month_name: string;
      orders: number;
      revenue: number;
      top_clients: Array<{ name: string; phone: string; total: number }>;
    }> = [];

    // Agrupa todos os pedidos (anos anteriores) com mesmo dia pelo mês+ano
    const sameDay = orders.filter((o: OrderRow) => new Date(o.created_at).getDate() === day);
    const byMonthYear: Record<string, { year: number; month: number; orders: number; revenue: number; clients: Array<{ name: string; phone: string; total: number }> }> = {};

    for (const order of sameDay) {
      const d = new Date(order.created_at);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      // Excluir o mesmo mês do ano atual (já coberto pelos "anos anteriores")
      const key = `${y}-${m}`;
      if (!byMonthYear[key]) {
        byMonthYear[key] = { year: y, month: m, orders: 0, revenue: 0, clients: [] };
      }
      byMonthYear[key].orders += 1;
      byMonthYear[key].revenue += order.total ?? 0;
      const client = Array.isArray(order.clients) ? order.clients[0] : order.clients;
      if (client?.name) {
        byMonthYear[key].clients.push({
          name: client.name,
          phone: client.phone ?? '',
          total: order.total ?? 0,
        });
      }
    }

    // Ordena: mais recente primeiro, exclui o mês+ano de hoje (que já está em "years")
    const sortedByMonthYear = Object.values(byMonthYear)
      .filter(e => !(e.month === month)) // remove o mesmo mês (independente do ano)
      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
      .slice(0, 12);

    for (const entry of sortedByMonthYear) {
      sameDayOtherMonths.push({
        year: entry.year,
        month: entry.month,
        month_name: MONTH_NAMES[entry.month],
        orders: entry.orders,
        revenue: Math.round(entry.revenue * 100) / 100,
        top_clients: entry.clients
          .sort((a, b) => b.total - a.total)
          .slice(0, 5),
      });
    }

    // ── Comparação: esse mês vs mês anterior (mesmo dia) ───────
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? currentYear - 1 : currentYear - 1; // sempre ano anterior
    const prevMonthData = byMonthYear[`${prevMonthYear}-${prevMonthNum}`];
    const sameMonthPrevYear = byMonthYear[`${currentYear - 1}-${month}`];

    const comparison = {
      today: { orders: todayOrders.length, revenue: todayOrders.reduce((s, o) => s + (o.total ?? 0), 0) },
      prev_month_same_day: prevMonthData
        ? { year: prevMonthYear, month: prevMonthNum, month_name: MONTH_NAMES[prevMonthNum], orders: prevMonthData.orders, revenue: Math.round(prevMonthData.revenue * 100) / 100 }
        : null,
      same_month_prev_year: sameMonthPrevYear
        ? { year: currentYear - 1, month, month_name: MONTH_NAMES[month], orders: sameMonthPrevYear.orders, revenue: Math.round(sameMonthPrevYear.revenue * 100) / 100 }
        : null,
    };

    return NextResponse.json({
      date: {
        day,
        month,
        month_name: MONTH_NAMES[month],
        label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
      },
      years,
      total_unique_clients: Object.keys(clientFrequency).length,
      total_historic_orders: todayOrders.length,
      loyal_clients: loyalClients,
      same_day_other_months: sameDayOtherMonths,
      comparison,
    });
  } catch (err) {
    console.error('[historical-sales] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
