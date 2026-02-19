import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/anne/log?dias=30&tipo=pedido_recebido&page=1
 *
 * Retorna o log de ações da Anne para auditoria e o Monitor de Status.
 *
 * Query params:
 *   dias  → número de dias retroativos (padrão: 30, máx: 90)
 *   tipo  → filtrar por tipo de gatilho (opcional)
 *   page  → paginação (padrão: 1, 50 por página)
 *
 * Response:
 *   { entradas: AnneTriggerLogEntry[], total: number, stats: { ... } }
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const { searchParams } = new URL(request.url);
    const dias = Math.min(90, parseInt(searchParams.get('dias') ?? '30'));
    const tipo = searchParams.get('tipo') ?? undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const PER_PAGE = 50;

    const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    // ── Query base ─────────────────────────────────────────────────────
    let query = supabase
      .from('anne_trigger_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

    if (tipo) {
      query = query.eq('trigger', tipo);
    }

    const { data: entradas, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Stats agregadas (últimas 24h) ──────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stats24h } = await supabase
      .from('anne_trigger_log')
      .select('trigger, resultado, escalona_para_humano')
      .eq('tenant_id', tenantId)
      .gte('created_at', since24h);

    const gatilhos24h = stats24h?.length ?? 0;
    const executados24h = stats24h?.filter(e => e.resultado === 'executado').length ?? 0;
    const escalados24h = stats24h?.filter(e => e.escalona_para_humano).length ?? 0;

    return NextResponse.json({
      entradas: entradas ?? [],
      total: count ?? 0,
      page,
      per_page: PER_PAGE,
      stats: {
        gatilhos_24h: gatilhos24h,
        executados_24h: executados24h,
        escalados_24h: escalados24h,
        taxa_automacao: gatilhos24h > 0
          ? `${Math.round((executados24h / gatilhos24h) * 100)}%`
          : '—',
      },
    });

  } catch (error) {
    console.error('❌ anne/log error:', error);
    return NextResponse.json(
      { error: 'Erro interno ao buscar log' },
      { status: 500 }
    );
  }
}
