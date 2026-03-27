/**
 * anne-pipeline.ts — Núcleo do orquestrador Anne OS v5.0
 *
 * Implementa o pipeline de 7 etapas:
 *  L0 → Normalização da entrada
 *  L1 → Carregar memória (perfil + histórico)
 *  L2 → Filtro de crise (handover imediato se detectado)
 *  L3 → Classificar intenção
 *  L4 → Rotear para agente especialista
 *  L5 → Action Engine (mutações no sistema)
 *  L6 → Log completo de cada execução
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type IntentCategory =
  | 'COMERCIAL'
  | 'LOGISTICA'
  | 'INSTITUCIONAL'
  | 'ONBOARDING'
  | 'SISTEMA'
  | 'AMBIGUO';

export type AgentSlug =
  | 'comercial'
  | 'logistica'
  | 'faq'
  | 'triagem'
  | 'anne_central'
  | 'action_engine';

export type LogTipo = 'silenciosa' | 'ativa' | 'handover' | 'erro';

export interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  tier: 'lead' | 'ativo' | 'vip' | 'key_account';
  ltv: number;
  total_orders: number;
  last_order_at: string | null;
  tom_historico: 'formal' | 'informal' | 'tecnico' | 'neutro';
  flags: string[];
  onboarding_concluido: boolean;
  tentativas_reativacao: number;
}

export interface PipelineInput {
  tenantId: string;
  chatId: string;
  clientId: string | null;
  message: string;
  fromMe: boolean;
  messageId?: string;
}

export interface ActionItem {
  acao: string;
  endpoint: string;
  payload: Record<string, unknown>;
  resultado?: 'sucesso' | 'erro' | 'retry';
  latencia_ms?: number;
}

export interface AgentResponse {
  tipo: 'mensagem' | 'acao' | 'incapaz';
  conteudo: string;
  confianca: number;
  requer_aprovacao: boolean;
  acoes_sistema: ActionItem[];
}

export interface PipelineResult {
  handled: boolean;
  intent: IntentCategory | null;
  agentUsed: AgentSlug | null;
  actionsTaken: ActionItem[];
  messageSent: string | null;
  chainOfThought: string[];
  isCrisis: boolean;
  handoverId: string | null;
  durationMs: number;
}

// ─── Palavras-chave de crise ───────────────────────────────────────────────────

const CRISIS_KEYWORDS = [
  'defeito', 'problema', 'estorno', 'reembolso', 'errado', 'trocado',
  'cancelar', 'reclamação', 'reclamacao', 'processo', 'advogado',
  'procon', 'reclame aqui', 'absurdo', 'inaceitável', 'inaceitavel',
  'ridículo', 'ridiculo', 'não resolvo', 'nao resolvo',
  'me engana', 'mentira', 'prejuízo', 'prejuizo',
];

// ─── Padrões de classificação de intenção ─────────────────────────────────────

const INTENT_PATTERNS: Record<IntentCategory, RegExp[]> = {
  COMERCIAL: [
    /\b(preço|preco|valor|tabela|grade|moc|moq|desconto|condição|condicao|parcelamento|atacado|novo|lançamento|lancamento|promoção|promocao|pedido mínimo)\b/i,
  ],
  LOGISTICA: [
    /\b(rastreio|rastreamento|entrega|prazo|frete|transportadora|correios|jadlog|despacho|chegou|chegando|atrasado)\b/i,
    /\b(pedido|encomenda)\b.*\b(quando|prazo|entrega|chegou)\b/i,
  ],
  INSTITUCIONAL: [
    /\b(endereço|endereco|horário|horario|atendimento|pagamento|cnpj|nota fiscal|redes sociais|instagram|site|whatsapp)\b/i,
  ],
  ONBOARDING: [
    /^(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e aí|e ai|quero conhecer|primeiro contato)\b/i,
  ],
  SISTEMA: [
    /\b(pagamento aprovado|pedido confirmado|pag\.\s?aprovado|payment\.confirmed)\b/i,
    /facilzap/i,
  ],
  AMBIGUO: [],
};

// ─── Detecção de crise ─────────────────────────────────────────────────────────

export function detectCrisis(message: string): { isCrisis: boolean; trigger: string | null; score: number } {
  const lower = message.toLowerCase();

  for (const keyword of CRISIS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isCrisis: true, trigger: keyword, score: 0.95 };
    }
  }

  // Heurísticas de tom
  const exclamations = (message.match(/!/g) ?? []).length;
  const upperRatio = (message.replace(/[^A-ZÀ-Ú]/g, '').length) / Math.max(message.replace(/\s/g, '').length, 1);

  if (exclamations >= 3) return { isCrisis: true, trigger: `${exclamations} exclamações`, score: 0.7 };
  if (upperRatio > 0.5 && message.length > 10) return { isCrisis: true, trigger: 'caps excessivo', score: 0.65 };

  return { isCrisis: false, trigger: null, score: 0 };
}

// ─── Classificação de intenção ─────────────────────────────────────────────────

export function classifyIntent(message: string): { intent: IntentCategory; confidence: number } {
  const scores: Partial<Record<IntentCategory, number>> = {};

  for (const [category, patterns] of Object.entries(INTENT_PATTERNS) as [IntentCategory, RegExp[]][]) {
    if (category === 'AMBIGUO') continue;
    const matches = patterns.filter(p => p.test(message)).length;
    if (matches > 0) {
      scores[category] = matches / patterns.length;
    }
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return { intent: 'AMBIGUO', confidence: 0.3 };
  const [topIntent, topScore] = sorted[0];
  if (topScore < 0.75 && sorted.length > 1) return { intent: 'AMBIGUO', confidence: topScore };

  return { intent: topIntent as IntentCategory, confidence: Math.min(1, topScore + 0.4) };
}

// ─── Roteamento de intenção → agente ──────────────────────────────────────────

export function routeToAgent(intent: IntentCategory, isNewClient: boolean): AgentSlug {
  if (isNewClient) return 'triagem';
  const map: Record<IntentCategory, AgentSlug> = {
    COMERCIAL:     'comercial',
    LOGISTICA:     'logistica',
    INSTITUCIONAL: 'faq',
    ONBOARDING:    'triagem',
    SISTEMA:       'action_engine',
    AMBIGUO:       'anne_central',
  };
  return map[intent];
}

// ─── Carregar perfil do cliente (memória de longo prazo) ──────────────────────

export async function loadClientProfile(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<ClientProfile | null> {
  const { data } = await supabase
    .from('clients')
    .select('id, name, phone, tier, ltv, total_orders, last_order_at, tom_historico, flags, onboarding_concluido, tentativas_reativacao')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name ?? 'Cliente',
    phone: data.phone ?? '',
    tier: data.tier ?? 'lead',
    ltv: data.ltv ?? 0,
    total_orders: data.total_orders ?? 0,
    last_order_at: data.last_order_at ?? null,
    tom_historico: data.tom_historico ?? 'neutro',
    flags: data.flags ?? [],
    onboarding_concluido: data.onboarding_concluido ?? false,
    tentativas_reativacao: data.tentativas_reativacao ?? 0,
  };
}

// ─── Calcular tier por LTV ────────────────────────────────────────────────────

export function calcTier(ltv: number): ClientProfile['tier'] {
  if (ltv >= 10000) return 'key_account';
  if (ltv >= 2000)  return 'vip';
  if (ltv >= 500)   return 'ativo';
  return 'lead';
}

// ─── Log de execução ──────────────────────────────────────────────────────────

export async function logExecution(
  supabase: SupabaseClient,
  tenantId: string,
  params: {
    clientId: string | null;
    chatId: string;
    tipo: LogTipo;
    agente: AgentSlug;
    gatilho: string;
    confianca: number;
    acoes: ActionItem[];
    mensagem: string | null;
    chainOfThought: string[];
    duracaoMs: number;
    requerRevisao?: boolean;
  },
): Promise<void> {
  await supabase.from('anne_logs_v2').insert({
    tenant_id:               tenantId,
    client_id:               params.clientId,
    chat_id:                 params.chatId,
    tipo:                    params.tipo,
    agente_executor:         params.agente,
    gatilho_ativado:         params.gatilho,
    confianca_classificacao: params.confianca,
    acoes_executadas:        params.acoes,
    mensagem_enviada:        params.mensagem,
    chain_of_thought:        params.chainOfThought,
    duracao_total_ms:        params.duracaoMs,
    requer_revisao:          params.requerRevisao ?? false,
  });
}

// ─── Extrair código de rastreio da mensagem ───────────────────────────────────

const TRACKING_PATTERNS = [
  // Correios: AA123456789BR (2 letras + 9 dígitos + BR)
  { name: 'Correios',      regex: /\b([A-Z]{2}\d{9}BR)\b/i },
  // Jadlog: JD + 10 dígitos
  { name: 'Jadlog',        regex: /\b(JD\d{10})\b/i },
  // Total Express: TE + 12 dígitos
  { name: 'Total Express', regex: /\b(TE\d{12})\b/i },
  // J&T Express: numérico puro 13–16 dígitos (ex: 888030596633760)
  { name: 'J&T Express',   regex: /\b(\d{13,16})\b/ },
  // Loggi/Frete Fácil: FZ + alfanumérico 14–16 chars (ex: FZ28431185C10529F)
  { name: 'Loggi',         regex: /\b(FZ[A-Z0-9]{12,16})\b/i },
  // Shopee Xpress: SP + alfanumérico
  { name: 'Shopee Xpress', regex: /\b(SP[A-Z0-9]{10,16})\b/i },
  // Sequoia / Azul: números longos com letras
  { name: 'Sequoia',       regex: /\b(SEQ[A-Z0-9]{8,14})\b/i },
  // Genérico alfanumérico: pelo menos 10 chars com mix letras+números (não só dígitos)
  // Evita capturar números de pedido (que são 100% numéricos e curtos)
  { name: 'Genérico',      regex: /\b([A-Z]{1,3}[0-9]{6,}[A-Z0-9]{0,8}|[A-Z0-9]{3,}[0-9]{8,})\b/ },
];

export function extractTrackingCode(message: string): { code: string; carrier: string } | null {
  for (const p of TRACKING_PATTERNS) {
    const match = message.match(p.regex);
    if (match) return { code: match[1].toUpperCase().trim(), carrier: p.name };
  }
  return null;
}

// ─── Extrair número de pedido da mensagem ─────────────────────────────────────

export function extractOrderNumber(message: string): string | null {
  // Prioridade: explícito com "pedido" ou "#" antes do número
  const match = message.match(/pedido\s?#?\s?(\d{3,9})/i)
    ?? message.match(/#(\d{4,9})\b/);
  if (match) return match[1];

  // Fallback: número solto de 4–8 dígitos (evita capturar códigos J&T com 13+ dígitos)
  const fallback = message.match(/\b(\d{4,8})\b/);
  return fallback ? fallback[1] : null;
}

// ─── Verificar se chat tem automação suspensa ─────────────────────────────────

export async function isAutomationSuspended(
  supabase: SupabaseClient,
  tenantId: string,
  chatId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('conversations')
    .select('automacao_suspensa, automacao_suspensa_ate')
    .eq('tenant_id', tenantId)
    .eq('id', chatId)
    .single();

  if (!data?.automacao_suspensa) return false;

  // Se tem TTL definido e já expirou, retomar automação e limpar o flag
  if (data.automacao_suspensa_ate && new Date(data.automacao_suspensa_ate) <= new Date()) {
    void supabase
      .from('conversations')
      .update({ automacao_suspensa: false, automacao_suspensa_ate: null })
      .eq('tenant_id', tenantId)
      .eq('id', chatId); // fire-and-forget
    return false;
  }

  return true;
}

// ─── Suspender automação para um chat ────────────────────────────────────────

export async function suspendAutomation(
  supabase: SupabaseClient,
  tenantId: string,
  chatId: string,
  motivo: string,
  duracaoHoras?: number, // undefined = suspensão permanente até ação manual
): Promise<void> {
  const suspensaAte = duracaoHoras
    ? new Date(Date.now() + duracaoHoras * 60 * 60 * 1000).toISOString()
    : null;

  await supabase
    .from('conversations')
    .update({
      automacao_suspensa: true,
      automacao_suspensa_motivo: motivo,
      automacao_suspensa_ate: suspensaAte,
    })
    .eq('tenant_id', tenantId)
    .eq('id', chatId);
}

// ─── Atualizar tier do cliente após mudança de LTV ───────────────────────────

export async function updateClientTier(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  newLtv: number,
): Promise<{ tierAnterior: string; tierNovo: string; mudou: boolean }> {
  const { data: client } = await supabase
    .from('clients')
    .select('tier, ltv')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .single();

  const tierAnterior = client?.tier ?? 'lead';
  const tierNovo = calcTier(newLtv);
  const mudou = tierNovo !== tierAnterior;

  await supabase
    .from('clients')
    .update({ ltv: newLtv, tier: tierNovo })
    .eq('tenant_id', tenantId)
    .eq('id', clientId);

  return { tierAnterior, tierNovo, mudou };
}

// ─── Buscar base de conhecimento de um agente ────────────────────────────────

export async function getAgentKnowledge(
  supabase: SupabaseClient,
  tenantId: string,
  slug: AgentSlug,
): Promise<string | null> {
  const { data } = await supabase
    .from('anne_agents')
    .select('knowledge_base')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .single();
  return data?.knowledge_base ?? null;
}

// ─── Incrementar contador de execuções do agente ──────────────────────────────

export async function incrementAgentStats(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
  latencyMs: number,
): Promise<void> {
  const { data } = await supabase
    .from('anne_agents')
    .select('executions_total, executions_today, avg_latency_ms')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .single();

  if (!data) return;

  const newAvg = Math.round(
    (data.avg_latency_ms * data.executions_total + latencyMs) / (data.executions_total + 1),
  );

  await supabase
    .from('anne_agents')
    .update({
      executions_total: data.executions_total + 1,
      executions_today: data.executions_today + 1,
      avg_latency_ms: newAvg,
      last_executed_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('slug', slug);
}
