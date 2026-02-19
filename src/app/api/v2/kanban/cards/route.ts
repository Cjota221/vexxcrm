import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/kanban/cards
 *
 * Retorna todos os kanban_cards do tenant com dados do cliente e
 * as últimas 5 transições de cada card.
 *
 * Usado pelo KanbanBoard para renderizar as colunas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    // ── Modo especial: só contagens por coluna (usado pelo KanbanDrawer) ──
    const { searchParams } = new URL(request.url);
    if (searchParams.get('mode') === 'counts') {
      const { data: rows, error: countErr } = await supabase
        .from('kanban_cards')
        .select('coluna')
        .eq('tenant_id', tenantId);

      if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

      const byCol: Record<string, number> = {};
      for (const r of rows ?? []) {
        byCol[r.coluna] = (byCol[r.coluna] ?? 0) + 1;
      }

      const data = Object.entries(byCol).map(([coluna, count]) => ({ coluna, count }));
      return NextResponse.json({ data });
    }

    // ── Cards com dados do cliente (join) ──────────────────────
    const { data: cards, error } = await supabase
      .from('kanban_cards')
      .select(`
        id,
        tenant_id,
        chat_id,
        client_id,
        coluna,
        tags,
        score_anne,
        tentativas_reativacao,
        created_at,
        updated_at,
        clients!inner(
          id,
          name,
          phone
        )
      `)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[kanban/cards] query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Buscar últimas 5 transições de cada card ───────────────
    const cardIds = (cards ?? []).map(c => c.id);

    let transitionsByCard: Record<string, Array<{
      id: string;
      de_coluna: string | null;
      para_coluna: string;
      autor: string;
      motivo: string | null;
      created_at: string;
    }>> = {};

    if (cardIds.length > 0) {
      // Busca as últimas transições para todos os cards do tenant
      const { data: transitions } = await supabase
        .from('kanban_transitions')
        .select('id, chat_id, de_coluna, para_coluna, autor, motivo, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(cardIds.length * 5); // heurística: 5 por card

      // Agrupa por chat_id
      for (const t of transitions ?? []) {
        // Mapeia via chat_id → card
        const card = (cards ?? []).find(c => c.chat_id === t.chat_id);
        if (!card) continue;
        if (!transitionsByCard[card.id]) transitionsByCard[card.id] = [];
        if (transitionsByCard[card.id].length < 5) {
          transitionsByCard[card.id].push(t);
        }
      }
    }

    // ── Normaliza para o formato KanbanCard ────────────────────
    const normalized = (cards ?? []).map(card => {
      const client = Array.isArray(card.clients) ? card.clients[0] : card.clients;
      return {
        id: card.id,
        tenant_id: card.tenant_id,
        chat_id: card.chat_id,
        client_id: card.client_id,
        client_name: client?.name ?? 'Desconhecido',
        client_phone: client?.phone ?? '',
        coluna: card.coluna,
        tags: card.tags ?? [],
        score_anne: card.score_anne ?? null,
        tentativas_reativacao: card.tentativas_reativacao ?? 0,
        ultimo_contato: card.updated_at,
        transitions: transitionsByCard[card.id] ?? [],
        created_at: card.created_at,
        updated_at: card.updated_at,
      };
    });

    return NextResponse.json({ cards: normalized });
  } catch (err) {
    console.error('[kanban/cards] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
