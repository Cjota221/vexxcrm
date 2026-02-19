/**
 * pipeline-triggers.ts
 *
 * Motor de automação de pipeline da Anne.
 * Chamado após cada mensagem WhatsApp recebida/enviada.
 *
 * Responsabilidades:
 *  1. Detectar padrão na mensagem (carrinho, pedido, pagamento, rastreio, rejeição)
 *  2. Mover kanban_card para a coluna correta
 *  3. Registrar kanban_transitions com motivo automático
 *  4. Extrair código de rastreio → atualizar orders.tracking_code
 *  5. Capturar nome do cliente via mensagem de carrinho → atualizar clients.name
 *  6. Emitir SSE para atualização em tempo real no front-end
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { eventBus } from '@/lib/event-bus';
import { logAutomation } from '@/lib/automation-log';
import { scheduleCartRecovery, cancelCartRecovery } from '@/lib/services/cart-recovery';
import type { KanbanColumn, AnneTriggerType } from '@/types';

/* ══════════════════════════════════════════════════════════════
   TIPOS INTERNOS
   ══════════════════════════════════════════════════════════════ */

interface PipelineEvent {
  trigger: AnneTriggerType;
  targetColumn: KanbanColumn;
  motivo: string;
  /** Código de rastreio extraído (se houver) */
  trackingCode?: string;
  /** Nome extraído da mensagem de carrinho (se houver) */
  extractedName?: string;
  /** Número do pedido extraído da mensagem (ex: "5260270") */
  orderNumber?: string;
  score: number;
}

interface ClientRow {
  id: string;
  name?: string;
  name_manual?: boolean;
}

/* ══════════════════════════════════════════════════════════════
   PADRÕES DE DETECÇÃO — Calibrados com mensagens reais da FacilZap
   Fonte: mensagens reais do cliente cjotarasteirinhas.com.br
   ══════════════════════════════════════════════════════════════ */

/**
 * Regex para código de rastreio.
 *
 * Formatos reais observados:
 *   ME2624MAKT4BR  → Frete Fácil / J&T Express (formato alternativo SRO)
 *   NL123456789BR  → Correios SRO padrão
 *   JD123456789BR  → JADLOG
 *   PX/PI + 9 dígitos + 2 letras
 *
 * O padrão "ME2624MAKT4BR" tem letras no meio → regex mais amplo necessário
 */
const TRACKING_CODE_PATTERNS = [
  /\b([A-Z]{2}[A-Z0-9]{7,12}[A-Z]{2})\b/,   // SRO amplo: 2L + 7-12 alfanum + 2L (cobre ME2624MAKT4BR)
  /\b([A-Z]{2}\d{9}[A-Z]{2})\b/i,            // Correios SRO clássico
  /\b(\d{13})\b/,                             // JADLOG (13 dígitos)
  /\b(\d{14})\b/,                             // Total Express (14 dígitos)
];

/**
 * Extrai nome próprio de mensagens de carrinho/pedido FacilZap.
 *
 * Exemplos reais:
 *   "Olá, Marcia! Vimos que você colocou alguns itens no carrinho"
 *   "Olá, Michele Miranda da Silva! Recebemos seu pedido"
 *   "Olá, Karin Niuli Celestino Soares Lopes! Este é o código"
 *   "Olá, Mirian Thayanne da Silva Andrade! O seu pedido"
 */
const NAME_EXTRACTION_PATTERNS = [
  // Padrão FacilZap: "Olá, Nome Sobrenome!" — inclui nomes compostos com "da/de/do"
  /(?:olá|oi|hey|ola)[,!]?\s+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú]+(?: (?:da|de|do|das|dos|e|[A-ZÀ-Ú][a-zà-ú]+))*)/u,
  // Início de mensagem: "Nome Sobrenome,"
  /^([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)+)[,!]/u,
];

/**
 * Saudações simples (cliente curioso, sem carrinho).
 * Mensagens de primeiro contato sem intenção de compra detectada.
 * Ex: "Oi", "Olá", "Tudo bem?", "Quero saber mais sobre os produtos"
 */
const GREETING_PATTERNS = [
  /^(oi|olá|ola|oi!|olá!|hey|e aí|eaí|bom dia|boa tarde|boa noite)\b/i,
  /tudo bem/i,
  /quero saber mais/i,
  /me conta mais/i,
  /como funciona/i,
  /vocês vendem/i,
  /voces vendem/i,
  /têm disponível/i,
  /tem disponivel/i,
];

