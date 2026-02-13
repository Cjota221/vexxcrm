/**
 * RFM Segments — Dicionário completo de segmentos, ações e design system.
 *
 * Segmentação baseada em Recency-Frequency-Monetary.
 * Scores de 1 a 5 para cada dimensão (R, F, M).
 */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type RFMSegmentName =
  | 'Champions'
  | 'Loyal Customers'
  | 'Potential Loyalist'
  | 'New Customers'
  | 'Promising'
  | 'Need Attention'
  | 'About To Sleep'
  | 'At Risk'
  | 'Cant Lose Them'
  | 'Hibernating'
  | 'Lost';

export interface RFMSegmentInfo {
  nome: RFMSegmentName;
  descricao: string;
  cor: string;         // hex
  bgColor: string;     // tailwind bg
  textColor: string;   // tailwind text
  prioridade: number;  // 1 = melhor
  icon: string;        // lucide icon name
}

export interface RFMConfig {
  recency: Record<number, number>;
  frequency: Record<number, number>;
  monetary: {
    method: 'percentile' | 'fixed';
    percentiles: Record<number, number>;
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIG DE THRESHOLDS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const RFM_CONFIG: RFMConfig = {
  // Recência: dias desde última compra → score
  recency: {
    5: 30,     // ≤30 dias = score 5
    4: 60,     // 31-60 dias
    3: 90,     // 61-90 dias
    2: 180,    // 91-180 dias
    1: 999999, // >180 dias
  },

  // Frequência: nº total de pedidos → score
  frequency: {
    5: 10,  // ≥10 pedidos
    4: 5,   // 5-9 pedidos
    3: 3,   // 3-4 pedidos
    2: 2,   // 2 pedidos
    1: 1,   // 1 pedido
  },

  // Valor: calculado por percentil da base
  monetary: {
    method: 'percentile',
    percentiles: {
      5: 80,  // Top 20%
      4: 60,  // 60-80%
      3: 40,  // 40-60%
      2: 20,  // 20-40%
      1: 0,   // Bottom 20%
    },
  },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAPA DE SCORES → SEGMENTO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const RFM_SEGMENTS: Record<string, RFMSegmentInfo> = {
  // Champions (R5 + F4-5 + M4-5)
  '555': seg('Champions', 'Compram recente, frequente e gastam muito', '#FFD700', 'bg-yellow-100', 'text-yellow-800', 1, 'crown'),
  '554': seg('Champions', 'Compram recente, frequente e gastam muito', '#FFD700', 'bg-yellow-100', 'text-yellow-800', 1, 'crown'),
  '545': seg('Champions', 'Compram recente, frequente e gastam muito', '#FFD700', 'bg-yellow-100', 'text-yellow-800', 1, 'crown'),
  '544': seg('Champions', 'Compram recente, frequente e gastam muito', '#FFD700', 'bg-yellow-100', 'text-yellow-800', 1, 'crown'),

  // Loyal Customers (R4-5 + F4-5 + M4-5)
  '455': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),
  '454': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),
  '445': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),
  '444': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),
  '553': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),
  '543': seg('Loyal Customers', 'Gastam bem e compram com frequência', '#4CAF50', 'bg-green-100', 'text-green-800', 2, 'heart'),

  // Potential Loyalist (R4-5 + F2-3 + M3-5)
  '535': seg('Potential Loyalist', 'Clientes recentes com bom potencial', '#2196F3', 'bg-blue-100', 'text-blue-800', 3, 'trending-up'),
  '534': seg('Potential Loyalist', 'Clientes recentes com bom potencial', '#2196F3', 'bg-blue-100', 'text-blue-800', 3, 'trending-up'),
  '525': seg('Potential Loyalist', 'Clientes recentes com bom potencial', '#2196F3', 'bg-blue-100', 'text-blue-800', 3, 'trending-up'),
  '524': seg('Potential Loyalist', 'Clientes recentes com bom potencial', '#2196F3', 'bg-blue-100', 'text-blue-800', 3, 'trending-up'),
  '433': seg('Potential Loyalist', 'Clientes recentes com bom potencial', '#2196F3', 'bg-blue-100', 'text-blue-800', 3, 'trending-up'),

  // New Customers (R5 + F1-2 + M-)
  '515': seg('New Customers', 'Compraram recentemente mas ainda não são frequentes', '#00BCD4', 'bg-cyan-100', 'text-cyan-800', 4, 'user-plus'),
  '514': seg('New Customers', 'Compraram recentemente mas ainda não são frequentes', '#00BCD4', 'bg-cyan-100', 'text-cyan-800', 4, 'user-plus'),
  '513': seg('New Customers', 'Compraram recentemente mas ainda não são frequentes', '#00BCD4', 'bg-cyan-100', 'text-cyan-800', 4, 'user-plus'),
  '512': seg('New Customers', 'Compraram recentemente mas ainda não são frequentes', '#00BCD4', 'bg-cyan-100', 'text-cyan-800', 4, 'user-plus'),
  '511': seg('New Customers', 'Compraram recentemente mas ainda não são frequentes', '#00BCD4', 'bg-cyan-100', 'text-cyan-800', 4, 'user-plus'),

  // Promising (R4 + F1-2)
  '415': seg('Promising', 'Compradores recentes com alto valor', '#9C27B0', 'bg-purple-100', 'text-purple-800', 5, 'star'),
  '414': seg('Promising', 'Compradores recentes com alto valor', '#9C27B0', 'bg-purple-100', 'text-purple-800', 5, 'star'),
  '413': seg('Promising', 'Compradores recentes com alto valor', '#9C27B0', 'bg-purple-100', 'text-purple-800', 5, 'star'),

  // Need Attention (R3 + F3-5 + M3-5)
  '355': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '354': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '345': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '344': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '343': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '335': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),
  '334': seg('Need Attention', 'Acima da média mas não compram há um tempo', '#FF9800', 'bg-orange-100', 'text-orange-800', 6, 'bell'),

  // About To Sleep (R2-3 + F2-3 + M2-3)
  '333': seg('About To Sleep', 'Abaixo da média, em risco de sumir', '#FF5722', 'bg-red-50', 'text-red-700', 7, 'moon'),
  '332': seg('About To Sleep', 'Abaixo da média, em risco de sumir', '#FF5722', 'bg-red-50', 'text-red-700', 7, 'moon'),
  '323': seg('About To Sleep', 'Abaixo da média, em risco de sumir', '#FF5722', 'bg-red-50', 'text-red-700', 7, 'moon'),
  '322': seg('About To Sleep', 'Abaixo da média, em risco de sumir', '#FF5722', 'bg-red-50', 'text-red-700', 7, 'moon'),

  // At Risk (R1-2 + F4-5 + M4-5)
  '255': seg('At Risk', 'Gastavam muito mas não compram há tempo', '#F44336', 'bg-red-100', 'text-red-800', 8, 'alert-triangle'),
  '254': seg('At Risk', 'Gastavam muito mas não compram há tempo', '#F44336', 'bg-red-100', 'text-red-800', 8, 'alert-triangle'),
  '245': seg('At Risk', 'Gastavam muito mas não compram há tempo', '#F44336', 'bg-red-100', 'text-red-800', 8, 'alert-triangle'),
  '244': seg('At Risk', 'Gastavam muito mas não compram há tempo', '#F44336', 'bg-red-100', 'text-red-800', 8, 'alert-triangle'),

  // Can't Lose Them (R1 + F4-5 + M5)
  '155': seg('Cant Lose Them', 'Eram os melhores, mas sumiram', '#D32F2F', 'bg-red-200', 'text-red-900', 9, 'alert-octagon'),
  '154': seg('Cant Lose Them', 'Eram os melhores, mas sumiram', '#D32F2F', 'bg-red-200', 'text-red-900', 9, 'alert-octagon'),
  '145': seg('Cant Lose Them', 'Eram os melhores, mas sumiram', '#D32F2F', 'bg-red-200', 'text-red-900', 9, 'alert-octagon'),

  // Hibernating (R1-2 + F1-2 + M3-5)
  '235': seg('Hibernating', 'Última compra há muito tempo', '#9E9E9E', 'bg-gray-100', 'text-gray-700', 10, 'pause-circle'),
  '234': seg('Hibernating', 'Última compra há muito tempo', '#9E9E9E', 'bg-gray-100', 'text-gray-700', 10, 'pause-circle'),
  '225': seg('Hibernating', 'Última compra há muito tempo', '#9E9E9E', 'bg-gray-100', 'text-gray-700', 10, 'pause-circle'),
  '224': seg('Hibernating', 'Última compra há muito tempo', '#9E9E9E', 'bg-gray-100', 'text-gray-700', 10, 'pause-circle'),

  // Lost (R1 + F1 + M1-2)
  '111': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
  '112': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
  '121': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
  '122': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
  '211': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
  '212': seg('Lost', 'Cliente perdido', '#607D8B', 'bg-gray-200', 'text-gray-600', 11, 'user-x'),
};

