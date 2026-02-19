/**
 * Máquina de Estados do Kanban VEXX 2.0
 *
 * Define as transições válidas entre colunas do pipeline de negócio.
 * Transições inválidas são rejeitadas com código de anomalia.
 * Toda transição é logada — nenhum card se move sem rastreio.
 */

import type { KanbanColumn } from '@/types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIGURAÇÃO DAS COLUNAS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const KANBAN_COLUMN_CONFIG: Record<
  KanbanColumn,
  { label: string; color: string; bg: string; icon: string; terminal: boolean }
> = {
  PRIMEIRO_CONTATO: {
    label: 'Primeiro Contato',
    color: 'text-sky-700',
    bg: 'bg-sky-50 border-sky-200',
    icon: '👋',
    terminal: false,
  },
  EM_NEGOCIACAO: {
    label: 'Em Negociação',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: '💬',
    terminal: false,
  },
  AGUARDANDO_PAGAMENTO: {
    label: 'Aguard. Pagamento',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    icon: '💳',
    terminal: false,
  },
  PAGO: {
    label: 'Pago / Confirmado',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    icon: '✅',
    terminal: false,
  },
  DESPACHADO: {
    label: 'Despachado',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: '🚚',
    terminal: false,
  },
  CANCELADO: {
    label: 'Cancelado',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: '🙁',
    terminal: false,
  },
  REATIVAR: {
    label: 'Reativar',
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
    icon: '🔄',
    terminal: false,
  },
  CONCLUIDO: {
    label: 'Concluído',
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
    icon: '🏁',
    terminal: true,
  },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TRANSIÇÕES VÁLIDAS
   Chave: coluna de origem → array de colunas de destino permitidas
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const VALID_TRANSITIONS: Record<KanbanColumn, KanbanColumn[]> = {
  PRIMEIRO_CONTATO:     ['EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'DESPACHADO', 'REATIVAR', 'CANCELADO', 'CONCLUIDO'],
  EM_NEGOCIACAO:        ['PRIMEIRO_CONTATO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'DESPACHADO', 'REATIVAR', 'CANCELADO', 'CONCLUIDO'],
  AGUARDANDO_PAGAMENTO: ['PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'PAGO', 'DESPACHADO', 'REATIVAR', 'CANCELADO', 'CONCLUIDO'],
  PAGO:                 ['PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'DESPACHADO', 'REATIVAR', 'CANCELADO', 'CONCLUIDO'],
  DESPACHADO:           ['PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'REATIVAR', 'CANCELADO', 'CONCLUIDO'],
  CANCELADO:            ['PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'DESPACHADO', 'REATIVAR', 'CONCLUIDO'],
  REATIVAR:             ['PRIMEIRO_CONTATO', 'EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'DESPACHADO', 'CANCELADO', 'CONCLUIDO'],
  CONCLUIDO:            [], // estado terminal — use motivo manual para desbloquear se necessário
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS DE RESULTADO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface TransitionResult {
  allowed: boolean;
  /** Código curto para logging e auditoria (ex: 'TERMINAL_STATE') */
  anomaly_code?: string;
  /** Mensagem legível para o usuário/atendente */
  message?: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FUNÇÃO PRINCIPAL DE VALIDAÇÃO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Valida se uma transição de `de` → `para` é permitida pela máquina de estados.
 * Retorna `{ allowed: true }` ou `{ allowed: false, anomaly_code, message }`.
 *
 * @param de   Coluna atual (origem). null = card novo (sem coluna).
 * @param para Coluna de destino.
 */
export function validateTransition(
  de: KanbanColumn | null,
  para: KanbanColumn
): TransitionResult {
  // Card novo — só pode ir para PRIMEIRO_CONTATO
  if (de === null) {
    if (para === 'PRIMEIRO_CONTATO') return { allowed: true };
    return {
      allowed: false,
      anomaly_code: 'INVALID_INITIAL_STATE',
      message: `Card novo só pode ser criado em PRIMEIRO_CONTATO, não em ${KANBAN_COLUMN_CONFIG[para].label}.`,
    };
  }

  // Mover para a mesma coluna não faz sentido
  if (de === para) {
    return {
      allowed: false,
      anomaly_code: 'SAME_COLUMN',
      message: `O card já está em ${KANBAN_COLUMN_CONFIG[de].label}.`,
    };
  }

  // Estado terminal — CONCLUIDO não tem saídas
  if (KANBAN_COLUMN_CONFIG[de].terminal) {
    return {
      allowed: false,
      anomaly_code: 'TERMINAL_STATE',
      message: `${KANBAN_COLUMN_CONFIG[de].label} é um estado terminal. Nenhuma transição é permitida.`,
    };
  }

  // Verificar se a transição está na lista de permitidas
  const allowed = VALID_TRANSITIONS[de].includes(para);
  if (!allowed) {
    return {
      allowed: false,
      anomaly_code: 'INVALID_TRANSITION',
      message: `Transição ${KANBAN_COLUMN_CONFIG[de].label} → ${KANBAN_COLUMN_CONFIG[para].label} não é permitida. Transições válidas: ${VALID_TRANSITIONS[de].map(c => KANBAN_COLUMN_CONFIG[c].label).join(', ') || 'nenhuma'}.`,
    };
  }

  return { allowed: true };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPERS DE NEGÓCIO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Retorna true se o card deve ir para REATIVAR com base nos dias de inatividade */
export function shouldGhost(
  ultimoContato: Date,
  thresholdDays: number = 3
): boolean {
  const diffMs = Date.now() - ultimoContato.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= thresholdDays;
}

/** Retorna a coluna padrão para um gatilho específico */
export function getColumnForTrigger(trigger: string): KanbanColumn | null {
  const map: Record<string, KanbanColumn> = {
    primeiro_contato:    'PRIMEIRO_CONTATO',
    pedido_recebido:     'AGUARDANDO_PAGAMENTO',
    pagamento_aprovado:  'PAGO',
    pedido_despachado:   'DESPACHADO',
    pedido_cancelado:    'CANCELADO',
    sinal_rejeicao:      'REATIVAR',
    engajamento_alto:    'EM_NEGOCIACAO',
    ghosting:            'REATIVAR',
  };
  return map[trigger] ?? null;
}

/** Retorna as colunas ordenadas para exibição no Kanban */
export const KANBAN_COLUMNS_ORDER: KanbanColumn[] = [
  'PRIMEIRO_CONTATO',
  'EM_NEGOCIACAO',
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'DESPACHADO',
  'CANCELADO',
  'REATIVAR',
  'CONCLUIDO',
];

/** Máximo de tentativas de reativação antes de mover para CONCLUIDO com tag sem_retorno */
export const MAX_REACTIVATION_ATTEMPTS = 3;
