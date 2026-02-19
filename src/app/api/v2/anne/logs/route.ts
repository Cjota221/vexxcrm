import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/anne/logs
 *
 * Feed de execução ao vivo da Anne OS v5.
 * Retorna logs de anne_logs_v2 com paginação e filtros.
 *
 * Query params:
 *   limit   → máximo (padrão: 50)
 *   tipo    → 'silenciosa' | 'ativa' | 'handover' | 'erro'
 *   agente  → slug do agente
 *   dias    → janela de dias (padrão: 1)
 *   page    → paginação (padrão: 1)
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const { searchParams } = new URL(request.url);
    const limit  = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));
    const tipo   = searchParams.get('tipo') ?? undefined;
    const agente = searchParams.get('agente') ?? undefined;
    const dias   = Math.min(30, parseInt(searchParams.get('dias') ?? '1'));
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'));

    const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('anne_logs_v2')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (tipo)   query = query.eq('tipo', tipo);
    if (agente) query = query.eq('agente_executor', agente);

    const { data: logs, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Resumo do período ──────────────────────────────────────────────
    const { data: summary } = await supabase
      .from('anne_logs_v2')
      .select('tipo, duracao_total_ms')
      .eq('tenant_id', tenantId)
      .gte('created_at', since);

    const silenciosas    = summary?.filter(l => l.tipo === 'silenciosa').length ?? 0;
    const ativas         = summary?.filter(l => l.tipo === 'ativa').length ?? 0;
    const handovers      = summary?.filter(l => l.tipo === 'handover').length ?? 0;
    const erros          = summary?.filter(l => l.tipo === 'erro').length ?? 0;
    const avgLatency     = summary?.length
      ? Math.round(summary.reduce((acc, l) => acc + (l.duracao_total_ms ?? 0), 0) / summary.length)
      : 0;

    // ── Handovers aguardando (badge no header) ─────────────────────────
    const { count: handoversPendentes } = await supabase
      .from('anne_handovers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'aguardando');

    return NextResponse.json({
      logs:    logs ?? [],
      total:   count ?? 0,
      page,
      per_page: limit,
      summary: {
        silenciosas,
        ativas,
        handovers,
        erros,
        avg_latency_ms:     avgLatency,
        handovers_pendentes: handoversPendentes ?? 0,
      },
    });

  } catch (err) {
    console.error('[anne/logs] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