function seg(
  nome: RFMSegmentName,
  descricao: string,
  cor: string,
  bgColor: string,
  textColor: string,
  prioridade: number,
  icon: string
): RFMSegmentInfo {
  return { nome, descricao, cor, bgColor, textColor, prioridade, icon };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AÇÕES RECOMENDADAS POR SEGMENTO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const RFM_ACTIONS: Record<RFMSegmentName, string[]> = {
  'Champions': [
    'Recompensar com programa VIP exclusivo',
    'Solicitar feedback e depoimentos',
    'Acesso antecipado a lançamentos',
    'Oferecer produtos premium',
  ],
  'Loyal Customers': [
    'Programa de indicação com benefícios',
    'Cross-sell de produtos complementares',
    'Oferecer upsell para categorias premium',
  ],
  'Potential Loyalist': [
    'Completar perfil e preferências',
    'Programa de fidelidade',
    'Educar sobre outros produtos',
  ],
  'New Customers': [
    'Sequência de onboarding (boas-vindas)',
    'Cupom para segunda compra',
    'Educação sobre categorias de produtos',
  ],
  'Promising': [
    'Incentivo para segunda compra',
    'Compartilhar cases de sucesso',
    'Oferecer frete grátis na próxima',
  ],
  'Need Attention': [
    'Enviar ofertas limitadas',
    'Recomendar produtos baseado em histórico',
    'Cupom de reativação 15-20%',
  ],
  'About To Sleep': [
    'Mensagem "Sentimos sua falta"',
    'Cupom agressivo 20-25%',
    'Mostrar novidades desde última visita',
  ],
  'At Risk': [
    '⚠️ URGENTE: Cupom agressivo 25-30%',
    'Ligar pessoalmente',
    'Pesquisa: "Por que parou de comprar?"',
  ],
  'Cant Lose Them': [
    '🚨 CRÍTICO: Oferta irrecusável',
    'Contato executivo/gerente',
    'Win-back campaign personalizada',
  ],
  'Hibernating': [
    'Campanha de reativação básica',
    'Novidades e lançamentos',
    'Pesquisa de satisfação',
  ],
  'Lost': [
    'Campanha de despedida com última chance',
    'Pesquisa de saída',
    'Reduzir frequência de comunicação',
  ],
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPERS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Resolve o segmento RFM a partir de um score "RFM" (ex: "532").
 * Se não há mapeamento exato, faz fuzzy match pelo segmento mais próximo.
 */
export function resolveSegment(rfmScore: string): RFMSegmentInfo {
  if (RFM_SEGMENTS[rfmScore]) return RFM_SEGMENTS[rfmScore];

  // Fallback: encontrar o match mais próximo
  const r = parseInt(rfmScore[0]) || 1;
  const f = parseInt(rfmScore[1]) || 1;
  const m = parseInt(rfmScore[2]) || 1;

  // Heurísticas de fallback
  if (r >= 4 && f >= 4) return RFM_SEGMENTS['555'] || RFM_SEGMENTS['444'];
  if (r >= 4 && f <= 2) return RFM_SEGMENTS['511'] || RFM_SEGMENTS['515'];
  if (r <= 2 && f >= 4) return RFM_SEGMENTS['155'] || RFM_SEGMENTS['255'];
  if (r <= 2 && f <= 2 && m <= 2) return RFM_SEGMENTS['111'];
  if (r === 3) return RFM_SEGMENTS['333'] || RFM_SEGMENTS['334'];

  return RFM_SEGMENTS['111'];
}

/**
 * Retorna ações recomendadas para um segmento.
 */
export function getActionsForSegment(segment: RFMSegmentName): string[] {
  return RFM_ACTIONS[segment] || RFM_ACTIONS['Lost'];
}
