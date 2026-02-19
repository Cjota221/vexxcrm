import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/automation-logs
 *
 * Retorna o histórico de automações executadas pela Anne.
 *
 * Query params:
 *   - limit      Número de registros (padrão: 50, máx: 200)
 *   - client_id  Filtrar por cliente específico (opcional)
 *   - source     Filtrar por origem: 'whatsapp' | 'facilzap' | 'manual' (opcional)
 *   - trigger    Filtrar por tipo de trigger (opcional)
 *   - since      ISO date — só retornar logs após essa data (opcional)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const clientId = searchParams.get('client_id');
    const source = searchParams.get('source');
    const trigger = searchParams.get('trigger');
    const since = searchParams.get('since');

    let query = supabase
      .from('automation_logs')
      .select(`
        id,
        client_id,
        chat_id,
        trigger_type,
        source,
        action_taken,
        de_coluna,
        para_coluna,
        order_number,
        tracking_code,
        success,
        error_msg,
        event_data,
        created_at,
        clients (
          id,
          name,
          phone,
          avatar_url
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (source) {
      query = query.eq('source', source);
    }
    if (trigger) {
      query = query.eq('trigger_type', trigger);
    }
    if (since) {
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[API AutomationLogs] Erro:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: data || [],
      total: data?.length || 0,
    });
  } catch (err: any) {
    console.error('[API AutomationLogs] Exceção:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