/**
 * Carrinho abandonado — mensagens reais FacilZap:
 * "Vimos que você colocou alguns itens no carrinho 🛒, porém não chegou a finalizar"
 * "Para recuperar seu carrinho, acesse:"
 * Também contém "#fz" no final
 */
const CART_PATTERNS = [
  /colocou alguns itens no carrinho/i,
  /não chegou a finalizar o pedido/i,
  /recuperar seu carrinho/i,
  /carrinho\?id=/i,          // URL de carrinho FacilZap
  /carrinho/i,
  /abandonou.*carrinho/i,
  /itens no carrinho/i,
];

/**
 * Pedido criado — mensagens reais FacilZap:
 * "Recebemos seu pedido nº 5260270. ✅"
 * "Olá, Michele Miranda da Silva! Recebemos seu pedido nº 5260270."
 * Contém link de pagamento: "/pagamento/NUMERO/HASH"
 */
const ORDER_PATTERNS = [
  /recebemos seu pedido n[oº°]?\s*\d+/i,      // "Recebemos seu pedido nº 5260270"
  /pedido n[oº°]?\s*\d+\s*\.?\s*✅/i,         // "pedido nº 5260270. ✅"
  /link para fazer o pagamento/i,              // "Use o seguinte link para fazer o pagamento"
  /pedido\s+#?\w+\s+(?:confirmado|recebido)/i,
  /pedido confirmado/i,
  /compra confirmada/i,
];

/**
 * Pagamento aprovado — mensagem real FacilZap:
 * "O pagamento do seu pedido nº 5260270 foi aprovado. ✅"
 */
const PAYMENT_PATTERNS = [
  /o pagamento do seu pedido.*foi aprovado/i,   // Padrão exato FacilZap
  /pagamento.*pedido.*aprovado/i,
  /pagamento\s+aprovad/i,
  /pagamento\s+confirm/i,
  /pago com sucesso/i,
  /pix confirmado/i,
  /pix aprovado/i,
  /boleto compensado/i,
];

/**
 * Em separação — mensagens reais FacilZap (intermediário, sem mover kanban ainda):
 * "Os produtos do seu pedido nº 5260270 estão em separação. 📦"
 * "Os produtos do seu pedido nº 5260270 estão separados📦, em breve seu pedido será despachado."
 * → Estes mantêm o card em PAGO, sem transição
 */
const SEPARATION_PATTERNS = [
  /estão em separação/i,
  /estão separados/i,
  /em breve.*será despachado/i,
];

/**
 * Código de rastreio (despacho) — mensagens reais FacilZap:
 * "Este é o código de rastreio do seu pedido nº 5257307: ME2624MAKT4BR 🚚"
 * "Seu pedido já foi despachado e está a caminho. 🚛✨"
 * "Esse é seu código de rastreamento: ME2624MAKT4BR"
 */
const TRACKING_MENTION_PATTERNS = [
  /código de rastreio do seu pedido/i,           // Exato FacilZap fase 1
  /código de rastreamento:/i,                    // Exato FacilZap fase 2
  /seu pedido.*foi despachado/i,                 // "já foi despachado e está a caminho"
  /está a caminho/i,
  /acompanhe a entrega em tempo real/i,
  /código de rastreament/i,
  /rastreamento:/i,
  /rastreio:/i,
  /pedido foi enviado/i,
  /saiu para entrega/i,
  /fretefacil.*tracker/i,                        // URL do tracker FacilZap
];

/**
 * Pedido cancelado — mensagem real FacilZap:
 * "O seu pedido nº 5182343 foi cancelado. 🙁"
 */
const CANCELLATION_PATTERNS = [
  /pedido.*foi cancelado/i,
  /pedido cancelado/i,
  /seu pedido.*cancelado/i,
];

/** Palavras-chave de rejeição / desistência do CLIENTE */
const REJECTION_PATTERNS = [
  /não quero/i,
  /nao quero/i,
  /não tenho interesse/i,
  /nao tenho interesse/i,
  /pode cancelar/i,
  /cancela aí/i,
  /desisto/i,
  /deixa pra lá/i,
  /deixa pra la/i,
  /para de me mandar/i,
  /não me mande/i,
  /remove meu/i,
  /me tira da lista/i,
];

/* ══════════════════════════════════════════════════════════════
   FUNÇÕES DE EXTRAÇÃO
   ══════════════════════════════════════════════════════════════ */

