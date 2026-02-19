import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import type { KanbanColumn } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/kanban/summary
 *
 * Retorna contagem e valor total por coluna do Kanban.
 * Usado pelo KanbanModal para exibir totais e pelo Header badge.
 *
 * Response: { columns: Record<KanbanColumn, { count: number; total_ltv: number }> }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    // Buscar todos os cards com LTV do cliente
    const { data: cards, error } = await supabase
      .from('kanban_cards')
      .select(`
        coluna,
        clients!inner(ltv)
      `)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[kanban/summary] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Agregar por coluna
    const summary: Record<string, { count: number; total_ltv: number }> = {};

    for (const card of cards ?? []) {
      const coluna = card.coluna as KanbanColumn;
      const client = Array.isArray(card.clients) ? card.clients[0] : card.clients;
      const ltv = (client as { ltv?: number } | null)?.ltv ?? 0;

      if (!summary[coluna]) summary[coluna] = { count: 0, total_ltv: 0 };
      summary[coluna].count += 1;
      summary[coluna].total_ltv += ltv;
    }

    return NextResponse.json({ columns: summary, total_cards: (cards ?? []).length });
  } catch (err) {
    console.error('[kanban/summary] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
