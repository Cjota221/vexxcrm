/**
 * Motor de Gatilhos da Anne VEXX 2.0
 *
 * Pipeline assíncrono de processamento de mensagens.
 * Detecta intenções, calcula score de confiança e executa ações automáticas
 * — ou escalona para humano quando o score não é suficiente.
 *
 * Princípio: se pode ser automatizado com > 90% de precisão, deve ser.
 */

import type {
  AnneTriggerType,
  AnneActionType,
  AnneTriggerResult,
  KanbanColumn,
} from '@/types';
import { getColumnForTrigger } from '@/lib/kanban-state-machine';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THRESHOLDS DE CONFIANÇA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Ação automática imediata + log */
const THRESHOLD_AUTO = 0.90;
/** Ação automática + log para revisão posterior */
const THRESHOLD_AUTO_WITH_LOG = 0.70;
/** Sugere ação ao atendente, não executa */
// Score < THRESHOLD_AUTO_WITH_LOG → escalonamento humano

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PADRÕES DOS GATILHOS (regex compilados uma vez)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PATTERNS = {
  pedido: /pedido\s?#?\d+/i,
  pagamento: /pagamento\s*(aprovado|confirmado|efetuado|realizado|pago|ok)/i,
  rejeicao: /\b(n[aã]o\s*posso|desistir?|cancelar?|reembolso|devolver?|estorn|quero\s*sair|n[aã]o\s*quero\s*mais)\b/i,
  ola: /\b(ol[aá]|oi|bom\s*dia|boa\s*tarde|boa\s*noite|ei|hey|hello)\b/i,
  engajamento: /\b(quero|preciso|interesse|gostei|adorei|perfeito|sim|quero\s*comprar|me\s*manda|quanto\s*custa|valor|pre[çc]o|como\s*funciona)\b/i,
} as const;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DETECÇÃO DE GATILHOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface TriggerDetection {
  trigger: AnneTriggerType;
  score: number;
}

/**
 * Normaliza o texto (lowercase, remove acentos, colapsa espaços).
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score de sentimento simples baseado em densidade de palavras de engajamento.
 * Retorna 0.0–1.0.
 */
function sentimentScore(text: string): number {
  const normalized = normalize(text);
  const tokens = normalized.split(/\s+/);
  const positiveWords = tokens.filter(t => PATTERNS.engajamento.test(t));
  if (tokens.length === 0) return 0;
  return Math.min(1, (positiveWords.length / tokens.length) * 4);
}

/**
 * Detecta todos os gatilhos presentes em uma mensagem.
 * Retorna lista ordenada por score decrescente.
 */