/**
 * Extrai código de rastreio do texto.
 *
 * Exemplos reais:
 *   "código de rastreio do seu pedido nº 5257307: ME2624MAKT4BR 🚚"
 *   "Esse é seu código de rastreamento: ME2624MAKT4BR"
 *   "rastreio: NL123456789BR"
 *
 * Procura por padrão após ":" ou espaço próximo a palavras de rastreio.
 */
export function extractTrackingCode(text: string): string | null {
  // Primeiro: tentar extração contextual (código logo após "rastreio:" ou "rastreamento:")
  const contextMatch = text.match(/(?:rastreio|rastreamento|rastreament)[^\w]*:\s*([A-Z0-9]{8,20})/i);
  if (contextMatch?.[1]) {
    const code = contextMatch[1].toUpperCase();
    if (code.length >= 8) return code;
  }

  // Segundo: tentar pelos padrões gerais
  for (const pattern of TRACKING_CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const code = match[1].toUpperCase();
      if (code.length >= 8) return code;
    }
  }
  return null;
}

/**
 * Extrai o número do pedido de mensagens FacilZap.
 *
 * Exemplos reais:
 *   "Recebemos seu pedido nº 5260270. ✅"
 *   "O pagamento do seu pedido nº 5260270 foi aprovado."
 *   "Este é o código de rastreio do seu pedido nº 5257307: ME2624MAKT4BR"
 *   "O seu pedido nº 5182343 foi cancelado."
 *   "Os produtos do seu pedido nº 5260270 estão em separação."
 *   "pedido #5260270 confirmado"
 */
