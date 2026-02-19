/**
 * agent-executor.ts — Os 4 Agentes Especialistas da Anne OS v5.0
 *
 * Cada agente recebe contexto do cliente + base de conhecimento isolada
 * e retorna { tipo, conteudo, confianca, requer_aprovacao, acoes_sistema }.
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

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface AgentInput {
  message: string;
  clientProfile: ClientProfile | null;
  tenantId: string;
  chatId: string;
  supabase: SupabaseClient;
}

// ─── Util: interpolação de template ──────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Util: estimar tokens (aprox 4 chars = 1 token) ──────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 1 — COMERCIAL ATACADO
// ══════════════════════════════════════════════════════════════════════════════

export async function runCommercialAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, supabase } = input;

  const knowledge = await getAgentKnowledge(supabase, tenantId, 'comercial');

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

  // Verificar se base de conhecimento foi configurada
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

  // Detectar tipo de pergunta comercial
  const wantsPrice     = /\b(preço|preco|valor|tabela|quanto custa|custo)\b/i.test(message);
  const wantsGrade     = /\b(grade|numeração|numeracao|tamanho|tam\.?)\b/i.test(message);
  const wantsPayment   = /\b(pagamento|parcelamento|prazo|pix|boleto|cartão|cartao)\b/i.test(message);
  const wantsMOQ       = /\b(mínimo|minimo|moq|quantidade mínima|menor pedido)\b/i.test(message);

  const name = clientProfile?.name?.split(' ')[0] ?? 'Cliente';
  let response = '';

  if (wantsMOQ) {
    response = `${name}, aqui está nossa política de pedido mínimo baseada na tabela configurada:\n\n${knowledge.substring(0, 400)}`;
  } else if (wantsGrade) {
    response = `${name}, sobre grades e numeração:\n\n${knowledge.substring(0, 400)}`;
  } else if (wantsPayment) {
    response = `${name}, nossas condições de pagamento:\n\n${knowledge.substring(0, 400)}`;
  } else if (wantsPrice) {
    response = `${name}, nossa tabela de preços atacado:\n\n${knowledge.substring(0, 400)}`;
  } else {
    response = `${name}, sobre sua consulta comercial:\n\n${knowledge.substring(0, 400)}`;
  }

  await incrementAgentStats(supabase, tenantId, 'comercial', Date.now() - t0);

  return {
    tipo: 'mensagem',
    conteudo: response,
    confianca: 0.82,
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

  // GATILHO A — Código de rastreio detectado
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

    // Mover kanban
    const t2 = Date.now();
    await supabase
      .from('kanban_cards')
      .update({ column_id: 'DESPACHADO', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId);

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

  // GATILHO B — Consulta de prazo
  const wantsDeadline = /\b(prazo|quando chega|dias|entrega|demora|tempo)\b/i.test(message);

  if (wantsDeadline && knowledge) {
    const name = clientProfile?.name?.split(' ')[0] ?? 'Cliente';
    const response = interpolate(
      `${name}, sobre prazos e frete:\n\n${knowledge.substring(0, 300)}`,
      { nome: name },
    );

    await incrementAgentStats(supabase, tenantId, 'logistica', Date.now() - t0);

    return {
      tipo:           'mensagem',
      conteudo:       response,
      confianca:      0.80,
      requer_aprovacao: false,
      acoes_sistema:  [],
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
  const { tenantId, supabase } = input;

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

  // Resposta objetiva a partir da base configurada (máx 3 linhas)
  const lines = knowledge.split('\n').filter(l => l.trim().length > 0).slice(0, 8);
  const response = lines.join('\n');

  await incrementAgentStats(supabase, tenantId, 'faq', Date.now() - t0);

  return {
    tipo:           'mensagem',
    conteudo:       response,
    confianca:      0.78,
    requer_aprovacao: false,
    acoes_sistema:  [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENTE 4 — TRIAGEM & ONBOARDING
// ══════════════════════════════════════════════════════════════════════════════

export async function runOnboardingAgent(input: AgentInput): Promise<AgentResponse> {
  const t0 = Date.now();
  const { message, clientProfile, tenantId, supabase } = input;

  const actions: ActionItem[] = [];

  // Cliente já passou pelo onboarding
  if (clientProfile?.onboarding_concluido) {
    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);
    return {
      tipo:           'incapaz',
      conteudo:       'Cliente já passou pelo onboarding. Rotear para agente adequado.',
      confianca:      0.95,
      requer_aprovacao: false,
      acoes_sistema:  [],
    };
  }

  // Detectar nome na mensagem
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

  // Detectar se já é cliente ativo
  const isExisting = /\b(já compro|sou cliente|já faço pedidos|tenho pedido)\b/i.test(message);
  const isNew      = /\b(estou conhecendo|quero conhecer|primeira vez|novo)\b/i.test(message);

  if (isExisting && clientProfile) {
    // Marcar como ativo
    await supabase
      .from('clients')
      .update({ tier: 'ativo', onboarding_concluido: true })
      .eq('tenant_id', tenantId)
      .eq('id', clientProfile.id);

    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);

    return {
      tipo:           'mensagem',
      conteudo:       `Ótimo, ${clientProfile.name?.split(' ')[0] ?? 'cliente'}! Vou te passar para nosso time comercial para verificar as condições da sua próxima reposição.`,
      confianca:      0.88,
      requer_aprovacao: false,
      acoes_sistema:  actions,
    };
  }

  if (isNew) {
    // Perguntar canal de venda
    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);

    return {
      tipo:           'mensagem',
      conteudo:       `Entendi! Para te passar as melhores condições, me diz: você tem ponto de venda físico, vende online, ou os dois?`,
      confianca:      0.85,
      requer_aprovacao: false,
      acoes_sistema:  actions,
    };
  }

  // Detectar canal de venda
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

    await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);

    return {
      tipo:           'mensagem',
      conteudo:       `Perfeito! Agora vou te conectar com nosso especialista comercial que vai te ajudar a montar sua primeira grade. Um instante!`,
      confianca:      0.90,
      requer_aprovacao: false,
      acoes_sistema:  actions,
    };
  }

  // Saudação inicial — iniciar onboarding
  await incrementAgentStats(supabase, tenantId, 'triagem', Date.now() - t0);

  return {
    tipo:           'mensagem',
    conteudo:       `Olá! Sou a Anne, assistente comercial. Como posso te chamar?`,
    confianca:      0.80,
    requer_aprovacao: false,
    acoes_sistema:  actions,
  };
}
