import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/monthly-trends
 *
 * Analisa o comportamento de compra mês a mês em todos os anos anteriores.
 * Retorna:
 *  - monthly_summary: pedidos e receita por mês (1-12), agregando todos os anos
 *  - yearly_monthly: breakdown por ano × mês (para comparação ano a ano)
 *  - best_months: ranking dos meses mais fortes
 *  - insights: observações automáticas (picos, quedas, meses consistentes)
 *  - day_of_month_pattern: nesta mesma data (dia) em meses anteriores
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // Busca TODOS os pedidos de anos anteriores (status relevantes)
    const { data: rawOrders, error } = await supabase
      .from('orders')
      .select('id, total, created_at, status')
      .eq('tenant_id', auth.tenantId)
      .lt('created_at', `${currentYear}-01-01T00:00:00.000Z`)
      .in('status', ['paid', 'delivered', 'processing', 'shipped', 'completed', 'pago', 'entregue', 'processando', 'enviado', 'concluido', 'concluído'])
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = rawOrders ?? [];

    // ── 1. Agrupa por ano e mês ─────────────────────────────────
    // yearMonth[year][month] = { orders, revenue }
    const yearMonth: Record<number, Record<number, { orders: number; revenue: number }>> = {};
    const years = new Set<number>();

    for (const order of orders) {
      const d = new Date(order.created_at);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      years.add(y);
      if (!yearMonth[y]) yearMonth[y] = {};
      if (!yearMonth[y][m]) yearMonth[y][m] = { orders: 0, revenue: 0 };
      yearMonth[y][m].orders += 1;
      yearMonth[y][m].revenue += order.total ?? 0;
    }

    const sortedYears = Array.from(years).sort((a, b) => b - a); // mais recente primeiro

    // ── 2. Resumo consolidado por mês (soma de todos os anos) ───
    const MONTH_NAMES = [
      '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ];

    const monthlySummary = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      let totalOrders = 0;
      let totalRevenue = 0;
      let yearsPresent = 0;
      for (const y of sortedYears) {
        const d = yearMonth[y]?.[month];
        if (d && d.orders > 0) {
          totalOrders += d.orders;
          totalRevenue += d.revenue;
          yearsPresent += 1;
        }
      }
      return {
        month,
        month_name: MONTH_NAMES[month],
        total_orders: totalOrders,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        avg_orders_per_year: yearsPresent > 0 ? Math.round((totalOrders / yearsPresent) * 10) / 10 : 0,
        avg_revenue_per_year: yearsPresent > 0 ? Math.round((totalRevenue / yearsPresent) * 100) / 100 : 0,
        years_with_data: yearsPresent,
      };
    });

    // ── 3. Breakdown por ano × mês (para gráfico comparativo) ──
    const yearlyMonthly = sortedYears.map(year => ({
      year,
      months: Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const d = yearMonth[year]?.[month] ?? { orders: 0, revenue: 0 };
        return {
          month,
          month_name: MONTH_NAMES[month],
          orders: d.orders,
          revenue: Math.round(d.revenue * 100) / 100,
        };
      }),
      total_orders: Object.values(yearMonth[year] ?? {}).reduce((s, v) => s + v.orders, 0),
      total_revenue: Math.round(Object.values(yearMonth[year] ?? {}).reduce((s, v) => s + v.revenue, 0) * 100) / 100,
    }));

    // ── 4. Ranking dos meses mais fortes ───────────────────────
    const bestMonths = [...monthlySummary]
      .filter(m => m.total_orders > 0)
      .sort((a, b) => b.avg_orders_per_year - a.avg_orders_per_year)
      .map((m, rank) => ({ ...m, rank: rank + 1 }));

    // ── 5. Padrão do dia atual em meses anteriores ─────────────
    // "neste dia 22, o que aconteceu em Jan, Dez, Nov..."
    const dayPattern: Array<{
      year: number;
      month: number;
      month_name: string;
      orders: number;
      revenue: number;
    }> = [];

    for (const order of orders) {
      const d = new Date(order.created_at);
      if (d.getDate() === currentDay) {
        dayPattern.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          month_name: MONTH_NAMES[d.getMonth() + 1],
          orders: 1,
          revenue: order.total ?? 0,
        });
      }
    }

    // Agrupa dia pattern por ano+mês
    const dayPatternGrouped: Record<string, { year: number; month: number; month_name: string; orders: number; revenue: number }> = {};
    for (const dp of dayPattern) {
      const key = `${dp.year}-${dp.month}`;
      if (!dayPatternGrouped[key]) {
        dayPatternGrouped[key] = { ...dp };
      } else {
        dayPatternGrouped[key].orders += 1;
        dayPatternGrouped[key].revenue += dp.revenue;
      }
    }

    const dayPatternResult = Object.values(dayPatternGrouped)
      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
      .slice(0, 24) // últimos 24 meses com pedidos nessa data
      .map(d => ({ ...d, revenue: Math.round(d.revenue * 100) / 100 }));

    // ── 6. Comparação mês atual vs mesmo mês ano anterior ─────
    const prevYear = currentYear - 1;
    const prevYearSameMonth = yearMonth[prevYear]?.[currentMonth] ?? { orders: 0, revenue: 0 };
    const twoYearsAgoSameMonth = yearMonth[prevYear - 1]?.[currentMonth] ?? { orders: 0, revenue: 0 };

    const monthComparison = {
      current_month: currentMonth,
      current_month_name: MONTH_NAMES[currentMonth],
      prev_year: {
        year: prevYear,
        orders: prevYearSameMonth.orders,
        revenue: Math.round(prevYearSameMonth.revenue * 100) / 100,
      },
      two_years_ago: {
        year: prevYear - 1,
        orders: twoYearsAgoSameMonth.orders,
        revenue: Math.round(twoYearsAgoSameMonth.revenue * 100) / 100,
      },
      growth_orders_yoy:
        twoYearsAgoSameMonth.orders > 0
          ? Math.round(((prevYearSameMonth.orders - twoYearsAgoSameMonth.orders) / twoYearsAgoSameMonth.orders) * 1000) / 10
          : null,
      growth_revenue_yoy:
        twoYearsAgoSameMonth.revenue > 0
          ? Math.round(((prevYearSameMonth.revenue - twoYearsAgoSameMonth.revenue) / twoYearsAgoSameMonth.revenue) * 1000) / 10
          : null,
    };

    // ── 7. Insights automáticos ────────────────────────────────
    const insights: string[] = [];

    if (bestMonths.length > 0) {
      const top = bestMonths[0];
      insights.push(`📈 ${top.month_name} é historicamente o mês mais forte, com média de ${top.avg_orders_per_year} pedidos/ano`);
    }
    if (bestMonths.length > 2) {
      const top3 = bestMonths.slice(0, 3).map(m => m.month_name).join(', ');
      insights.push(`🏆 Top 3 meses: ${top3}`);
    }

    // Detecta meses com pico fora de época (não Nov/Dez)
    const unexpectedPeak = bestMonths.find(m => m.rank <= 3 && ![11, 12, 5, 6].includes(m.month));
    if (unexpectedPeak) {
      insights.push(`💡 ${unexpectedPeak.month_name} performa bem mesmo fora de épocas sazonais — ótimo para campanhas orgânicas`);
    }

    // Mês mais fraco
    const worstMonth = [...monthlySummary]
      .filter(m => m.total_orders > 0)
      .sort((a, b) => a.avg_orders_per_year - b.avg_orders_per_year)[0];
    if (worstMonth) {
      insights.push(`⚠️ ${worstMonth.month_name} é historicamente o mês mais fraco — ideal para campanhas de reativação`);
    }

    // Comparação YoY do mês atual
    if (monthComparison.growth_orders_yoy !== null) {
      const dir = monthComparison.growth_orders_yoy > 0 ? '⬆️' : '⬇️';
      insights.push(`${dir} ${MONTH_NAMES[currentMonth]} de ${prevYear} teve ${monthComparison.growth_orders_yoy > 0 ? '+' : ''}${monthComparison.growth_orders_yoy}% vs ${prevYear - 1}`);
    }

    return NextResponse.json({
      success: true,
      reference_date: {
        day: currentDay,
        month: currentMonth,
        year: currentYear,
        month_name: MONTH_NAMES[currentMonth],
      },
      years_analyzed: sortedYears,
      total_orders_analyzed: orders.length,
      monthly_summary: monthlySummary,
      yearly_monthly: yearlyMonthly,
      best_months: bestMonths,
      day_of_month_pattern: dayPatternResult,
      month_comparison: monthComparison,
      insights,
    });
  } catch (err) {
    console.error('[monthly-trends] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
