// ANTES: Throttle via Map em memória (quebrava em serverless), sugestões só via SSE.
// DEPOIS: Throttle persistido em anne_logs_v2 (funciona em Netlify/Vercel),
//         provedor de IA configurável por tenant (Groq / OpenAI / Anthropic / Google),
//         sugestões salvas em anne_suggestions para Realtime frontend.
//         AGENTE: ANNE — atendimento WhatsApp (usa groq.service.ts quando provider='groq').

/**
 * anne-auto-reply.ts — Orquestrador de resposta automática da Anne via WhatsApp
 *
 * Recebe uma mensagem inbound do webhook e executa o pipeline completo:
 *  1. Verifica automacao_suspensa
 *  2. Carrega config do tenant (api_key, model, provider, send_mode)
 *  3. Carrega perfil do cliente
 *  4. Executa pipeline: crise → classificação → roteamento → LLM
 *  5. Qualifica lead (hot/warm/cold) e aplica etiqueta WhatsApp
 *  6. Envia resposta (auto) ou emite sugestão (suggest) via eventBus
 *  7. Log completo em anne_logs_v2
 *
 * Fire-and-forget: nunca bloqueia o webhook, nunca lança exceção.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectCrisis,
  classifyIntent,
  routeToAgent,
  loadClientProfile,
  isAutomationSuspended,
  logExecution,
  type AgentSlug,
} from '@/lib/services/anne-pipeline';
import {
  runCommercialAgent,
  runLogisticsAgent,
  runFAQAgent,
  runOnboardingAgent,
  runCentralAgent,
} from '@/lib/services/agent-executor';
import { chat, type AnneConfig, type AnneMessage } from '@/lib/services/anne.service';
import { sendTextMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { applyLabel } from '@/lib/services/whatsapp-labels';
import { eventBus } from '@/lib/event-bus';

// ─── Throttle: max 1 reply per chat per 30 seconds ──────────────────────────
// Usa anne_logs_v2 para persistir o estado — funciona em ambientes serverless
// onde cada invocação roda em processo isolado (Netlify, Vercel, AWS Lambda).

const THROTTLE_MS = 30_000;

async function isThrottled(
  supabase: SupabaseClient,
  tenantId: string,
  chatId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - THROTTLE_MS).toISOString();
  const { data } = await supabase
    .from('anne_logs_v2')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('chat_id', chatId)
    .eq('tipo', 'ativa')
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();
  return data !== null;
}

// markReplied removido: o próprio logExecution (tipo='ativa') já persiste o
// registro que isThrottled usa para checar. Não há necessidade de chamada extra.

// ─── Human-like delay ────────────────────────────────────────────────────────

function humanDelay(): Promise<void> {
  const ms = 2000 + Math.random() * 3000; // 2-5 seconds
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Lead qualification via LLM ──────────────────────────────────────────────

type LeadTemperature = 'hot' | 'warm' | 'cold';

async function qualifyLead(
  config: AnneConfig,
  message: string,
  conversationHistory: AnneMessage[],
): Promise<LeadTemperature> {
  try {
    const result = await chat(
      {
        ...config,
        maxTokens: 10,
        systemPrompt: `Classifique a temperatura do lead com base na última mensagem e contexto.
Retorne APENAS uma palavra: hot, warm ou cold.
- hot: quer comprar, pede preço, pede pagamento, menciona produto específico
- warm: engajado, faz perguntas, mostra interesse mas não está pronto
- cold: primeira saudação, desinteressado, só navegando`,
      },
      message,
      conversationHistory.slice(-5),
    );
    const temp = result.reply.trim().toLowerCase();
    if (temp === 'hot' || temp === 'warm' || temp === 'cold') return temp;
    return 'warm'; // default
  } catch {
    return 'warm';
  }
}

const LABEL_MAP: Record<LeadTemperature, string> = {
  hot: 'lead_quente',
  warm: 'lead_morno',
  cold: 'lead_frio',
};

// ─── Load tenant config ──────────────────────────────────────────────────────

interface TenantAutoReplyConfig {
  apiKey: string;
  model: string;
  provider: string;
  baseUrl: string | null;
  sendMode: 'auto' | 'suggest';
  systemPrompt: string | null;
  tenantName: string;
}

async function loadTenantConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAutoReplyConfig | null> {
  const { data } = await supabase
    .from('tenants')
    .select('openai_api_key, openai_model, openai_provider, openai_base_url, openai_system_prompt, anne_send_mode, name')
    .eq('id', tenantId)
    .single();

  if (!data?.openai_api_key) return null;

  return {
    apiKey: data.openai_api_key,
    model: data.openai_model || 'gpt-4o-mini',
    provider: data.openai_provider || 'openai',
    baseUrl: data.openai_base_url || null,
    sendMode: data.anne_send_mode === 'suggest' ? 'suggest' : 'auto',
    systemPrompt: data.openai_system_prompt || null,
    tenantName: data.name || 'a loja',
  };
}

// ─── Load conversation history ───────────────────────────────────────────────

async function loadHistory(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string,
  limit = 10,
): Promise<AnneMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  return data.reverse().map(m => ({
    role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: processAutoReply — fire-and-forget orchestrator
// ═════════════════════════════════════════════════════════════════════════════

export interface AutoReplyInput {
  tenantId: string;
  clientId: string;
  conversationId: string;
  remoteJid: string;
  message: string;
  clientPhone: string;
}

export async function processAutoReply(
  supabase: SupabaseClient,
  input: AutoReplyInput,
): Promise<void> {
  const { tenantId, clientId, conversationId, remoteJid, message, clientPhone } = input;
  const t0 = Date.now();
  const chainOfThought: string[] = [];

  try {
    // ── 1. Check throttle ────────────────────────────────────────────────
    if (await isThrottled(supabase, tenantId, conversationId)) {
      console.log(`[auto-reply] Throttled: ${conversationId}`);
      return;
    }

    // ── 2. Check automação suspensa ──────────────────────────────────────
    const suspended = await isAutomationSuspended(supabase, tenantId, conversationId);
    if (suspended) {
      chainOfThought.push('⏸️ Automação suspensa — skip');
      return;
    }

    // ── 3. Load tenant config ────────────────────────────────────────────
    const tenantConfig = await loadTenantConfig(supabase, tenantId);
    if (!tenantConfig) {
      // No API key configured → skip silently
      return;
    }

    chainOfThought.push(`🔧 Config: provider=${tenantConfig.provider}, model=${tenantConfig.model}, mode=${tenantConfig.sendMode}`);

    // ── 4. Load client profile ───────────────────────────────────────────
    const clientProfile = await loadClientProfile(supabase, tenantId, clientId);
    if (clientProfile) {
      chainOfThought.push(`👤 ${clientProfile.name} · ${clientProfile.tier} · LTV R$${clientProfile.ltv.toFixed(2)}`);
    }

    // ── 5. Crisis detection ──────────────────────────────────────────────
    const crisis = detectCrisis(message);
    if (crisis.isCrisis) {
      chainOfThought.push(`🚨 Crise: "${crisis.trigger}" — skip auto-reply, handover handled by pipeline`);
      return; // Let the existing crisis handling in /api/v2/anne/process deal with it
    }

    // ── 6. Classify intent ───────────────────────────────────────────────
    const { intent, confidence } = classifyIntent(message);
    chainOfThought.push(`🔍 Intent: ${intent} (${(confidence * 100).toFixed(0)}%)`);

    // ── 7. Route to agent ────────────────────────────────────────────────
    const isNewClient = !clientProfile || !clientProfile.onboarding_concluido;
    const agentSlug = routeToAgent(intent, isNewClient);
    chainOfThought.push(`🤖 Agente: ${agentSlug}`);

    const agentInput = {
      message,
      clientProfile,
      tenantId,
      chatId: conversationId,
      supabase,
    };

    // ── 8. Execute agent ─────────────────────────────────────────────────
    let agentResponse;

    if (intent === 'SISTEMA') {
      agentResponse = await runLogisticsAgent(agentInput);
    } else if (intent === 'AMBIGUO') {
      agentResponse = await runCentralAgent(agentInput);
    } else {
      switch (agentSlug) {
        case 'comercial': agentResponse = await runCommercialAgent(agentInput); break;
        case 'logistica': agentResponse = await runLogisticsAgent(agentInput);  break;
        case 'faq':       agentResponse = await runFAQAgent(agentInput);        break;
        case 'triagem':
        default:          agentResponse = await runOnboardingAgent(agentInput); break;
      }
    }

    chainOfThought.push(`⚡ Resposta: tipo=${agentResponse.tipo}, confiança=${(agentResponse.confianca * 100).toFixed(0)}%`);

    // ── 9. If agent can't handle → skip (human will take over) ──────────
    if (agentResponse.tipo === 'incapaz') {
      chainOfThought.push('⚠️ Agente incapaz — deixando para atendente humano');

      await logExecution(supabase, tenantId, {
        clientId,
        chatId: conversationId,
        tipo: 'erro',
        agente: agentSlug as AgentSlug,
        gatilho: `auto-reply:${intent}`,
        confianca: confidence,
        acoes: agentResponse.acoes_sistema,
        mensagem: null,
        chainOfThought,
        duracaoMs: Date.now() - t0,
        requerRevisao: true,
      });
      return;
    }

    // Skip silent actions (no message to send)
    if (agentResponse.tipo !== 'mensagem' || !agentResponse.conteudo) {
      chainOfThought.push('🔇 Ação silenciosa — sem mensagem para enviar');

      await logExecution(supabase, tenantId, {
        clientId,
        chatId: conversationId,
        tipo: 'silenciosa',
        agente: agentSlug as AgentSlug,
        gatilho: `auto-reply:${intent}`,
        confianca: confidence,
        acoes: agentResponse.acoes_sistema,
        mensagem: null,
        chainOfThought,
        duracaoMs: Date.now() - t0,
      });
      return;
    }

    const replyText = agentResponse.conteudo;

    // ── 10. Qualify lead (fire-and-forget) ───────────────────────────────
    const history = await loadHistory(supabase, tenantId, conversationId);
    qualifyAndLabel(
      { ...tenantConfig, maxTokens: 10 } as AnneConfig,
      message,
      history,
      clientPhone,
      supabase,
      tenantId,
      clientId,
    ).catch(err => console.warn('[auto-reply] Erro na qualificação:', err));

    // ── 11. Send or suggest ──────────────────────────────────────────────
    if (tenantConfig.sendMode === 'auto') {
      // Human-like delay
      await humanDelay();

      // Send via Evolution API
      const evoConfig = getTenantEvolutionConfig(tenantId);
      try {
        await sendTextMessage(evoConfig, remoteJid, replyText);
        chainOfThought.push('📤 Mensagem enviada via WhatsApp');

        // Save the outbound message to DB
        await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          client_id: clientId,
          direction: 'outbound',
          sender_name: 'Anne (IA)',
          content: replyText,
          type: 'text',
          status: 'sent',
          created_at: new Date().toISOString(),
        });

        // Emit SSE for real-time UI update
        eventBus.emitToTenant('new_message', tenantId, {
          client_id: clientId,
          message: {
            conversation_id: conversationId,
            direction: 'outbound',
            sender_name: 'Anne (IA)',
            content: replyText,
            type: 'text',
            status: 'sent',
            created_at: new Date().toISOString(),
          },
        });
      } catch (sendErr) {
        console.error('[auto-reply] Erro ao enviar WhatsApp:', sendErr);
        chainOfThought.push(`❌ Erro no envio: ${String(sendErr)}`);
      }
    } else {
      // suggest mode — persistir no banco (SSE in-memory não funciona em serverless)
      // O AnneSuggestionCard no ChatArea lê de anne_suggestions via Realtime/polling.
      await supabase.from('anne_suggestions').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        client_id: clientId,
        agent: agentSlug,
        intent,
        confidence,
        mensagem: replyText,
        status: 'pending',
      });

      // Emitir SSE como canal secundário (funciona em ambientes não-serverless)
      eventBus.emitToTenant('anne_suggestion', tenantId, {
        type: 'anne_suggestion',
        chat_id: conversationId,
        client_id: clientId,
        agent: agentSlug,
        message: replyText,
        intent,
        confidence,
      });

      chainOfThought.push('💡 Sugestão persistida no banco e emitida para frontend');
    }

    // ── 12. Log execution ────────────────────────────────────────────────
    await logExecution(supabase, tenantId, {
      clientId,
      chatId: conversationId,
      tipo: 'ativa',
      agente: agentSlug as AgentSlug,
      gatilho: `auto-reply:${intent}`,
      confianca: confidence,
      acoes: agentResponse.acoes_sistema,
      mensagem: replyText,
      chainOfThought,
      duracaoMs: Date.now() - t0,
    });

  } catch (err) {
    // Fire-and-forget: NEVER crash the webhook
    console.error('[auto-reply] Erro fatal:', err);
    try {
      await logExecution(supabase, tenantId, {
        clientId,
        chatId: conversationId,
        tipo: 'erro',
        agente: 'anne_central',
        gatilho: 'auto-reply:error',
        confianca: 0,
        acoes: [],
        mensagem: null,
        chainOfThought: [...chainOfThought, `💥 Erro: ${String(err)}`],
        duracaoMs: Date.now() - t0,
        requerRevisao: true,
      });
    } catch { /* swallow logging error */ }
  }
}

// ─── Helper: qualify lead and apply label ────────────────────────────────────

async function qualifyAndLabel(
  config: AnneConfig,
  message: string,
  history: AnneMessage[],
  clientPhone: string,
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<void> {
  const temperature = await qualifyLead(config, message, history);
  const labelName = LABEL_MAP[temperature];

  // Apply WhatsApp label
  await applyLabel(clientPhone, labelName);

  // Remove old lead labels and apply new one
  const allLabels = Object.values(LABEL_MAP);
  const tagsToRemove = allLabels.filter(l => l !== labelName);

  // Update client tags in DB
  const { data: client } = await supabase
    .from('clients')
    .select('tags')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .single();

  const currentTags: string[] = client?.tags ?? [];
  const newTags = [
    ...currentTags.filter(t => !tagsToRemove.includes(t) && t !== labelName),
    labelName,
  ];

  await supabase
    .from('clients')
    .update({ tags: newTags })
    .eq('tenant_id', tenantId)
    .eq('id', clientId);
}
