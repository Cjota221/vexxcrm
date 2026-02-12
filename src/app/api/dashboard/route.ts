import { NextResponse } from 'next/server';
import type { DashboardKPIs } from '@/types';

/**
 * GET /api/dashboard
 * Retorna KPIs do dashboard.
 */
export async function GET() {
  // TODO: Implementar busca real de KPIs no Supabase
  const kpis: DashboardKPIs = {
    total_clients: 0,
    active_chats: 0,
    running_campaigns: 0,
    messages_today: 0,
    total_revenue: 0,
    avg_ticket: 0,
    new_clients_month: 0,
    response_time_avg: 0,
  };

  return NextResponse.json({ data: kpis });
}