export function detectTriggers(
  message: string,
  msgCount: number
): TriggerDetection[] {
  const text = normalize(message);
  const detections: TriggerDetection[] = [];

  // Primeiro contato — determinístico
  if (msgCount === 1) {
    detections.push({ trigger: 'primeiro_contato', score: 1.0 });
  }

  // Pedido recebido — regex forte
  if (PATTERNS.pedido.test(text)) {
    detections.push({ trigger: 'pedido_recebido', score: 0.95 });
  }

  // Pagamento aprovado — regex forte
  if (PATTERNS.pagamento.test(text)) {
    detections.push({ trigger: 'pagamento_aprovado', score: 0.93 });
  }

  // Sinal de rejeição — regex moderado (risco de falso positivo)
  if (PATTERNS.rejeicao.test(text)) {
    detections.push({ trigger: 'sinal_rejeicao', score: 0.82 });
  }

  // Engajamento alto — baseado em score de sentimento
  const sentiment = sentimentScore(message);
  if (sentiment > 0.6) {
    detections.push({ trigger: 'engajamento_alto', score: sentiment });
  }

  // Ghosting é detectado externamente pelo cron (não pela mensagem em si)

  return detections.sort((a, b) => b.score - a.score);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAPEAMENTO TRIGGER → AÇÕES E TAGS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface TriggerConfig {
  acoes: AnneActionType[];
  tag: string;
  escalona_motivo?: string;
}

const TRIGGER_CONFIG: Record<AnneTriggerType, TriggerConfig> = {
  primeiro_contato: {
    acoes: ['move_kanban'],
    tag: 'lead_novo',
  },
  pedido_recebido: {
    acoes: ['atualiza_tag', 'move_kanban', 'dispara_template', 'notifica_atendente'],
    tag: 'aguardando_pgt',
  },
  pagamento_aprovado: {
    acoes: ['atualiza_tag', 'move_kanban', 'notifica_atendente'],
    tag: 'cliente_pago',
  },
  sinal_rejeicao: {
    acoes: ['atualiza_tag', 'notifica_atendente'],
    tag: 'risco_churn',
    escalona_motivo: 'Sinal de rejeição detectado — intervenção humana recomendada.',
  },
  engajamento_alto: {
    acoes: ['atualiza_tag', 'dispara_template'],
    tag: 'lead_quente',
  },
  ghosting: {
    acoes: ['atualiza_tag', 'move_kanban'],
    tag: 'inativo',
  },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   EXECUTOR DE AÇÕES
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Contexto necessário para o executor.
 */
export interface TriggerExecutionContext {
  chatId: string;
  clientId: string;
  tenantId: string;
  /** Número total de mensagens nesta conversa (para detectar primeiro contato) */
  msgCount: number;
  /** Coluna atual do card no Kanban */
  colunaAtual: KanbanColumn | null;
}

/**
 * Processa uma mensagem recebida pelo pipeline de gatilhos.
 *
 * Executa em paralelo todos os gatilhos detectados.
 * Score ≥ 0.90 → ação automática imediata
 * Score 0.70–0.89 → ação automática + marcado para revisão
 * Score < 0.70 → sugere ao atendente, não executa
 *
 * @returns Lista de resultados dos gatilhos ativados
 */
export async function processMessage(
  message: string,
  ctx: TriggerExecutionContext
): Promise<AnneTriggerResult[]> {
  const detections = detectTriggers(message, ctx.msgCount);

  if (detections.length === 0) {
    return [];
  }

  const results: AnneTriggerResult[] = [];

  for (const detection of detections) {
    const config = TRIGGER_CONFIG[detection.trigger];
    const nova_coluna = getColumnForTrigger(detection.trigger) ?? undefined;

    const escalona_para_humano =
      detection.score < THRESHOLD_AUTO_WITH_LOG ||
      Boolean(config.escalona_motivo && detection.score < THRESHOLD_AUTO);

    // Determina quais ações são executadas vs. apenas sugeridas
    const acoes_executadas: AnneActionType[] =
      detection.score >= THRESHOLD_AUTO_WITH_LOG
        ? config.acoes
        : [];

    results.push({
      trigger: detection.trigger,
      score: detection.score,
      matched: true,
      acoes_executadas,
      escalona_para_humano,
      motivo_escalona: escalona_para_humano
        ? (config.escalona_motivo ??
           `Score ${(detection.score * 100).toFixed(0)}% abaixo do threshold de confiança.`)
        : undefined,
      nova_coluna: acoes_executadas.includes('move_kanban') ? nova_coluna : undefined,
      nova_tag: acoes_executadas.includes('atualiza_tag') ? config.tag : undefined,
    });
  }

  return results;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GHOSTING CHECK (usado pelo cron)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface GhostingCheckParams {
  ultimoContatoAt: string;
  colunaAtual: KanbanColumn;
  tentativasReativacao: number;
  thresholdDays?: number;
}

export interface GhostingCheckResult {
  shouldMove: boolean;
  novaColunaDestino: KanbanColumn;
  novaTag: string;
  motivo: string;
}

/**
 * Verifica se um card deve ser movido por inatividade (ghosting).
 * Chamado pelo job de cron a cada hora.
 *
 * Lógica:
 * - Se tentativas >= MAX (3) → CONCLUIDO com tag `sem_retorno`
 * - Se inativo há N dias (padrão: 3) e não é PAGO/CONCLUIDO → REATIVAR
 */
export function checkGhosting(params: GhostingCheckParams): GhostingCheckResult | null {
  const MAX_ATTEMPTS = 3;
  const threshold = params.thresholdDays ?? 3;

  // Estados imunes ao ghosting
  if (params.colunaAtual === 'PAGO' || params.colunaAtual === 'CONCLUIDO') {
    return null;
  }

  const diffMs = Date.now() - new Date(params.ultimoContatoAt).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < threshold) return null;

  // Excedeu tentativas de reativação
  if (params.tentativasReativacao >= MAX_ATTEMPTS) {
    return {
      shouldMove: true,
      novaColunaDestino: 'CONCLUIDO',
      novaTag: 'sem_retorno',
      motivo: `${MAX_ATTEMPTS} tentativas de reativação sem resposta.`,
    };
  }

  // Mover para REATIVAR
  return {
    shouldMove: true,
    novaColunaDestino: 'REATIVAR',
    novaTag: 'inativo',
    motivo: `Sem interação há ${Math.floor(diffDays)} dias (threshold: ${threshold}d).`,
  };
}
