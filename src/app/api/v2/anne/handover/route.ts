import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { suspendAutomation } from '@/lib/services/anne-pipeline';

/**
 * POST /api/v2/anne/handover
 *
 * Dispara o protocolo de crise:
 *  [1] Suspende automação para o chat
 *  [2] Move kanban para atendimento_humano_urgente
 *  [3] Monta dossiê de contexto para a vendedora
 *  [4] Emite SSE (badge vermelho no header)
 *  [5] Salva registro em anne_handovers
 *
 * Body: {
 *   chat_id, client_id?, motivo, palavra_gatilho?,
 *   tipo_gatilho?, score_sentimento?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json() as {
      chat_id: string;
      client_id?: string;
      motivo: string;
      palavra_gatilho?: string;
      tipo_gatilho?: string;
      score_sentimento?: number;
    };

    const { chat_id: chatId, client_id: clientId, motivo, palavra_gatilho, tipo_gatilho, score_sentimento } = body;

    if (!chatId || !motivo) {
      return NextResponse.json({ error: 'chat_id e motivo são obrigatórios' }, { status: 400 });
    }

    // ── [1] Suspender automação ────────────────────────────────────────
    await suspendAutomation(supabase, tenantId, chatId, motivo);

    // ── [2] Mover kanban para atendimento humano urgente ───────────────
    if (clientId) {
      await supabase
        .from('kanban_cards')
        .update({
          column_id:  'ATENDIMENTO_HUMANO',
          priority:   'critica',
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId);
    }

    // ── [3] Montar dossiê de contexto ─────────────────────────────────
    let dossie: Record<string, unknown> = {
      motivo,
      palavra_gatilho,
      chat_id: chatId,
    };

    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('name, tier, ltv, total_orders, flags, last_order_at')
        .eq('tenant_id', tenantId)
        .eq('id', clientId)
        .single();

      // Últimas 5 mensagens para contexto
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('content, direction, created_at')
        .eq('tenant_id', tenantId)
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Pedidos em aberto
      const { data: openOrders } = await supabase
        .from('orders')
        .select('order_number, status, total_amount, created_at')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .not('status', 'in', '("entregue","cancelado")')
        .limit(5);

      dossie = {
        ...dossie,
        nome_cliente:           client?.name ?? 'Desconhecido',
        tier:                   client?.tier ?? 'lead',
        ltv_total:              client?.ltv ?? 0,
        total_pedidos:          client?.total_orders ?? 0,
        ultimo_pedido:          client?.last_order_at ?? null,
        flag_historico_reclamacao: (client?.flags ?? []).includes('historico_reclamacao'),
        historico_resumido:     (recentMsgs ?? []).reverse().map(m => `${m.direction === 'outbound' ? '[LOJA]' : '[CLIENTE]'} ${m.content ?? ''}`),
        pedidos_em_aberto:      openOrders ?? [],
        urgencia_estimada:      (score_sentimento ?? 0) > 0.85 ? 'critica' : 'alta',
      };
    }

    // ── [4] Mensagem de transição ao cliente ───────────────────────────
    const clientName = (dossie.nome_cliente as string)?.split(' ')[0] ?? 'Cliente';
    const mensagemTransicao = `${clientName}, vou te conectar agora com um de nossos especialistas para cuidar disso da melhor forma. Em instantes alguém da nossa equipe entra em contato com você.`;

    // ── [5] Salvar handover ────────────────────────────────────────────
    const { data: handover, error: handoverError } = await supabase
      .from('anne_handovers')
      .insert({
        tenant_id:          tenantId,
        client_id:          clientId ?? null,
        chat_id:            chatId,
        motivo,
        palavra_gatilho:    palavra_gatilho ?? null,
        tipo_gatilho:       tipo_gatilho ?? 'keyword',
        score_sentimento:   score_sentimento ?? null,
        dossie,
        status:             'aguardando',
        mensagem_transicao: mensagemTransicao,
      })
      .select('id')
      .single();

    if (handoverError) {
      console.error('[anne/handover] Erro ao salvar handover:', handoverError);
    }

    // ── [6] Emitir SSE — badge vermelho no header ──────────────────────
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).sseClients) {
      const sseClients = (globalThis as unknown as Record<string, Set<{ write: (d: string) => void }>>).sseClients;
      const tenantClients = sseClients[tenantId];
      if (tenantClients) {
        const event = JSON.stringify({
          type:       'anne_handover',
          chat_id:    chatId,
          client_id:  clientId,
          nome:       dossie.nome_cliente,
          motivo,
          handover_id: handover?.id,
        });
        tenantClients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch { /* cliente desconectado */ }
        });
      }
    }

    return NextResponse.json({
      success:           true,
      handover_id:       handover?.id,
      automacao_suspensa: true,
      kanban_moved:      !!clientId,
      dossie_gerado:     true,
      mensagem_transicao: mensagemTransicao,
    });

  } catch (err) {
    console.error('[anne/handover] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * GET /api/v2/anne/handover — Lista handovers ativos
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'aguardando';

    const { data: handovers } = await supabase
      .from('anne_handovers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ handovers: handovers ?? [] });

  } catch (err) {
    console.error('[anne/handover GET] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/v2/anne/handover — Assumir ou resolver handover
 * Body: { handover_id, status: 'assumido' | 'resolvido', assumido_por? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json() as {
      handover_id: string;
      status: 'assumido' | 'resolvido';
      assumido_por?: string;
    };

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status:     body.status,
      updated_at: now,
    };

    if (body.status === 'assumido') {
      update.assumido_por = body.assumido_por ?? 'operador';
      update.assumido_at  = now;
    }

    if (body.status === 'resolvido') {
      update.resolvido_at = now;

      // Reativar automação para o chat
      const { data: handover } = await supabase
        .from('anne_handovers')
        .select('chat_id')
        .eq('tenant_id', tenantId)
        .eq('id', body.handover_id)
        .single();

      if (handover?.chat_id) {
        await supabase
          .from('conversations')
          .update({ automacao_suspensa: false, automacao_suspensa_motivo: null })
          .eq('tenant_id', tenantId)
          .eq('id', handover.chat_id);
      }
    }

    await supabase
      .from('anne_handovers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', body.handover_id);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[anne/handover PATCH] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
