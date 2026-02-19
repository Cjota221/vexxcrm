import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { validateTransition } from '@/lib/kanban-state-machine';
import type { KanbanColumn } from '@/types';

/**
 * PATCH /api/v2/kanban/move
 *
 * Move um card de kanban de uma coluna para outra.
 * A transição é validada pela máquina de estados antes de ser aplicada.
 * Transições inválidas retornam 422 com anomaly_code.
 *
 * Body:
 *   { contato_id: string, chat_id: string, de_coluna: KanbanColumn | null, para_coluna: KanbanColumn, motivo?: string }
 *
 * Response 200:
 *   { sucesso: true, novo_estado: KanbanColumn, timestamp: string }
 *
 * Response 422:
 *   { erro: string, codigo_anomalia: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json();
    const {
      contato_id,
      chat_id,
      de_coluna,
      para_coluna,
      motivo = 'Movido manualmente pelo atendente',
    } = body as {
      contato_id: string;
      chat_id: string;
      de_coluna: KanbanColumn | null;
      para_coluna: KanbanColumn;
      motivo?: string;
    };

    if (!contato_id || !chat_id || para_coluna === undefined) {
      return NextResponse.json(
        { error: 'contato_id, chat_id e para_coluna são obrigatórios' },
        { status: 400 }
      );
    }

    // ── Validar pela máquina de estados ────────────────────────────────
    const validation = validateTransition(de_coluna, para_coluna);

    if (!validation.allowed) {
      // Logar anomalia
      await supabase.from('kanban_transitions').insert({
        tenant_id: tenantId,
        chat_id,
        client_id: contato_id,
        de_coluna,
        para_coluna,
        autor: 'human',
        autor_id: profile.id,
        motivo: `[REJEITADO] ${motivo} — ${validation.message}`,
      });

      return NextResponse.json(
        { erro: validation.message, codigo_anomalia: validation.anomaly_code },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();

    // ── Upsert kanban card ─────────────────────────────────────────────
    // NOTA: a constraint é UNIQUE(tenant_id, chat_id) — onConflict deve
    // incluir ambas as colunas para corresponder à constraint correta.
    const { error: upsertError } = await supabase
      .from('kanban_cards')
      .upsert(
        {
          tenant_id: tenantId,
          chat_id,
          client_id: contato_id,
          coluna: para_coluna,
          updated_at: now,
        },
        { onConflict: 'tenant_id,chat_id' }
      );

    if (upsertError) {
      console.error('❌ kanban/move upsert error:', upsertError);
      return NextResponse.json({ error: 'Erro ao atualizar card' }, { status: 500 });
    }

    // ── Registrar transição ────────────────────────────────────────────
    await supabase.from('kanban_transitions').insert({
      tenant_id: tenantId,
      chat_id,
      client_id: contato_id,
      de_coluna,
      para_coluna,
      autor: 'human',
      autor_id: profile.id,
      motivo,
    });

    return NextResponse.json({
      sucesso: true,
      novo_estado: para_coluna,
      timestamp: now,
    });

  } catch (error) {
    console.error('❌ kanban/move error:', error);
    return NextResponse.json(
      { error: 'Erro interno ao mover card' },
      { status: 500 }
    );
  }
}
