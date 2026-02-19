import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/anne/stats
 *
 * Retorna estatísticas de performance da Anne para o Header e Dashboard.
 *
 * Response: {
 *   carts_recovered_today: number;
 *   carts_pending: number;
 *   automations_fired_today: number;
 *   suggestions_pending: number;
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Carrinhos convertidos hoje (status=converted, updated_at >= today)
    const { count: cartsRecoveredToday } = await supabase
      .from('anne_recovery_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'converted')
      .gte('updated_at', todayISO);

    // Carrinhos pendentes na fila
    const { count: cartsPending } = await supabase
      .from('anne_recovery_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');

    // Sugestões aguardando aprovação humana
    const { count: suggestionsPending } = await supabase
      .from('anne_recovery_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'suggested');

    // Automações disparadas hoje (automation_logs com success=true)
    const { count: automationsFiredToday } = await supabase
      .from('automation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('success', true)
      .neq('action_taken', 'noop')
      .gte('created_at', todayISO);

    return NextResponse.json({
      carts_recovered_today: cartsRecoveredToday ?? 0,
      carts_pending: cartsPending ?? 0,
      automations_fired_today: automationsFiredToday ?? 0,
      suggestions_pending: suggestionsPending ?? 0,
    });
  } catch (err) {
    console.error('[anne/stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
