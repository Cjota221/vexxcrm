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
  score: number;
}

interface ClientRow {
  id: string;
  name?: string;
  name_manual?: boolean;
}

/* ══════════════════════════════════════════════════════════════
   PADRÕES DE DETECÇÃO (pt-BR + FacilZap)
   ══════════════════════════════════════════════════════════════ */

/**
 * Regex para código de rastreio (Correios BR: SRO + JADLOG numérico longo)
 * Ex: NL123456789BR, JD123456789BR, PX987654321BR, PI123456789BR
 * Também: JADLOG 13 dígitos, Total Express 14 dígitos
 */
const TRACKING_CODE_PATTERNS = [
  /\b([A-Z]{2}\d{9}[A-Z]{2})\b/,          // Correios padrão (SRO)
  /\b([A-Z]{2}\d{9}[A-Z]{2})\b/i,         // Case-insensitive
  /\b(\d{13})\b/,                          // JADLOG (13 dígitos)
  /\b(\d{14})\b/,                          // Total Express (14 dígitos)
];

/**
 * Extrai nome próprio de mensagens de carrinho FacilZap.
 * Exemplos:
 *   "Olá, Ana Lívia! Vimos que você deixou itens no carrinho."
 *   "Oi João da Silva, notamos que você abandonou o carrinho."
 *   "Olá Ana! Temos uma oferta especial para você."
 */
const NAME_EXTRACTION_PATTERNS = [
  /(?:olá|oi|hey|ola)[,!]?\s+([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)/u,
  /^([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)[,!]/u,
];

/** Palavras-chave de carrinho (mensagens da FacilZap) */
const CART_PATTERNS = [
  /carrinho/i,
  /colocou.*itens/i,
  /deixou.*itens/i,
  /abandonou.*carrinho/i,
  /itens no carrinho/i,
  /você adicionou/i,
  /produto.*carrinho/i,
];

/** Palavras-chave de pedido confirmado */
const ORDER_PATTERNS = [
  /recebemos.*seu\s+pedido/i,
  /pedido\s+#?\w+\s+(?:confirmado|recebido)/i,
  /pedido confirmado/i,
  /pedido realizado/i,
  /compra confirmada/i,
  /seu pedido foi confirmado/i,
];

/** Palavras-chave de pagamento aprovado */
const PAYMENT_PATTERNS = [
  /pagamento\s+aprovad/i,
  /pagamento\s+confirm/i,
  /pago com sucesso/i,
  /pix confirmado/i,
  /pix aprovado/i,
  /pagamento recebido/i,
  /boleto compensado/i,
  /transação aprovada/i,
];

/** Palavras-chave de código de rastreio */
const TRACKING_MENTION_PATTERNS = [
  /código de rastreament/i,
  /código de rastreio/i,
  /código de acompanhamento/i,
  /rastreamento:/i,
  /rastreio:/i,
  /código.*correios/i,
  /pedido foi enviado/i,
  /produto foi despachado/i,
  /saiu para entrega/i,
];

/** Palavras-chave de rejeição / desistência */
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
 */
export function extractTrackingCode(text: string): string | null {
  for (const pattern of TRACKING_CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const code = match[1].toUpperCase();
      // Validar comprimento mínimo
      if (code.length >= 11) return code;
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
 * Retorna null se nenhum padrão bater.
 *
 * @param text  Conteúdo da mensagem
 * @param fromMe  true = mensagem enviada pelo atendente/bot
 */
export function detectPipelineEvent(
  text: string,
  fromMe: boolean
): PipelineEvent | null {
  if (!text || text.trim().length < 3) return null;

  // ── 1. REJEIÇÃO (mensagem do cliente) ────────────────────────
  if (!fromMe && REJECTION_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'sinal_rejeicao',
      targetColumn: 'REATIVAR',
      motivo: 'Cliente demonstrou sinal de rejeição',
      score: 0.85,
    };
  }

  // ── 2. CÓDIGO DE RASTREIO (mensagem do bot/atendente) ────────
  if (TRACKING_MENTION_PATTERNS.some(p => p.test(text))) {
    const trackingCode = extractTrackingCode(text) ?? undefined;
    return {
      trigger: 'pagamento_aprovado', // reutilizamos trigger próximo
      targetColumn: 'CONCLUIDO',
      motivo: trackingCode
        ? `Pedido despachado — rastreio: ${trackingCode}`
        : 'Pedido despachado / saiu para entrega',
      trackingCode,
      score: 0.95,
    };
  }

  // ── 3. PAGAMENTO APROVADO (bot → cliente) ────────────────────
  if (PAYMENT_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'pagamento_aprovado',
      targetColumn: 'PAGO',
      motivo: 'Pagamento confirmado automaticamente',
      score: 0.95,
    };
  }

  // ── 4. PEDIDO CONFIRMADO (bot → cliente) ─────────────────────
  if (ORDER_PATTERNS.some(p => p.test(text))) {
    return {
      trigger: 'pedido_recebido',
      targetColumn: 'AGUARDANDO_PAGAMENTO',
      motivo: 'Pedido recebido / aguardando pagamento',
      score: 0.9,
    };
  }

  // ── 5. CARRINHO ABANDONADO (bot → cliente) ───────────────────
  if (CART_PATTERNS.some(p => p.test(text))) {
    const extractedName = extractNameFromMessage(text) ?? undefined;
    return {
      trigger: 'primeiro_contato',
      targetColumn: 'EM_NEGOCIACAO',
      motivo: 'Mensagem de carrinho abandonado detectada',
      extractedName,
      score: 0.8,
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

  // Não regredir para coluna anterior (exceto REATIVAR)
  const COLUMN_ORDER: KanbanColumn[] = [
    'PRIMEIRO_CONTATO',
    'EM_NEGOCIACAO',
    'AGUARDANDO_PAGAMENTO',
    'PAGO',
    'CONCLUIDO',
  ];

  if (deColuna && novaColuna !== 'REATIVAR') {
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
 */
export async function processPipelineTriggers(
  supabase: SupabaseClient,
  tenantId: string,
  client: ClientRow,
  chatId: string,
  text: string,
  fromMe: boolean
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

    // Se não houve mudança de coluna, encerrar
    if (deColuna === paraColuna) {
      await logAnneTrigger(supabase, tenantId, client.id, chatId, event, 'ignorado');
      return;
    }

    // ── 3. Atualizar tracking_code no pedido ──────────────────────────
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

    // ── 4. Registrar log Anne ─────────────────────────────────────────
    await logAnneTrigger(supabase, tenantId, client.id, chatId, event, 'executado');

    // ── 5. Emitir SSE para front-end ──────────────────────────────────
    eventBus.emitToTenant('kanban_moved', tenantId, {
      client_id: client.id,
      chat_id: chatId,
      de_coluna: deColuna,
      para_coluna: paraColuna,
      motivo: event.motivo,
      trigger: event.trigger,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[Pipeline] ✅ Card movido: ${deColuna ?? 'novo'} → ${paraColuna} (cliente: ${client.id})`
    );
  } catch (err) {
    console.error('[Pipeline] Erro ao processar gatilho:', err);
    // Fire-and-forget: não propagar erro para o webhook
  }
}
