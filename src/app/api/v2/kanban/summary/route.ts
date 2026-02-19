import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import type { KanbanColumn } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/kanban/summary
 *
 * Retorna contagem e valor total (LTV real) por coluna do Kanban.
 * O LTV é calculado a partir de pedidos ATIVOS (excluindo cancelled/refunded),
 * fazendo lookup pelo client_id (direto) ou pelo phone no metadata
 * (para pedidos importados sem client_id).
 *
 * Response: {
 *   columns: Record<KanbanColumn, {
 *     count: number;
 *     total_ltv: number;
 *     active_orders: number;
 *   }>;
 *   total_cards: number;
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;

    // ── 1. Buscar todos os cards com o client_id ──────────────────
    const { data: cards, error: cardsError } = await supabase
      .from('kanban_cards')
      .select('client_id, coluna')
      .eq('tenant_id', tenantId);

    if (cardsError) {
      console.error('[kanban/summary] cards error:', cardsError);
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    const cardsList = cards ?? [];
    const clientIds = [...new Set(cardsList.map(c => c.client_id).filter(Boolean))];

    // ── 2. Mapa client_id → coluna ────────────────────────────────
    const clientToColuna: Record<string, KanbanColumn> = {};
    for (const card of cardsList) {
      if (card.client_id) clientToColuna[card.client_id] = card.coluna as KanbanColumn;
    }

    // ── 3. Buscar phone dos clientes (para resolver pedidos sem client_id) ──
    const clientPhones: Array<{ id: string; phone: string | null }> = [];
    for (let i = 0; i < clientIds.length; i += 100) {
      const batch = clientIds.slice(i, i + 100);
      const { data: chunk } = await supabase
        .from('clients')
        .select('id, phone')
        .eq('tenant_id', tenantId)
        .in('id', batch);
      clientPhones.push(...(chunk ?? []));
    }

    // Montar mapa phone normalizado → client_id (ambas as formas: com e sem 9° dígito)
    const phoneToClientId: Record<string, string> = {};
    for (const c of clientPhones) {
      if (!c.phone) continue;
      const digits = c.phone.replace(/\D/g, '');
      phoneToClientId[digits] = c.id;
      // Registrar sem o 9° (13 → 12)
      if (digits.startsWith('55') && digits.length === 13) {
        const without9 = digits.slice(0, 4) + digits.slice(5);
        if (!phoneToClientId[without9]) phoneToClientId[without9] = c.id;
      }
      // Registrar com o 9° (12 → 13)
      if (digits.startsWith('55') && digits.length === 12) {
        const with9 = digits.slice(0, 4) + '9' + digits.slice(4);
        if (!phoneToClientId[with9]) phoneToClientId[with9] = c.id;
      }
    }

    // ── 4. Buscar pedidos ativos (com e sem client_id) ────────────
    const { data: ordersRaw, error: ordersError } = await supabase
      .from('orders')
      .select('client_id, total, status, metadata')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '(cancelled,refunded)');

    if (ordersError) {
      console.error('[kanban/summary] orders error:', ordersError);
      // Fallback: retornar apenas contagens sem LTV
    }

    // ── 5. Acumular LTV por coluna ────────────────────────────────
    const summary: Record<string, { count: number; total_ltv: number; active_orders: number }> = {};

    // Inicializar todas as colunas com zero
    for (const card of cardsList) {
      const col = card.coluna as string;
      if (!summary[col]) summary[col] = { count: 0, total_ltv: 0, active_orders: 0 };
      summary[col].count += 1;
    }

    // Somar LTV dos pedidos
    for (const order of ordersRaw ?? []) {
      const total = (order.total as number) ?? 0;
      if (total <= 0) continue;

      let cid: string | null = order.client_id as string | null;

      // Tentar resolver via phone no metadata (pedidos importados sem client_id)
      if (!cid && order.metadata) {
        const meta = order.metadata as Record<string, unknown>;
        const e164   = meta.cliente_whatsapp_e164 as string | undefined;
        const wapp   = meta.cliente_whatsapp      as string | undefined;
        const phones = [
          e164 ? e164.replace(/\D/g, '') : null,
          wapp ? '55' + String(wapp).replace(/\D/g, '') : null,
        ].filter(Boolean) as string[];

        for (const p of phones) {
          if (phoneToClientId[p]) {
            cid = phoneToClientId[p];
            break;
          }
        }
      }

      if (!cid) continue;
      const coluna = clientToColuna[cid];
      if (!coluna) continue;

      if (!summary[coluna]) summary[coluna] = { count: 0, total_ltv: 0, active_orders: 0 };
      summary[coluna].total_ltv += total;
      summary[coluna].active_orders += 1;
    }

    // Arredondar LTV para 2 casas decimais
    for (const col of Object.keys(summary)) {
      summary[col].total_ltv = Math.round(summary[col].total_ltv * 100) / 100;
    }

    return NextResponse.json({ columns: summary, total_cards: cardsList.length });
  } catch (err) {
    console.error('[kanban/summary] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

