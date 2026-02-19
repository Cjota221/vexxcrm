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

/**
 * GET /api/intelligence/historical-sales
 *
 * "Hoje na História" — clientes que compraram hoje (dia/mês) em anos anteriores.
 * Retorna lista agrupada por ano, com totais e clientes fiéis (compraram nesta data em 2+ anos).
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

    // Filtra no JS para dia e mês iguais ao de hoje
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

    return NextResponse.json({
      date: {
        day,
        month,
        label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
      },
      years,
      total_unique_clients: Object.keys(clientFrequency).length,
      total_historic_orders: todayOrders.length,
      loyal_clients: loyalClients,
    });
  } catch (err) {
    console.error('[historical-sales] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
