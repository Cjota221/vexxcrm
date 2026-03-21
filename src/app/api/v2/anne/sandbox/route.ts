import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { detectPipelineEvent } from '@/lib/services/pipeline-triggers';
import {
  detectCrisis,
  classifyIntent,
  routeToAgent,
  type AgentSlug,
} from '@/lib/services/anne-pipeline';
import {
  runCommercialAgent,
  runLogisticsAgent,
  runFAQAgent,
  runOnboardingAgent,
  runCentralAgent,
} from '@/lib/services/agent-executor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/anne/sandbox
 *
 * Simula o pipeline completo da Anne (regex + LLM) sem efeitos colaterais.
 * Usado no Sandbox da página de configuração.
 *
 * Body: { text: string; from_me?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = auth.tenantId;
    const body = await request.json() as { text: string; from_me?: boolean };
    const { text, from_me = false } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const t0 = Date.now();
    const chain: string[] = [];
    chain.push(`📥 Mensagem recebida: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    chain.push(`🔍 Origem: ${from_me ? 'Bot/Atendente' : 'Cliente'}`);

    // ── Step 1: Detect pipeline event (regex-based) ──────────────────────
    const event = detectPipelineEvent(text, from_me);

    if (event) {
      chain.push(`✅ Padrão detectado: ${event.trigger} (score: ${Math.round(event.score * 100)}%)`);
      chain.push(`🎯 Coluna destino: ${event.targetColumn}`);
      chain.push(`📝 Motivo: ${event.motivo}`);
      if (event.trackingCode) chain.push(`📦 Código de rastreio extraído: ${event.trackingCode}`);
      if (event.orderNumber) chain.push(`🧾 Número do pedido extraído: ${event.orderNumber}`);
      if (event.extractedName) chain.push(`👤 Nome extraído da mensagem: ${event.extractedName}`);
    } else {
      chain.push('💭 Nenhum padrão de pipeline reconhecido.');
    }

    // ── Step 2: For outbound messages, skip LLM pipeline ─────────────────
    if (from_me) {
      chain.push('⏭️ Mensagem de saída (from_me=true) — pipeline LLM não se aplica.');

      // Still fetch automation suggestion for pipeline events
      let messageSuggestion: string | null = null;
      if (event) {
        messageSuggestion = await fetchAutomationMessage(supabase, tenantId, event.trigger);
        if (messageSuggestion) chain.push(`💬 Sugestão de mensagem encontrada para '${event.trigger}'`);
      }

      const sendMode = await fetchSendMode(supabase, tenantId);
      chain.push(`⚙️  Modo de envio global: ${sendMode === 'auto' ? '🤖 Automático' : '🤝 Sugerir para humano'}`);
      chain.push(`⏱️ Tempo total: ${Date.now() - t0}ms`);

      return NextResponse.json({
        event,
        action_preview: event
          ? `Anne moveria o card para ${event.targetColumn}.`
          : 'Nenhuma ação — mensagem de saída.',
        kanban_move: event?.targetColumn ?? null,
        message_suggestion: messageSuggestion,
        chain_of_thought: chain,
        duration_ms: Date.now() - t0,
      });
    }

    // ── Step 3: Inbound message — run intelligent pipeline ───────────────

    // 3a. Crisis detection
    const crisis = detectCrisis(text);
    if (crisis.isCrisis) {
      chain.push(`🚨 CRISE detectada: "${crisis.trigger}" (score: ${Math.round(crisis.score * 100)}%)`);
      chain.push('⚠️ Em produção, faria handover imediato para humano.');
    }

    // 3b. Intent classification
    const { intent, confidence: intentConfidence } = classifyIntent(text);
    chain.push(`🧠 Intenção classificada: ${intent} (confiança: ${Math.round(intentConfidence * 100)}%)`);

    // 3c. Route to agent
    const agentSlug = routeToAgent(intent, true);
    chain.push(`🤖 Agente selecionado: ${agentSlug}`);

    // 3d. Execute agent (LLM call)
    let llmResponse: string | null = null;
    let responseType: string = 'none';
    let agentUsed: string = agentSlug;

    try {
      const agentInput = {
        message: text,
        clientProfile: null,
        tenantId,
        chatId: 'sandbox',
        supabase,
      };

      const agentResult = await executeAgent(agentSlug, agentInput);
      llmResponse = agentResult.conteudo;
      responseType = agentResult.tipo;
      chain.push(`💬 Agente respondeu (tipo: ${agentResult.tipo}, confiança: ${Math.round(agentResult.confianca * 100)}%)`);

      if (agentResult.requer_aprovacao) {
        chain.push('⚠️ Resposta requer aprovação humana antes de enviar.');
      }
      if (agentResult.acoes_sistema.length > 0) {
        chain.push(`🔧 Ações do sistema (${agentResult.acoes_sistema.length}): ${agentResult.acoes_sistema.map(a => a.acao).join(', ')}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      chain.push(`❌ Erro no agente LLM: ${errMsg}`);
      chain.push('ℹ️ Verifique se a API Key está configurada em Conexão → Provedor de IA.');
    }

    // Fetch automation message for pipeline event (if any)
    let messageSuggestion: string | null = null;
    if (event) {
      messageSuggestion = await fetchAutomationMessage(supabase, tenantId, event.trigger);
      if (messageSuggestion) chain.push(`💬 Sugestão de automação para '${event.trigger}'`);
    }

    // The LLM response takes priority as message_suggestion for inbound
    const finalSuggestion = llmResponse || messageSuggestion;

    // Send mode
    const sendMode = await fetchSendMode(supabase, tenantId);
    chain.push(`⚙️  Modo de envio global: ${sendMode === 'auto' ? '🤖 Automático' : '🤝 Sugerir para humano'}`);

    const durationMs = Date.now() - t0;
    chain.push(`⏱️ Tempo total: ${durationMs}ms`);

    // Build action preview
    let actionPreview: string;
    if (crisis.isCrisis) {
      actionPreview = 'Anne faria handover imediato para atendente humano (crise detectada).';
    } else if (llmResponse) {
      actionPreview = sendMode === 'auto'
        ? `Agente ${agentUsed} responderia automaticamente.`
        : `Agente ${agentUsed} sugeriria resposta para aprovação humana.`;
    } else if (event) {
      actionPreview = `Anne moveria o card para ${event.targetColumn}.`;
    } else {
      actionPreview = 'Nenhuma ação — sem padrão de pipeline e sem resposta LLM.';
    }

    return NextResponse.json({
      event,
      action_preview: actionPreview,
      kanban_move: event?.targetColumn ?? null,
      message_suggestion: finalSuggestion,
      chain_of_thought: chain,
      // New intelligent pipeline fields
      intent,
      intent_confidence: intentConfidence,
      agent_used: agentUsed,
      llm_response: llmResponse,
      response_type: responseType,
      is_crisis: crisis.isCrisis,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error('[anne/sandbox]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function executeAgent(slug: AgentSlug, input: Parameters<typeof runCommercialAgent>[0]) {
  switch (slug) {
    case 'comercial':     return runCommercialAgent(input);
    case 'logistica':     return runLogisticsAgent(input);
    case 'faq':           return runFAQAgent(input);
    case 'triagem':       return runOnboardingAgent(input);
    case 'anne_central':  return runCentralAgent(input);
    case 'action_engine': return runCentralAgent(input); // fallback for system intents
  }
}

async function fetchAutomationMessage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  trigger: string,
): Promise<string | null> {
  const ruleMap: Record<string, string> = {
    pedido_recebido: 'payment_confirm',
    pagamento_aprovado: 'payment_confirm',
    primeiro_contato: 'welcome_lead',
  };
  const ruleKey = ruleMap[trigger];
  if (!ruleKey) return null;

  const { data: automation } = await supabase
    .from('anne_automations')
    .select('message_template, send_mode, enabled')
    .eq('tenant_id', tenantId)
    .eq('rule_key', ruleKey)
    .eq('enabled', true)
    .single();

  return automation?.message_template ?? null;
}

async function fetchSendMode(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
): Promise<string> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('anne_send_mode')
    .eq('id', tenantId)
    .single();

  return (tenant as { anne_send_mode?: string } | null)?.anne_send_mode ?? 'suggest';
}
