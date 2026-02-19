import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkGhosting } from '@/lib/anne-triggers';
import { validateTransition } from '@/lib/kanban-state-machine';
import type { KanbanColumn } from '@/types';

/**
 * GET /api/cron/ghosting-check
 *
 * Job de ghosting — verifica cards inativos e os move automaticamente.
 * Executado pelo Vercel Cron (ou chamada externa autenticada) a cada 1 hora.
 *
 * Configurar em vercel.json:
 *   { "crons": [{ "path": "/api/cron/ghosting-check", "schedule": "0 * * * *" }] }
 *
 * Auth: header x-cron-secret deve bater com CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  // ── Autenticação do cron ─────────────────────────────────────────────
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const results = {
    processados: 0,
    movidos_reativar: 0,
    movidos_concluido: 0,
    erros: 0,
  };

  try {
    // ── Buscar todos os cards não-terminais ────────────────────────────
    const { data: cards, error } = await supabase
      .from('kanban_cards')
      .select('id, tenant_id, chat_id, client_id, coluna, tentativas_reativacao, updated_at')
      .not('coluna', 'in', '("PAGO","CONCLUIDO")')
      .order('updated_at', { ascending: true })
      .limit(500); // batch de 500 por execução

    if (error) throw error;
    if (!cards?.length) {
      return NextResponse.json({ message: 'Nenhum card para verificar', ...results });
    }

    for (const card of cards) {
      results.processados++;

      const ghostResult = checkGhosting({
        ultimoContatoAt: card.updated_at,
        colunaAtual: card.coluna as KanbanColumn,
        tentativasReativacao: card.tentativas_reativacao ?? 0,
      });

      if (!ghostResult?.shouldMove) continue;

      const validation = validateTransition(
        card.coluna as KanbanColumn,
        ghostResult.novaColunaDestino
      );

      if (!validation.allowed) {
        results.erros++;
        continue;
      }

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('kanban_cards')
        .update({
          coluna: ghostResult.novaColunaDestino,
          tentativas_reativacao:
            ghostResult.novaColunaDestino === 'REATIVAR'
              ? (card.tentativas_reativacao ?? 0) + 1
              : card.tentativas_reativacao,
          updated_at: now,
        })
        .eq('id', card.id);

      if (updateError) {
        results.erros++;
        continue;
      }

      // Registrar transição
      await supabase.from('kanban_transitions').insert({
        tenant_id: card.tenant_id,
        chat_id: card.chat_id,
        client_id: card.client_id,
        de_coluna: card.coluna,
        para_coluna: ghostResult.novaColunaDestino,
        autor: 'anne',
        motivo: ghostResult.motivo,
      });

      // Atualizar tag
      if (ghostResult.novaTag) {
        await supabase.rpc('append_client_tag', {
          p_client_id: card.client_id,
          p_tenant_id: card.tenant_id,
          p_tag: ghostResult.novaTag,
        });
      }

      // Log
      await supabase.from('anne_trigger_log').insert({
        tenant_id: card.tenant_id,
        chat_id: card.chat_id,
        client_id: card.client_id,
        trigger: 'ghosting',
        score: 1.0,
        acao: 'move_kanban',
        resultado: 'executado',
        escalona_para_humano: false,
        canal: 'cron',
      });

      if (ghostResult.novaColunaDestino === 'REATIVAR') {
        results.movidos_reativar++;
      } else {
        results.movidos_concluido++;
      }
    }

    console.log('[Cron/Ghosting]', results);
    return NextResponse.json({ ...results, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Cron ghosting error:', error);
    return NextResponse.json(
      { error: 'Erro no job de ghosting', ...results },
      { status: 500 }
    );
  }
}
