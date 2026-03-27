/**
 * agent-executor.ts — Os 4 Agentes Especialistas da Anne OS v5.0
 *
 * Cada agente recebe contexto do cliente + base de conhecimento isolada,
 * chama o LLM via chat() de anne.service.ts, e retorna { tipo, conteudo,
 * confianca, requer_aprovacao, acoes_sistema }.
 *
 * Os agentes NÃO respondem diretamente ao cliente — retornam para Anne Central.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ClientProfile,
  type AgentResponse,
  type ActionItem,
  extractTrackingCode,
  extractOrderNumber,
  getAgentKnowledge,
  incrementAgentStats,
} from '@/lib/services/anne-pipeline';
import { chat, type AnneConfig, type AnneMessage } from '@/lib/services/anne.service';

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface AgentInput {
  message: string;
  clientProfile: ClientProfile | null;
  tenantId: string;
  chatId: string;
  supabase: SupabaseClient;
}

// ─── Util: estimar tokens (aprox 4 chars = 1 token) ──────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Helpers: carregar config do tenant e system_prompt do agente ─────────────

async function loadTenantAIConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ apiKey: string; model: string; provider: string; baseUrl: string | null; tenantName: string } | null> {
  const { data } = await supabase
    .from('tenants')
    .select('openai_api_key, openai_model, openai_provider, openai_base_url, name')
    .eq('id', tenantId)
    .single();

  if (!data?.openai_api_key) return null;

  return {
    apiKey: data.openai_api_key,
    model: data.openai_model || 'gpt-4o-mini',
    provider: data.openai_provider || 'openai',
    baseUrl: data.openai_base_url || null,
    tenantName: data.name || 'a loja',
  };
}

async function loadAgentConfig(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<{ system_prompt: string | null; knowledge_base: string | null } | null> {
  const { data } = await supabase
    .from('anne_agents')
    .select('system_prompt, knowledge_base')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .single();
  return data ?? null;
}

async function loadConversationHistory(
  supabase: SupabaseClient,
  tenantId: string,
  chatId: string,
  limit = 10,
): Promise<AnneMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', chatId)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  // Reverse to get chronological order, then map to AnneMessage format
  return data.reverse().map(m => ({
    role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));
}

function buildClientContext(profile: ClientProfile | null): string {
  if (!profile) return 'Cliente novo — nenhum histórico disponível.';
  return [
    `Nome: ${profile.name}`,
    `Tier: ${profile.tier}`,
    `LTV: R$${profile.ltv.toFixed(2)}`,
    `Total pedidos: ${profile.total_orders}`,
    profile.last_order_at ? `Último pedido: ${profile.last_order_at}` : null,
    `Tom histórico: ${profile.tom_historico}`,
    profile.flags.length > 0 ? `Flags: ${profile.flags.join(', ')}` : null,
    `Onboarding concluído: ${profile.onboarding_concluido ? 'sim' : 'não'}`,
  ].filter(Boolean).join('\n');
}

async function callAgentLLM(
  supabase: SupabaseClient,
  tenantId: string,
  chatId: string,
  agentSlug: string,
  message: string,
  clientProfile: ClientProfile | null,
  fallbackSystemPrompt: string,
): Promise<{ reply: string; usedLLM: boolean }> {
  const tenantConfig = await loadTenantAIConfig(supabase, tenantId);
  if (!tenantConfig) {
    return { reply: '', usedLLM: false };
  }

  const agentConfig = await loadAgentConfig(supabase, tenantId, agentSlug);
  const history = await loadConversationHistory(supabase, tenantId, chatId);

  // Build combined system prompt
  const basePrompt = agentConfig?.system_prompt || fallbackSystemPrompt;
  const knowledgeSection = agentConfig?.knowledge_base
    ? `\n\n## Base de Conhecimento\n${agentConfig.knowledge_base}`
    : '';
  const clientSection = `\n\n## Perfil do Cliente\n${buildClientContext(clientProfile)}`;

  const systemPrompt = `${basePrompt}${knowledgeSection}${clientSection}

## Regras
- Responda em português brasileiro, de forma natural e conversacional.
- Máximo 3 parágrafos curtos. Sem formalidade excessiva.
- NUNCA invente informações que não estejam na base de conhecimento.
- Use o nome do cliente quando disponível.
- Se não souber responder, diga claramente.`;

  const config: AnneConfig = {
    apiKey: tenantConfig.apiKey,
    model: tenantConfig.model,
    provider: tenantConfig.provider as AnneConfig['provider'],
    baseUrl: tenantConfig.baseUrl || undefined,
    systemPrompt,
    maxTokens: 500,
  };

  const response = await chat(config, message, history);
  return { reply: response.reply, usedLLM: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 1 — COMERCIAL ATACADO
// ══════════════════════════════════════════════════════════════════════════════

export async function runCommercialAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, chatId, supabase } = input;

  // Verificar se está pedindo condição especial (requer aprovação humana)
  const requiresApproval = /\b(fora da tabela|condição especial|desconto extra|excepcion|abrir exceção)\b/i.test(message);

  if (requiresApproval) {
    await incrementAgentStats(supabase, tenantId, 'comercial', Date.now() - t0);
    return {
      tipo: 'incapaz',
      conteudo: 'Cliente solicitou condição especial fora da tabela configurada.',
      confianca: 0.95,
      requer_aprovacao: true,
      acoes_sistema: [],
    };
  }

  const knowledge = await getAgentKnowledge(supabase, tenantId, 'comercial');

  if (!knowledge || knowledge.trim().length < 50) {
    await incrementAgentStats(supabase, tenantId, 'comercial', Date.now() - t0);
    return {
      tipo: 'incapaz',
      conteudo: 'Base de conhecimento comercial não configurada. Configure em Central de Comando → Agente Comercial.',
      confianca: 0.3,
      requer_aprovacao: false,
      acoes_sistema: [],
    };
  }

  // Call LLM for natural response
  const fallbackPrompt = `Você é a Anne, especialista comercial atacado. Ajude o cliente com informações sobre preços, grades, condições de pagamento e pedido mínimo. Use APENAS informações da base de conhecimento fornecida.`;

  try {
    const { reply, usedLLM } = await callAgentLLM(supabase, tenantId, chatId, 'comercial', message, clientProfile, fallbackPrompt);

    if (usedLLM && reply) {
      await incrementAgentStats(supabase, tenantId, 'comercial', Date.now() - t0);
      return {
        tipo: 'mensagem',
        conteudo: reply,
        confianca: 0.88,
        requer_aprovacao: false,
        acoes_sistema: [],
      };
    }
  } catch (err) {
    console.warn('[agent-executor] Erro LLM comercial, usando fallback:', err);
  }

  // Fallback: knowledge_base snippet
  const name = clientProfile?.name?.split(' ')[0] ?? 'Cliente';
  const response = `${name}, aqui estão as informações comerciais:\n\n${knowledge.substring(0, 400)}`;

  await incrementAgentStats(supabase, tenantId, 'comercial', Date.now() - t0);

  return {
    tipo: 'mensagem',
    conteudo: response,
    confianca: 0.75,
    requer_aprovacao: false,
    acoes_sistema: [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 2 — LOGÍSTICA & RASTREAMENTO
// ══════════════════════════════════════════════════════════════════════════════

export async function runLogisticsAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, chatId, supabase } = input;

  const knowledge = await getAgentKnowledge(supabase, tenantId, 'logistica');
  const actions: ActionItem[] = [];

  // GATILHO A — Código de rastreio detectado (action-based, no LLM needed)
  const trackingResult = extractTrackingCode(message);

  if (trackingResult) {
    const orderNumber = extractOrderNumber(message);
    let orderId: string | null = null;

    // Estratégia 1: pedido_id explícito
    if (orderNumber) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, client_id')
        .eq('tenant_id', tenantId)
        .eq('order_number', orderNumber)
        .single();
      if (order) orderId = order.id;
    }

    // Estratégia 2: pedido mais recente com status aguardando_despacho
    if (!orderId && clientProfile) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientProfile.id)
        .in('status', ['aguardando_despacho', 'confirmado', 'processando'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (orders?.[0]) orderId = orders[0].id;
    }

    if (!orderId) {
      await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);
      return {
        tipo: 'incapaz',
        conteudo: `Detectei o código ${trackingResult.code} mas não encontrei pedido correspondente. Escalonando para operador.`,
        confianca: 0.9,
        requer_aprovacao: true,
        acoes_sistema: [],
      };
    }

    // Vincular rastreio
    const t1 = Date.now();
    await supabase
      .from('orders')
      .update({
        tracking_code:  trackingResult.code,
        tracking_url:   `https://rastreamento.correios.com.br/app/index.php?objetos=${trackingResult.code}`,
        updated_at:     new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', orderId);

    actions.push({
      acao:      'vincular_rastreio',
      endpoint:  `/api/orders/${orderId}`,
      payload:   { tracking_code: trackingResult.code, carrier: trackingResult.carrier },
      resultado: 'sucesso',
      latencia_ms: Date.now() - t1,
    });

    // Mover kanban → DESPACHADO (upsert garante criação do card se ainda não existe)
    const t2 = Date.now();
    await supabase
      .from('kanban_cards')
      .upsert(
        {
          tenant_id: tenantId,
          chat_id: chatId,
          client_id: clientProfile!.id,
          coluna: 'DESPACHADO',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,chat_id' }
      );

    actions.push({
      acao:        'mover_kanban',
      endpoint:    `/api/kanban/cards/${orderId}/column`,
      payload:     { coluna: 'DESPACHADO', autor: 'agente_logistica' },
      resultado:   'sucesso',
      latencia_ms: Date.now() - t2,
    });

    await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);

    return {
      tipo:           'silenciosa' as unknown as 'acao',
      conteudo:       `Vinculei rastreio ${trackingResult.code} (${trackingResult.carrier}) ao pedido #${orderNumber ?? orderId}. Card movido para Despachado.`,
      confianca:      0.95,
      requer_aprovacao: false,
      acoes_sistema:  actions,
    };
  }

  // GATILHO B — Consulta de logística via LLM
  const fallbackPrompt = `Você é a Anne, especialista em logística e entregas. Ajude o cliente com informações sobre prazos, frete, rastreamento e status de entrega. Use APENAS informações da base de conhecimento fornecida. Se o cliente mencionar um código de rastreio, informe o link de rastreamento.`;

  try {
    const { reply, usedLLM } = await callAgentLLM(supabase, tenantId, chatId, 'logistica', message, clientProfile, fallbackPrompt);

    if (usedLLM && reply) {
      await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);
      return {
        tipo: 'mensagem',
        conteudo: reply,
        confianca: 0.85,
        requer_aprovacao: false,
        acoes_sistema: [],
      };
    }
  } catch (err) {
    console.warn('[agent-executor] Erro LLM logística, usando fallback:', err);
  }

  // Fallback: knowledge snippet if available
  if (knowledge) {
    const name = clientProfile?.name?.split(' ')[0] ?? 'Cliente';
    await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);
    return {
      tipo: 'mensagem',
      conteudo: `${name}, sobre prazos e frete:\n\n${knowledge.substring(0, 300)}`,
      confianca: 0.70,
      requer_aprovacao: false,
      acoes_sistema: [],
    };
  }

  await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);

  return {
    tipo:           'incapaz',
    conteudo:       'Não identifiquei código de rastreio nem consulta de prazo clara.',
    confianca:      0.4,
    requer_aprovacao: false,
    acoes_sistema:  [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 3 — FAQ & INSTITUCIONAL
// ══════════════════════════════════════════════════════════════════════════════

export async function runFAQAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, chatId, supabase } = input;

  const knowledge = await getAgentKnowledge(supabase, tenantId, 'faq');

  if (!knowledge || knowledge.trim().length < 30) {
    await incrementAgentStats(supabase, tenantId, 'faq', Date.now() - t0);
    return {
      tipo:           'incapaz',
      conteudo:       'Base de conhecimento FAQ não configurada. Configure em Central de Comando → Agente FAQ.',
      confianca:      0.3,
      requer_aprovacao: false,
      acoes_sistema:  [],
    };
  }

  // Call LLM for natural response
  const fallbackPrompt = `Você é a Anne, especialista em informações institucionais. Responda perguntas sobre a loja (endereço, horário, formas de pagamento, redes sociais, CNPJ, etc) usando APENAS a base de conhecimento fornecida. Seja objetiva e direta.`;

  try {
    const { reply, usedLLM } = await callAgentLLM(supabase, tenantId, chatId, 'faq', message, clientProfile, fallbackPrompt);

    if (usedLLM && reply) {
      await incrementAgentStats(supabase, tenantId, 'faq', Date.now() - t0);
      return {
        tipo: 'mensagem',
        conteudo: reply,
        confianca: 0.85,
        requer_aprovacao: false,
        acoes_sistema: [],
      };
    }
  } catch (err) {
    console.warn('[agent-executor] Erro LLM FAQ, usando fallback:', err);
  }

  // Fallback: raw knowledge lines
  const lines = knowledge.split('\n').filter(l => l.trim().length > 0).slice(0, 8);
  const response = lines.join('\n');

  await incrementAgentStats(supabase, tenantId, 'faq', Date.now() - t0);

  return {
    tipo:           'mensagem',
    conteudo:       response,
    confianca:      0.70,
    requer_aprovacao: false,
    acoes_sistema:  [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 4 — TRIAGEM & ONBOARDING
// ══════════════════════════════════════════════════════════════════════════════

export async function runOnboardingAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, chatId, supabase } = input;

  const actions: ActionItem[] = [];

  // Detectar nome na mensagem e salvar
  const nameMatch = message.match(/(?:me chamo|sou|meu nome é|é)\s+([A-ZÀ-Ú][a-zA-ZÀ-ú]+)/i)
    ?? message.match(/^([A-ZÀ-Ú][a-zA-ZÀ-ú]+)\s/);

  if (nameMatch && clientProfile) {
    const extractedName = nameMatch[1];
    const t1 = Date.now();
    await supabase
      .from('clients')
      .update({ name: extractedName })
      .eq('tenant_id', tenantId)
      .eq('id', clientProfile.id);

    actions.push({
      acao:        'atualizar_nome',
      endpoint:    `/api/clients/${clientProfile.id}`,
      payload:     { name: extractedName },
      resultado:   'sucesso',
      latencia_ms: Date.now() - t1,
    });
  }

  // Detectar canal de venda e save
  const canalFisico = /\b(física|fisico|loja|physical|presencial)\b/i.test(message);
  const canalOnline = /\b(online|internet|site|instagram|marketplace)\b/i.test(message);

  if ((canalFisico || canalOnline) && clientProfile) {
    const canal = canalFisico && canalOnline ? 'ambos' : canalFisico ? 'fisico' : 'online';

    await supabase
      .from('clients')
      .update({ canal_venda: canal, onboarding_concluido: true })
      .eq('tenant_id', tenantId)
      .eq('id', clientProfile.id);

    actions.push({
      acao:        'salvar_canal_venda',
      endpoint:    `/api/clients/${clientProfile.id}`,
      payload:     { canal_venda: canal, onboarding_concluido: true },
      resultado:   'sucesso',
      latencia_ms: 0,
    });
  }

  // Detectar se já é cliente ativo e save
  const isExisting = /\b(já compro|sou cliente|já faço pedidos|tenho pedido)\b/i.test(message);
  if (isExisting && clientProfile) {
    await supabase
      .from('clients')
      .update({ tier: 'ativo', onboarding_concluido: true })
      .eq('tenant_id', tenantId)
      .eq('id', clientProfile.id);
  }

  // Call LLM for natural onboarding/triagem response
  const fallbackPrompt = `Você é a Anne, responsável pela triagem e onboarding de novos clientes. Sua missão:
- Dar boas-vindas calorosas
- Descobrir o nome do cliente (se ainda não temos)
- Entender se é cliente novo ou existente
- Se novo: perguntar se vende em loja física, online, ou ambos
- Se existente: encaminhar para o time comercial
- Sempre ser acolhedora e objetiva
- Não ultrapassar 2 parágrafos por resposta`;

  try {
    const { reply, usedLLM } = await callAgentLLM(supabase, tenantId, chatId, 'triagem', message, clientProfile, fallbackPrompt);

    if (usedLLM && reply) {
      await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);
      return {
        tipo: 'mensagem',
        conteudo: reply,
        confianca: 0.85,
        requer_aprovacao: false,
        acoes_sistema: actions,
      };
    }
  } catch (err) {
    console.warn('[agent-executor] Erro LLM triagem, usando fallback:', err);
  }

  // Fallback: hardcoded responses (original behavior)
  if (isExisting && clientProfile) {
    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);
    return {
      tipo: 'mensagem',
      conteudo: `Ótimo, ${clientProfile.name?.split(' ')[0] ?? 'cliente'}! Vou te passar para nosso time comercial para verificar as condições da sua próxima reposição.`,
      confianca: 0.80,
      requer_aprovacao: false,
      acoes_sistema: actions,
    };
  }

  if (clientProfile?.onboarding_concluido) {
    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);
    return {
      tipo: 'incapaz',
      conteudo: 'Cliente já passou pelo onboarding. Rotear para agente adequado.',
      confianca: 0.95,
      requer_aprovacao: false,
      acoes_sistema: [],
    };
  }

  await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);

  return {
    tipo: 'mensagem',
    conteudo: `Olá! Sou a Anne, assistente comercial. Como posso te chamar?`,
    confianca: 0.75,
    requer_aprovacao: false,
    acoes_sistema: actions,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE CENTRAL — Usado para AMBIGUO e fallback geral
// ══════════════════════════════════════════════════════════════════════════════

export async function runCentralAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, chatId, supabase } = input;

  const fallbackPrompt = `Você é a Anne, assistente inteligente de atendimento ao cliente via WhatsApp. O cliente enviou uma mensagem que não se encaixou claramente em nenhuma categoria (comercial, logística, FAQ). Analise o contexto e responda da melhor forma possível:
- Se for uma saudação, responda de forma calorosa e pergunte como pode ajudar
- Se for uma pergunta, tente responder com base no contexto disponível
- Se não souber, diga claramente e ofereça encaminhar para um atendente humano
- Seja natural, conversacional e objetiva. Máximo 2 parágrafos.`;

  try {
    const { reply, usedLLM } = await callAgentLLM(supabase, tenantId, chatId, 'anne_central', message, clientProfile, fallbackPrompt);

    if (usedLLM && reply) {
      await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);
      return {
        tipo: 'mensagem',
        conteudo: reply,
        confianca: 0.75,
        requer_aprovacao: false,
        acoes_sistema: [],
      };
    }
  } catch (err) {
    console.warn('[agent-executor] Erro LLM central:', err);
  }

  // Fallback if no LLM available
  const name = clientProfile?.name?.split(' ')[0] ?? '';
  const greeting = name ? `Oi, ${name}! ` : 'Oi! ';

  return {
    tipo: 'mensagem',
    conteudo: `${greeting}Pode me contar mais sobre o que você precisa? Estou aqui para ajudar com informações comerciais, rastreamento de pedidos, ou qualquer dúvida sobre a loja 😊`,
    confianca: 0.60,
    requer_aprovacao: false,
    acoes_sistema: [],
  };
}