export function extractOrderNumber(text: string): string | null {
  const patterns = [
    /pedido\s+n[oº°]?\s*\.?\s*(\d{4,12})/i,  // "pedido nº 5260270" | "pedido no 5260270"
    /pedido\s+#(\d{4,12})/i,                  // "pedido #5260270"
    /pedido\s+(\d{4,12})\b/i,                 // "pedido 5260270"
    /#(\d{4,12})\b/,                           // "#5260270" no início
    /n[oº°]\s*(\d{4,12})\b/i,                 // "nº 5260270" isolado
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extrai nome próprio de mensagem de carrinho FacilZap.
 * Retorna null se cliente já tem nome manual ou se não encontrar.
 */
export function extractNameFromMessage(
  text: string,
  currentName?: string,
  nameManual?: boolean
): string | null {
  // Não sobrescrever nomes manuais
  if (nameManual) return null;

  // Se já tem um nome "real" (não parece número de telefone), não sobrescrever
  if (
    currentName &&
    currentName.length > 3 &&
    !/^\+?[\d\s()-]+$/.test(currentName) &&
    !currentName.startsWith('55') // número de telefone brasileiro
  ) {
    return null;
  }

  for (const pattern of NAME_EXTRACTION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      // Validar: mínimo 2 chars, não é uma palavra genérica
      const GENERIC = ['você', 'voce', 'cliente', 'amigo', 'amiga', 'pessoa'];
      if (name.length >= 2 && !GENERIC.includes(name.toLowerCase())) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Detecta qual evento de pipeline ocorreu nesta mensagem.
 *
 * Ordem de precedência (mais específico primeiro):
 *  1. Cancelamento → REATIVAR (com tag cancelado)
 *  2. Rastreio/Despacho → CONCLUIDO
 *  3. Pagamento aprovado → PAGO
 *  4. Em separação → (sem movimento, só log)
 *  5. Pedido criado → AGUARDANDO_PAGAMENTO
 *  6. Carrinho abandonado → EM_NEGOCIACAO
 *  7. Rejeição do cliente → REATIVAR
 *
 * @param text    Conteúdo da mensagem
 * @param fromMe  true = enviada pelo bot/atendente
 */
export function detectPipelineEvent(
  text: string,
  fromMe: boolean
): PipelineEvent | null {
  if (!text || text.trim().length < 3) return null;

  // ── 1. CANCELAMENTO ────────────────────────────────────────────
  // Mensagem FacilZap: "O seu pedido nº 5182343 foi cancelado. 🙁"
  if (CANCELLATION_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'sinal_rejeicao',
      targetColumn: 'CANCELADO',
      motivo: 'Pedido cancelado pela FacilZap',
      orderNumber: extractOrderNumber(text) ?? undefined,
      score: 0.97,
    };
  }

  // ── 2. CÓDIGO DE RASTREIO / DESPACHO ──────────────────────────
  // Mensagens FacilZap:
  //   "Este é o código de rastreio do seu pedido nº 5257307: ME2624MAKT4BR 🚚"
  //   "Seu pedido já foi despachado e está a caminho. 🚛✨"
  if (TRACKING_MENTION_PATTERNS.some(p => p.test(text))) {
    const trackingCode = extractTrackingCode(text) ?? undefined;
    const orderNumber = extractOrderNumber(text) ?? undefined;
    return {
      trigger: 'pagamento_aprovado',
      targetColumn: 'DESPACHADO',
      motivo: trackingCode
        ? `Pedido despachado — rastreio: ${trackingCode}`
        : 'Pedido despachado / saiu para entrega',
      trackingCode,
      orderNumber,
      score: 0.97,
    };
  }

  // ── 3. PAGAMENTO APROVADO ──────────────────────────────────────
  // Mensagem FacilZap: "O pagamento do seu pedido nº 5260270 foi aprovado. ✅"
  if (PAYMENT_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'pagamento_aprovado',
      targetColumn: 'PAGO',
      motivo: 'Pagamento aprovado automaticamente',
      orderNumber: extractOrderNumber(text) ?? undefined,
      score: 0.98,
    };
  }

  // ── 4. EM SEPARAÇÃO — sem mover kanban, apenas logar ──────────
  // Mensagens FacilZap:
  //   "Os produtos do seu pedido nº 5260270 estão em separação. 📦"
  //   "estão separados📦, em breve seu pedido será despachado."
  if (SEPARATION_PATTERNS.some(p => p.test(text))) {
    // Não move o kanban — card já está em PAGO. Retorna null para não gerar transição.
    return null;
  }

  // ── 5. PEDIDO CRIADO → AGUARDANDO PAGAMENTO ──────────────────
  // Mensagem FacilZap: "Recebemos seu pedido nº 5260270. ✅"
  //   Também contém link de pagamento: /pagamento/NUMERO/HASH
  if (ORDER_PATTERNS.some(p => p.test(text))) {
    const extractedName = extractNameFromMessage(text) ?? undefined;
    return {
      trigger: 'pedido_recebido',
      targetColumn: 'AGUARDANDO_PAGAMENTO',
      motivo: 'Pedido recebido — aguardando pagamento',
      extractedName,
      orderNumber: extractOrderNumber(text) ?? undefined,
      score: 0.95,
    };
  }

  // ── 6. CARRINHO ABANDONADO → EM NEGOCIAÇÃO ───────────────────
  // Mensagem FacilZap: "Vimos que você colocou alguns itens no carrinho 🛒"
  if (CART_PATTERNS.some(p => p.test(text))) {
    const extractedName = extractNameFromMessage(text) ?? undefined;
    return {
      trigger: 'primeiro_contato',
      targetColumn: 'EM_NEGOCIACAO',
      motivo: 'Carrinho abandonado detectado',
      extractedName,
      score: 0.85,
    };
  }

  // ── 7. SAUDAÇÃO SIMPLES → PRIMEIRO CONTATO ────────────────────
  // Mensagem do cliente: "Oi", "Olá", "Quero saber mais"
  // Apenas mensagens RECEBIDAS (não do bot)
  if (!fromMe && GREETING_PATTERNS.some(p => p.test(text.trim()))) {
    return {
      trigger: 'primeiro_contato',
      targetColumn: 'PRIMEIRO_CONTATO',
      motivo: 'Primeiro contato — saudação detectada',
      score: 0.75,
    };
  }

  // ── 8. REJEIÇÃO DO CLIENTE (apenas mensagens recebidas) ───────
  if (!fromMe && REJECTION_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'sinal_rejeicao',
      targetColumn: 'REATIVAR',
      motivo: 'Cliente demonstrou sinal de rejeição',
      score: 0.85,
    };
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════
   OPERAÇÕES DE BANCO
   ══════════════════════════════════════════════════════════════ */

/**
 * Faz upsert do kanban_card e insere a transição de coluna.
 * Retorna a coluna anterior (null se card novo) e a nova coluna.
 */
async function moveKanbanCard(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  chatId: string,
  novaColuna: KanbanColumn,
  motivo: string
): Promise<{ deColuna: KanbanColumn | null; paraColuna: KanbanColumn }> {
  // Buscar card atual
  const { data: existing } = await supabase
    .from('kanban_cards')
    .select('id, coluna')
    .eq('tenant_id', tenantId)
    .eq('chat_id', chatId)
    .single();

  const deColuna = (existing?.coluna as KanbanColumn | undefined) ?? null;

  // Ordem lógica do funil — nunca regredir (exceto para REATIVAR/CANCELADO)
  const COLUMN_ORDER: KanbanColumn[] = [
    'PRIMEIRO_CONTATO',
    'EM_NEGOCIACAO',
    'AGUARDANDO_PAGAMENTO',
    'PAGO',
    'DESPACHADO',
    'CONCLUIDO',
  ];

  if (deColuna && novaColuna !== 'REATIVAR' && novaColuna !== 'CANCELADO') {
    const currentIdx = COLUMN_ORDER.indexOf(deColuna);
    const newIdx = COLUMN_ORDER.indexOf(novaColuna);
    // Só avançar — nunca voltar colunas (exceto para REATIVAR)
    if (currentIdx >= newIdx && newIdx !== -1) {
      return { deColuna, paraColuna: deColuna };
    }
  }

  // Upsert kanban_card
  const { error: upsertError } = await supabase
    .from('kanban_cards')
    .upsert(
      {
        tenant_id: tenantId,
        chat_id: chatId,
        client_id: clientId,
        coluna: novaColuna,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,chat_id' }
    );

  if (upsertError) {
    console.error('[Pipeline] Erro ao upsert kanban_card:', upsertError);
    throw upsertError;
  }

  // Registrar transição
  const { error: transError } = await supabase
    .from('kanban_transitions')
    .insert({
      tenant_id: tenantId,
      chat_id: chatId,
      client_id: clientId,
      de_coluna: deColuna ?? null,
      para_coluna: novaColuna,
      autor: 'anne',
      motivo,
    });

  if (transError) {
    console.warn('[Pipeline] Erro ao inserir kanban_transition:', transError);
    // Não bloquear — transição é auditoria, não crítica
  }

  return { deColuna, paraColuna: novaColuna };
}

/**
 * Atualiza o tracking_code do pedido mais recente do cliente.
 */
async function updateOrderTrackingCode(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  trackingCode: string
): Promise<void> {
  // Buscar pedido mais recente sem tracking_code
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .is('tracking_code', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!order) {
    // Nenhum pedido sem rastreio — atualizar o mais recente de qualquer forma
    const { data: latest } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latest) return;

    await supabase
      .from('orders')
      .update({ tracking_code: trackingCode })
      .eq('id', latest.id)
      .eq('tenant_id', tenantId);
    return;
  }

  await supabase
    .from('orders')
    .update({ tracking_code: trackingCode })
    .eq('id', order.id)
    .eq('tenant_id', tenantId);
}

/**
 * Atualiza o nome do cliente se o nome extraído for válido.
 */
async function updateClientName(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  newName: string,
  currentClient: ClientRow
): Promise<void> {
  const extracted = extractNameFromMessage(
    newName,
    currentClient.name,
    currentClient.name_manual
  );

  if (!extracted) return;

  await supabase
    .from('clients')
    .update({ name: extracted })
    .eq('id', clientId)
    .eq('tenant_id', tenantId);
}

/**
 * Registra log de gatilho da Anne para auditoria.
 */
async function logAnneTrigger(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  chatId: string,
  event: PipelineEvent,
  resultado: 'executado' | 'sugerido' | 'ignorado'
): Promise<void> {
  await supabase.from('anne_trigger_log').insert({
    tenant_id: tenantId,
    chat_id: chatId,
    client_id: clientId,
    trigger: event.trigger,
    score: event.score,
    acao: 'move_kanban',
    resultado,
    escalona_para_humano: false,
    canal: 'whatsapp',
  });
}

/* ══════════════════════════════════════════════════════════════
   FUNÇÃO PRINCIPAL — ENTRY POINT
   ══════════════════════════════════════════════════════════════ */

/**
 * Processa os gatilhos de pipeline para uma mensagem.
 *
 * @param supabase   Cliente Supabase com service key (sem RLS)
 * @param tenantId   ID do tenant
 * @param client     Objeto do cliente (id, name, name_manual)
 * @param chatId     JID da conversa WhatsApp (remoteJid)
 * @param text       Conteúdo da mensagem
 * @param fromMe     true = enviada pelo bot/atendente
 * @param source     Origem do evento (padrão: 'whatsapp')
 */
export async function processPipelineTriggers(
  supabase: SupabaseClient,
  tenantId: string,
  client: ClientRow,
  chatId: string,
  text: string,
  fromMe: boolean,
  source: 'whatsapp' | 'facilzap' | 'manual' = 'whatsapp'
): Promise<void> {
  const event = detectPipelineEvent(text, fromMe);

  if (!event) return; // Nenhum padrão detectado

  console.log(
    `[Pipeline] Gatilho detectado: ${event.trigger} → ${event.targetColumn} (chat: ${chatId})`
  );

  try {
    // ── 1. Atualizar nome do cliente (apenas em mensagens de carrinho) ─
    if (event.extractedName) {
      await updateClientName(
        supabase,
        tenantId,
        client.id,
        event.extractedName,
        client
      );
      // Emitir update de cliente
      eventBus.emitToTenant('client_updated', tenantId, {
        client_id: client.id,
        updated_name: event.extractedName,
      });
    }

    // ── 2. Mover Kanban Card ──────────────────────────────────────────
    const { deColuna, paraColuna } = await moveKanbanCard(
      supabase,
      tenantId,
      client.id,
      chatId,
      event.targetColumn,
      event.motivo
    );

    // Se não houve mudança de coluna (card já está na mesma ou mais avançada)
    if (deColuna === paraColuna) {
      await logAnneTrigger(supabase, tenantId, client.id, chatId, event, 'ignorado');
      // Registrar também no automation_logs com action 'noop'
      await logAutomation(supabase, {
        tenantId,
        clientId: client.id,
        chatId,
        triggerType: event.trigger,
        source,
        actionTaken: 'noop',
        deColuna,
        paraColuna,
        orderNumber: event.orderNumber ?? null,
        trackingCode: event.trackingCode ?? null,
        success: true,
        eventData: { text: text.slice(0, 500), motivo: event.motivo, score: event.score },
      });
      return;
    }

    // ── 3. Agenda/cancela recuperação de carrinho ─────────────────
    if (paraColuna === 'EM_NEGOCIACAO' && deColuna !== 'EM_NEGOCIACAO') {
      // Cliente acabou de entrar em negociação → agendar up de recuperação
      scheduleCartRecovery(supabase, tenantId, client.id, chatId, client.name ?? '')
        .catch(e => console.warn('[Pipeline] scheduleCartRecovery error:', e));
    } else if (['PAGO', 'DESPACHADO', 'CONCLUIDO'].includes(paraColuna)) {
      // Cliente converteu → cancelar recovery pendente
      cancelCartRecovery(supabase, tenantId, client.id, 'converted')
        .catch(e => console.warn('[Pipeline] cancelCartRecovery error:', e));
    }

    // ── 4. Atualizar tracking_code no pedido ──────────────────────────
    if (event.trackingCode) {
      await updateOrderTrackingCode(
        supabase,
        tenantId,
        client.id,
        event.trackingCode
      );
      // Emitir update de pedidos
      eventBus.emitToTenant('orders_updated', tenantId, {
        client_id: client.id,
        tracking_code: event.trackingCode,
      });
    }

    // ── 5. Registrar log Anne (legado) ────────────────────────────────
    await logAnneTrigger(supabase, tenantId, client.id, chatId, event, 'executado');

    // ── 6. Registrar em automation_logs (auditoria detalhada) ─────────
    await logAutomation(supabase, {
      tenantId,
      clientId: client.id,
      chatId,
      triggerType: event.trigger,
      source,
      actionTaken: 'move_kanban',
      deColuna,
      paraColuna,
      orderNumber: event.orderNumber ?? null,
      trackingCode: event.trackingCode ?? null,
      success: true,
      eventData: { text: text.slice(0, 500), motivo: event.motivo, score: event.score },
    });

    // ── 7. Emitir SSE para front-end ──────────────────────────────────
    eventBus.emitToTenant('kanban_moved', tenantId, {
      client_id: client.id,
      chat_id: chatId,
      de_coluna: deColuna,
      para_coluna: paraColuna,
      motivo: event.motivo,
      trigger: event.trigger,
      order_number: event.orderNumber ?? null,
      tracking_code: event.trackingCode ?? null,
      source,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[Pipeline] ✅ Card movido: ${deColuna ?? 'novo'} → ${paraColuna} (cliente: ${client.id})`
    );
  } catch (err) {
    console.error('[Pipeline] Erro ao processar gatilho:', err);
    // Registrar falha no automation_logs
    await logAutomation(supabase, {
      tenantId,
      clientId: client.id,
      chatId,
      triggerType: event.trigger,
      source,
      actionTaken: 'move_kanban',
      success: false,
      errorMsg: String(err),
      eventData: { text: text.slice(0, 500) },
    }).catch(() => null); // Nunca propagar erro do log
  }
}
