import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import type { KanbanColumn } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Mapeamento order status → kanban coluna
 */
const ORDER_STATUS_TO_COLUMN: Record<string, KanbanColumn> = {
  delivered:  'CONCLUIDO',
  shipped:    'DESPACHADO',
  confirmed:  'PAGO',
  processing: 'AGUARDANDO_PAGAMENTO',
  pending:    'AGUARDANDO_PAGAMENTO',
  cancelled:  'CANCELADO',
  refunded:   'CANCELADO',
};

function determineColumn(
  latestOrderStatus: string | null,
  lastMessageAt: string | null
): KanbanColumn {
  if (!latestOrderStatus) {
    const daysSince = lastMessageAt
      ? (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    return daysSince < 7 ? 'EM_NEGOCIACAO' : 'PRIMEIRO_CONTATO';
  }
  return ORDER_STATUS_TO_COLUMN[latestOrderStatus] ?? 'EM_NEGOCIACAO';
}

/**
 * POST /api/v2/kanban/sync
 *
 * Varre todas as conversas do tenant e sincroniza o kanban com a
 * realidade dos pedidos:
 *   - Cria cards para conversas que não têm card
 *   - Move cards para a coluna correta baseado no pedido mais recente
 *   - Remove cards "fantasma" que não têm conversa real associada
 *
 * Seguro para chamar múltiplas vezes (idempotente).
 *
 * Response:
 *   { criados, atualizados, removidos, sem_mudanca, total_cards }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // ── 1. Buscar todas as conversas ─────────────────────────────
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id, client_id, last_message_at, created_at')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false });

    if (convErr) throw new Error('Erro ao buscar conversas: ' + convErr.message);

    // ── 2. Buscar clients com phone — em lotes de 100 (limite URL Supabase) ──
    const clientIds = [...new Set((convs ?? []).map(c => c.client_id).filter(Boolean))] as string[];

    const allClients: { id: string; phone: string }[] = [];
    for (let i = 0; i < clientIds.length; i += 100) {
      const batch = clientIds.slice(i, i + 100);
      const { data: chunk } = await supabase
        .from('clients')
        .select('id, phone')
        .eq('tenant_id', tenantId)
        .in('id', batch);
      allClients.push(...(chunk ?? []));
    }

    const clientPhone: Record<string, string> = {};
    for (const c of allClients) clientPhone[c.id] = c.phone;

    // ── 3. Buscar pedido mais recente por cliente ─────────────────
    const { data: orders } = await supabase
      .from('orders')
      .select('client_id, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const latestOrderByClient: Record<string, string> = {};
    for (const o of orders ?? []) {
      if (!latestOrderByClient[o.client_id]) {
        latestOrderByClient[o.client_id] = o.status;
      }
    }

    // ── 4. Buscar cards existentes ────────────────────────────────
    const { data: existingCards } = await supabase
      .from('kanban_cards')
      .select('id, client_id, chat_id, coluna')
      .eq('tenant_id', tenantId);

    const existingByClient: Record<string, { id: string; chat_id: string; coluna: string }> = {};
    for (const c of existingCards ?? []) existingByClient[c.client_id] = c;

    // ── 5. Remover cards sem conversa real (seeded fake) ──────────
    const realClientSet = new Set(clientIds);
    const fakeCards = (existingCards ?? []).filter(c => !realClientSet.has(c.client_id));
    let removidos = 0;

    if (fakeCards.length > 0) {
      const fakeIds = fakeCards.map(c => c.id);
      for (let i = 0; i < fakeIds.length; i += 100) {
        await supabase.from('kanban_cards').delete().in('id', fakeIds.slice(i, i + 100));
      }
      removidos = fakeCards.length;
    }

    // ── 6. Upsert cards para cada conversa real ───────────────────
    const now = new Date().toISOString();
    const upsertBatch: Array<{
      tenant_id: string;
      chat_id: string;
      client_id: string;
      coluna: KanbanColumn;
      updated_at: string;
    }> = [];
    const transitionBatch: Array<{
      tenant_id: string;
      chat_id: string;
      client_id: string;
      de_coluna: KanbanColumn | null;
      para_coluna: KanbanColumn;
      autor: string;
      motivo: string;
    }> = [];

    let criados = 0, atualizados = 0, sem_mudanca = 0;

    for (const conv of convs ?? []) {
      const phone = clientPhone[conv.client_id];
      if (!phone) continue;

      const cleanPhone = phone.replace(/\D/g, '');
      const chatId = `${cleanPhone}@s.whatsapp.net`;

      const orderStatus = latestOrderByClient[conv.client_id] ?? null;
      const targetColumn = determineColumn(orderStatus, conv.last_message_at);

      const existing = existingByClient[conv.client_id];

      if (existing && existing.coluna === targetColumn) {
        sem_mudanca++;
        continue;
      }

      if (existing) atualizados++;
      else criados++;

      upsertBatch.push({
        tenant_id: tenantId,
        chat_id: chatId,
        client_id: conv.client_id,
        coluna: targetColumn,
        updated_at: now,
      });

      transitionBatch.push({
        tenant_id: tenantId,
        chat_id: chatId,
        client_id: conv.client_id,
        de_coluna: (existing?.coluna as KanbanColumn) ?? null,
        para_coluna: targetColumn,
        autor: 'anne',
        motivo: 'Sincronização automática — varredura de realidade',
      });
    }

    // Upsert em lotes
    for (let i = 0; i < upsertBatch.length; i += 100) {
      const { error } = await supabase
        .from('kanban_cards')
        .upsert(upsertBatch.slice(i, i + 100), { onConflict: 'tenant_id,chat_id' });
      if (error) console.error('[kanban/sync] upsert error:', error.message);
    }

    // Registrar transições
    for (let i = 0; i < transitionBatch.length; i += 100) {
      await supabase.from('kanban_transitions').insert(transitionBatch.slice(i, i + 100));
    }

    const total_cards = sem_mudanca + criados + atualizados;

    return NextResponse.json({
      sucesso: true,
      criados,
      atualizados,
      removidos,
      sem_mudanca,
      total_cards,
    });

  } catch (err: any) {
    console.error('[kanban/sync] error:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
