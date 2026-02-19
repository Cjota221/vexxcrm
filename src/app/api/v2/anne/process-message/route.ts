import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { processMessage } from '@/lib/anne-triggers';
import { validateTransition } from '@/lib/kanban-state-machine';
import type { KanbanColumn } from '@/types';

/**
 * POST /api/v2/anne/process-message
 *
 * Pipeline de processamento de mensagem pelo motor de gatilhos da Anne.
 * Detecta intenções, calcula scores, executa ações automáticas e
 * registra log para auditoria.
 *
 * Body:
 *   { contato_id: string, chat_id: string, conteudo: string, canal?: string, timestamp?: string }
 *
 * Response:
 *   { gatilhos_disparados[], acoes_executadas[], escalona_para_humano: bool, motivo? }
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json();
    const { contato_id, chat_id, conteudo, canal = 'whatsapp' } = body;

    if (!contato_id || !chat_id || !conteudo) {
      return NextResponse.json(
        { error: 'contato_id, chat_id e conteudo são obrigatórios' },
        { status: 400 }
      );
    }

    // ── Buscar card do Kanban + contagem de mensagens ─────────────────
    const [{ data: kanbanCard }, { count: msgCount }] = await Promise.all([
      supabase
        .from('kanban_cards')
        .select('id, coluna, tentativas_reativacao')
        .eq('chat_id', chat_id)
        .eq('tenant_id', tenantId)
        .single(),

      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', contato_id)
        .eq('tenant_id', tenantId),
    ]);

    const colunaAtual = (kanbanCard?.coluna ?? null) as KanbanColumn | null;
    const totalMsgs = msgCount ?? 1;

    // ── Motor de Gatilhos ─────────────────────────────────────────────
    const results = await processMessage(conteudo, {
      chatId: chat_id,
      clientId: contato_id,
      tenantId,
      msgCount: totalMsgs,
      colunaAtual,
    });

    if (results.length === 0) {
      return NextResponse.json({
        gatilhos_disparados: [],
        acoes_executadas: [],
        escalona_para_humano: false,
      });
    }

    // ── Executar ações no banco ───────────────────────────────────────
    const acoes_executadas: string[] = [];
    let escalona_para_humano = false;
    let motivo: string | undefined;

    for (const result of results) {
      escalona_para_humano = escalona_para_humano || result.escalona_para_humano;
      if (result.motivo_escalona) motivo = result.motivo_escalona;

      // Mover Kanban
      if (result.nova_coluna && result.nova_coluna !== colunaAtual) {
        const validation = validateTransition(colunaAtual, result.nova_coluna);
        if (validation.allowed) {
          // Upsert kanban card
          await supabase.from('kanban_cards').upsert({
            tenant_id: tenantId,
            chat_id,
            client_id: contato_id,
            coluna: result.nova_coluna,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'chat_id' });

          // Registrar transição
          await supabase.from('kanban_transitions').insert({
            tenant_id: tenantId,
            chat_id,
            client_id: contato_id,
            de_coluna: colunaAtual,
            para_coluna: result.nova_coluna,
            autor: 'anne',
            motivo: `Gatilho automático: ${result.trigger} (score ${(result.score * 100).toFixed(0)}%)`,
          });

          acoes_executadas.push(`move_kanban:${result.nova_coluna}`);
        }
      }

      // Atualizar tag
      if (result.nova_tag) {
        await supabase.rpc('append_client_tag', {
          p_client_id: contato_id,
          p_tenant_id: tenantId,
          p_tag: result.nova_tag,
        });
        acoes_executadas.push(`atualiza_tag:${result.nova_tag}`);
      }

      // Log do gatilho
      await supabase.from('anne_trigger_log').insert({
        tenant_id: tenantId,
        chat_id,
        client_id: contato_id,
        trigger: result.trigger,
        score: result.score,
        acao: result.acoes_executadas[0] ?? null,
        resultado: result.escalona_para_humano ? 'escalado' : result.acoes_executadas.length > 0 ? 'executado' : 'sugerido',
        escalona_para_humano: result.escalona_para_humano,
        canal,
      });
    }

    return NextResponse.json({
      gatilhos_disparados: results.map(r => r.trigger),
      acoes_executadas,
      escalona_para_humano,
      motivo,
    });

  } catch (error) {
    console.error('❌ Anne process-message error:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar mensagem' },
      { status: 500 }
    );
  }
}
