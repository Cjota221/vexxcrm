import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  detectCrisis,
  classifyIntent,
  routeToAgent,
  loadClientProfile,
  isAutomationSuspended,
  logExecution,
  updateClientTier,
  extractOrderNumber,
  type PipelineInput,
  type ActionItem,
  type AgentSlug,
} from '@/lib/services/anne-pipeline';
import {
  runCommercialAgent,
  runLogisticsAgent,
  runFAQAgent,
  runOnboardingAgent,
} from '@/lib/services/agent-executor';

/**
 * POST /api/v2/anne/process
 *
 * Entrada principal do pipeline Anne OS v5.0.
 * Chamado pelo webhook do FacilZap para cada mensagem recebida.
 *
 * Body: { chat_id, message, from_me, client_id?, message_id? }
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();

  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const body = await request.json() as PipelineInput & {
      chat_id: string;
      message: string;
      from_me: boolean;
      client_id?: string;
      message_id?: string;
    };

    const { chat_id: chatId, message, from_me: fromMe, client_id: clientId, message_id: messageId } = body;

    if (!chatId || !message) {
      return NextResponse.json({ error: 'chat_id e message são obrigatórios' }, { status: 400 });
    }

    // Ignorar mensagens enviadas pelo próprio sistema
    if (fromMe) {
      return NextResponse.json({ handled: false, reason: 'from_me ignorado' });
    }

    const chainOfThought: string[] = [];

    // ── ETAPA 0: Verificar se automação está suspensa ──────────────────
    const suspended = await isAutomationSuspended(supabase, tenantId, chatId);
    if (suspended) {
      chainOfThought.push('⏸️ Automação suspensa para este chat (handover ativo)');
      return NextResponse.json({
        handled: false,
        reason: 'automacao_suspensa',
        chain_of_thought: chainOfThought,
      });
    }

    chainOfThought.push(`📱 Mensagem recebida via WhatsApp: "${message.substring(0, 60)}${message.length > 60 ? '…' : ''}"`);

    // ── ETAPA 1: Carregar memória / perfil do cliente ──────────────────
    let clientProfile = clientId
      ? await loadClientProfile(supabase, tenantId, clientId)
      : null;

    if (clientProfile) {
      chainOfThought.push(`👤 Perfil carregado: ${clientProfile.name} · Tier: ${clientProfile.tier} · LTV: R$${clientProfile.ltv.toFixed(2)}`);
    } else {
      chainOfThought.push('👤 Cliente não identificado ou novo');
    }

    // ── ETAPA 2: Filtro de crise (prioridade absoluta) ─────────────────
    const crisis = detectCrisis(message);
    if (crisis.isCrisis) {
      chainOfThought.push(`🚨 CRISE DETECTADA — gatilho: "${crisis.trigger}" (score: ${crisis.score})`);
      chainOfThought.push('⚡ Disparando handover imediato...');

      // Chamar endpoint de handover
      const handoverRes = await fetch(
        `${request.nextUrl.origin}/api/v2/anne/handover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization') ?? '',
          },
          body: JSON.stringify({
            chat_id:        chatId,
            client_id:      clientId,
            motivo:         `Crise detectada: "${crisis.trigger}"`,
            palavra_gatilho: crisis.trigger,
            tipo_gatilho:    'keyword',
            score_sentimento: crisis.score,
          }),
        },
      );

      const handoverData = await handoverRes.json() as { handover_id?: string };
      chainOfThought.push(`✅ Handover criado: ${handoverData.handover_id}`);

      await logExecution(supabase, tenantId, {
        clientId:     clientId ?? null,
        chatId,
        tipo:         'handover',
        agente:       'anne_central',
        gatilho:      `crise:${crisis.trigger}`,
        confianca:    crisis.score,
        acoes:        [],
        mensagem:     null,
        chainOfThought,
        duracaoMs:    Date.now() - t0,
        requerRevisao: true,
      });

      return NextResponse.json({
        handled:         true,
        is_crisis:       true,
        handover_id:     handoverData.handover_id,
        chain_of_thought: chainOfThought,
        duration_ms:     Date.now() - t0,
      });
    }

    chainOfThought.push('✅ Sem sinais de crise');

    // ── ETAPA 3: Classificar intenção ──────────────────────────────────
    const { intent, confidence } = classifyIntent(message);
    chainOfThought.push(`🔍 Intenção classificada: ${intent} (confiança: ${(confidence * 100).toFixed(0)}%)`);

    if (intent === 'AMBIGUO') {
      chainOfThought.push('❓ Intenção ambígua — aguardando clarificação');
      return NextResponse.json({
        handled:          false,
        reason:           'ambiguo',
        clarification:    'Por favor, pode me dar mais detalhes sobre o que você precisa?',
        chain_of_thought: chainOfThought,
        duration_ms:      Date.now() - t0,
      });
    }

    // ── ETAPA 4: Rotear para agente especialista ───────────────────────
    const isNewClient = !clientProfile || !clientProfile.onboarding_concluido;
    const agentSlug   = routeToAgent(intent, isNewClient);
    chainOfThought.push(`🤖 Roteando para agente: ${agentSlug}`);

    const agentInput = {
      message,
      clientProfile,
      tenantId,
      chatId,
      supabase,
    };

    // ── ETAPA 5: Executar agente ───────────────────────────────────────
    let agentResponse;
    const t1 = Date.now();

    if (intent === 'SISTEMA') {
      // Action Engine direto — processar pagamento/rastreio da FacilZap
      chainOfThought.push('⚙️ Evento de sistema — Action Engine direto');
      agentResponse = await runLogisticsAgent(agentInput);
    } else {
      switch (agentSlug) {
        case 'comercial': agentResponse = await runCommercialAgent(agentInput); break;
        case 'logistica': agentResponse = await runLogisticsAgent(agentInput);  break;
        case 'faq':       agentResponse = await runFAQAgent(agentInput);        break;
        case 'triagem':
        default:          agentResponse = await runOnboardingAgent(agentInput); break;
      }
    }

    const agentLatency = Date.now() - t1;
    chainOfThought.push(`⚡ Agente respondeu em ${agentLatency}ms — tipo: ${agentResponse.tipo} (confiança: ${(agentResponse.confianca * 100).toFixed(0)}%)`);

    // ── Executar ações do sistema retornadas pelo agente ───────────────
    const allActions: ActionItem[] = [...agentResponse.acoes_sistema];

    // Verificar pagamento confirmado (atualizar LTV + tier)
    if (intent === 'SISTEMA' && clientId) {
      const orderNumber = extractOrderNumber(message);
      if (orderNumber) {
        const { data: order } = await supabase
          .from('orders')
          .select('id, total_amount, status')
          .eq('tenant_id', tenantId)
          .eq('order_number', orderNumber)
          .single();

        if (order && order.total_amount) {
          const newLtv = (clientProfile?.ltv ?? 0) + Number(order.total_amount);
          const { tierAnterior, tierNovo, mudou } = await updateClientTier(supabase, tenantId, clientId, newLtv);

          allActions.push({
            acao:        'atualizar_ltv_tier',
            endpoint:    `/api/clients/${clientId}`,
            payload:     { ltv: newLtv, tier: tierNovo },
            resultado:   'sucesso',
            latencia_ms: 0,
          });

          if (mudou) {
            chainOfThought.push(`⬆️ Tier atualizado: ${tierAnterior} → ${tierNovo} (LTV: R$${newLtv.toFixed(2)})`);
          }

          // Mover kanban para PAGO
          await supabase
            .from('kanban_cards')
            .update({ column_id: 'PAGO', updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('order_id', order.id);

          allActions.push({
            acao:        'mover_kanban_pago',
            endpoint:    `/api/kanban/cards/${order.id}/column`,
            payload:     { coluna: 'PAGO', autor: 'anne_system', motivo: 'pagamento_confirmado_facilzap' },
            resultado:   'sucesso',
            latencia_ms: 0,
          });

          chainOfThought.push(`📊 Kanban: pedido #${orderNumber} movido para PAGO`);
        }
      }
    }

    // ── Agente incapaz → escalonar ──────────────────────────────────────
    if (agentResponse.tipo === 'incapaz') {
      chainOfThought.push('⚠️ Agente incapaz — escalonando para humano');
      await logExecution(supabase, tenantId, {
        clientId:     clientId ?? null,
        chatId,
        tipo:         'erro',
        agente:       agentSlug as AgentSlug,
        gatilho:      `intent:${intent}`,
        confianca:    confidence,
        acoes:        allActions,
        mensagem:     null,
        chainOfThought,
        duracaoMs:    Date.now() - t0,
        requerRevisao: true,
      });

      return NextResponse.json({
        handled:          false,
        reason:           'agente_incapaz',
        requires_human:   agentResponse.requer_aprovacao,
        message_preview:  agentResponse.conteudo,
        chain_of_thought: chainOfThought,
        duration_ms:      Date.now() - t0,
      });
    }

    // ── Registrar ação de log ──────────────────────────────────────────
    const logTipo = agentResponse.tipo === 'mensagem' ? 'ativa' : 'silenciosa';
    chainOfThought.push(
      logTipo === 'ativa'
        ? `📣 Mensagem preparada para envio`
        : `🔇 Ação silenciosa executada (${allActions.length} ações)`
    );

    await logExecution(supabase, tenantId, {
      clientId:     clientId ?? null,
      chatId,
      tipo:         logTipo,
      agente:       agentSlug as AgentSlug,
      gatilho:      `intent:${intent}`,
      confianca:    confidence,
      acoes:        allActions,
      mensagem:     agentResponse.tipo === 'mensagem' ? agentResponse.conteudo : null,
      chainOfThought,
      duracaoMs:    Date.now() - t0,
    });

    // ── Emitir SSE para atualizar UI em tempo real ─────────────────────
    if (typeof globalThis !== 'undefined' && (globalThis as any).sseClients) {
      const rawSse = (globalThis as any).sseClients;
      let tenantClients: Set<{ write: (d: string) => void }> | undefined;
      if (rawSse instanceof Map) {
        tenantClients = rawSse.get(tenantId);
      } else {
        tenantClients = (rawSse as Record<string, Set<{ write: (d: string) => void }> | undefined>)[tenantId];
      }
      if (tenantClients && typeof tenantClients.forEach === 'function') {
        const event = JSON.stringify({
          type:          logTipo === 'ativa' ? 'anne_suggestion' : 'anne_action',
          chat_id:       chatId,
          agent:         agentSlug,
          message:       agentResponse.tipo === 'mensagem' ? agentResponse.conteudo : null,
          actions_count: allActions.length,
        });
        tenantClients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch { /* cliente desconectado */ }
        });
      }
    }

    return NextResponse.json({
      handled:          true,
      intent,
      agent_used:       agentSlug,
      response_type:    agentResponse.tipo,
      message_to_send:  agentResponse.tipo === 'mensagem' ? agentResponse.conteudo : null,
      actions_taken:    allActions,
      chain_of_thought: chainOfThought,
      duration_ms:      Date.now() - t0,
    });

  } catch (err) {
    console.error('[anne/process] Erro:', err);
    return NextResponse.json({ error: 'Erro interno no pipeline', detail: String(err) }, { status: 500 });
  }
}
