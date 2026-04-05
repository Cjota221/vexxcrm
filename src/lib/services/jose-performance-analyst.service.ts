// AGENTE JOSÉ — Analista de Performance de Campanhas Meta Ads
// Diferente do jose-audience-analyst (que olha o CRM para criar públicos),
// este serviço analisa as campanhas ATIVAS no Meta Ads e identifica
// problemas, oportunidades e ações urgentes.
// Usa Jarvis (Claude Haiku) para resumo executivo.

import { jarvisGerarResumoPerformance } from './jarvis-trafego.service';

/* ─── Thresholds de alerta ────────────────────────────────────────────────── */

export const THRESHOLDS = {
  ROAS_OTIMO:       3.0,
  ROAS_ATENCAO:     1.5,
  CPL_IDEAL_MAX:    20,
  CPL_URGENTE:      30,
  CPM_ALERTA:       25,
  CTR_MINIMO:       0.8,
  FREQUENCIA_MAX:   4.0,
  CPC_ALTO:         5.0,
  GASTO_MIN_AVALIAR: 20, // R$ mínimo gasto para avaliar uma campanha
};

/* ─── Tipos ───────────────────────────────────────────────────────────────── */

export interface CampanhaParaAnalise {
  id: string;
  nome: string;
  status: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  roas: number;
  cpl: number;
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
  orcamento_diario: number | null;
}

export interface AlertaPerformance {
  campanha_id: string;
  campanha_nome: string;
  tipo: 'danger' | 'warning';
  metrica: string;
  valor_atual: string;
  valor_ideal: string;
  mensagem: string;
  acao_sugerida: 'pausar' | 'reduzir_orcamento' | 'novo_publico' | 'novo_criativo' | 'aumentar_orcamento' | 'monitorar';
}

export interface JoseAnalisePerformance {
  resumo_executivo: string;          // 2-3 frases do José em português simples
  situacao_geral: 'otima' | 'boa' | 'atencao' | 'critica';
  alertas: AlertaPerformance[];
  oportunidades: Array<{
    campanha_id: string;
    campanha_nome: string;
    descricao: string;
    acao: 'aumentar_orcamento' | 'expandir_publico' | 'duplicar_campanha';
    impacto_esperado: string;
  }>;
  acoes_urgentes: Array<{
    campanha_id: string;
    campanha_nome: string;
    acao: string;
    motivo: string;
    urgencia: 'imediata' | 'proximas_24h' | 'proxima_semana';
  }>;
  metricas_consolidadas: {
    gasto_total: number;
    retorno_total: number;
    roas_medio: number;
    leads_total: number;
    cpl_medio: number;
    campanhas_ativas: number;
    campanhas_problemas: number;
  };
}

/* ─── Análise local (sem IA) — gera alertas baseados nos thresholds ────────── */

function analisarLocalmente(campanhas: CampanhaParaAnalise[]): AlertaPerformance[] {
  const alertas: AlertaPerformance[] = [];

  for (const c of campanhas) {
    if (c.status === 'PAUSED') continue;
    if (c.spend < THRESHOLDS.GASTO_MIN_AVALIAR) continue;

    if (c.roas < THRESHOLDS.ROAS_ATENCAO && c.spend > 50) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'danger',
        metrica: 'ROAS',
        valor_atual: `${c.roas.toFixed(1)}x`,
        valor_ideal: 'acima de 3x',
        mensagem: `Gastou R$${c.spend.toFixed(0)} e gerou R$${c.revenue.toFixed(0)} (ROAS ${c.roas.toFixed(1)}x — abaixo do mínimo de 1.5x)`,
        acao_sugerida: 'pausar',
      });
    }

    if (c.cpl > THRESHOLDS.CPL_URGENTE && c.leads > 0) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'danger',
        metrica: 'CPL',
        valor_atual: `R$${c.cpl.toFixed(0)}/lead`,
        valor_ideal: 'R$5–R$20',
        mensagem: `Cada lead custando R$${c.cpl.toFixed(0)} — ${((c.cpl / 20 - 1) * 100).toFixed(0)}% acima do ideal`,
        acao_sugerida: 'novo_publico',
      });
    }

    if (c.frequency > THRESHOLDS.FREQUENCIA_MAX) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'warning',
        metrica: 'Frequência',
        valor_atual: `${c.frequency.toFixed(1)}x`,
        valor_ideal: '1.5–3x',
        mensagem: `Público saturando — cada pessoa viu o anúncio ${c.frequency.toFixed(1)} vezes`,
        acao_sugerida: 'novo_publico',
      });
    }

    if (c.cpm > THRESHOLDS.CPM_ALERTA && c.impressions > 1000) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'warning',
        metrica: 'CPM',
        valor_atual: `R$${c.cpm.toFixed(0)}/mil`,
        valor_ideal: 'R$8–R$15',
        mensagem: `Custo para aparecer alto: R$${c.cpm.toFixed(0)} por 1000 exibições`,
        acao_sugerida: 'monitorar',
      });
    }

    if (c.ctr < THRESHOLDS.CTR_MINIMO && c.impressions > 500) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'warning',
        metrica: 'CTR',
        valor_atual: `${c.ctr.toFixed(1)}%`,
        valor_ideal: 'acima de 1.5%',
        mensagem: `Poucas pessoas clicam: ${c.ctr.toFixed(1)}% — criativo pode estar cansado`,
        acao_sugerida: 'novo_criativo',
      });
    }

    if (c.spend > 50 && c.leads === 0 && c.roas < 0.1) {
      alertas.push({
        campanha_id: c.id,
        campanha_nome: c.nome,
        tipo: 'danger',
        metrica: 'Resultado',
        valor_atual: 'zero leads, zero vendas',
        valor_ideal: 'ao menos 1 lead por R$20',
        mensagem: `Gastou R$${c.spend.toFixed(0)} sem nenhum resultado — pausar urgente`,
        acao_sugerida: 'pausar',
      });
    }

    // Oportunidade: campanha boa com ROAS alto pode escalar
    // (tratado separadamente abaixo)
  }

  return alertas;
}

function identificarOportunidades(campanhas: CampanhaParaAnalise[]) {
  return campanhas
    .filter((c) => c.status === 'ACTIVE' && c.roas >= THRESHOLDS.ROAS_OTIMO && c.spend >= 20)
    .map((c) => ({
      campanha_id: c.id,
      campanha_nome: c.nome,
      descricao: `ROAS ${c.roas.toFixed(1)}x — retorno excelente, pode escalar`,
      acao: 'aumentar_orcamento' as const,
      impacto_esperado: `Aumento de 20% no orçamento deve gerar proporcionalmente mais leads mantendo ROAS`,
    }));
}

function calcularSituacaoGeral(campanhas: CampanhaParaAnalise[], alertas: AlertaPerformance[]): 'otima' | 'boa' | 'atencao' | 'critica' {
  const dangers = alertas.filter(a => a.tipo === 'danger').length;
  const ativas = campanhas.filter(c => c.status === 'ACTIVE').length;
  if (dangers === 0 && ativas > 0) {
    const roasMedio = campanhas.filter(c => c.status === 'ACTIVE')
      .reduce((s, c) => s + c.roas, 0) / ativas;
    return roasMedio >= THRESHOLDS.ROAS_OTIMO ? 'otima' : 'boa';
  }
  if (dangers >= ativas * 0.5) return 'critica';
  return 'atencao';
}

/* ─── Análise com José (GPT-4o-mini) ─────────────────────────────────────── */

export async function analisarPerformanceComJose(
  campanhas: CampanhaParaAnalise[],
  _apiKey?: string,
): Promise<JoseAnalisePerformance> {

  const alertas = analisarLocalmente(campanhas);
  const oportunidades = identificarOportunidades(campanhas);
  const situacao = calcularSituacaoGeral(campanhas, alertas);

  const gasto_total   = campanhas.reduce((s, c) => s + c.spend, 0);
  const retorno_total = campanhas.reduce((s, c) => s + c.revenue, 0);
  const leads_total   = campanhas.reduce((s, c) => s + c.leads, 0);
  const campanhas_ativas = campanhas.filter(c => c.status === 'ACTIVE').length;
  const campanhas_problemas = alertas.filter(a => a.tipo === 'danger')
    .map(a => a.campanha_id)
    .filter((v, i, arr) => arr.indexOf(v) === i).length;
  const roas_medio = gasto_total > 0 ? retorno_total / gasto_total : 0;
  const cpl_medio  = leads_total > 0 ? gasto_total / leads_total : 0;

  const metricas_consolidadas = {
    gasto_total, retorno_total, roas_medio, leads_total,
    cpl_medio, campanhas_ativas, campanhas_problemas,
  };

  // Montar contexto para o José
  const resumoCampanhas = campanhas.map((c) =>
    `- ${c.nome} (${c.status}): R$${c.spend.toFixed(0)} gasto, ROAS ${c.roas.toFixed(1)}x, ` +
    `${c.leads} leads, CPL R$${c.cpl.toFixed(0)}, freq ${c.frequency.toFixed(1)}, CTR ${c.ctr.toFixed(1)}%`
  ).join('\n');

  const resumoAlertas = alertas.length > 0
    ? alertas.map(a => `- ${a.campanha_nome}: ${a.mensagem}`).join('\n')
    : 'Nenhum alerta crítico.';

  let resumo_executivo = '';
  const acoes_urgentes: JoseAnalisePerformance['acoes_urgentes'] = [];

  try {
    const jarvisResult = await jarvisGerarResumoPerformance(
      resumoCampanhas,
      resumoAlertas,
      { gasto: gasto_total, retorno: retorno_total, roas: roas_medio, leads: leads_total },
    );

    resumo_executivo = jarvisResult.resumo_executivo || '';

    for (const a of jarvisResult.acoes_urgentes || []) {
      const campanha = campanhas.find(c => c.nome.toLowerCase().includes(a.campanha_nome.toLowerCase()));
      acoes_urgentes.push({
        campanha_id: campanha?.id || '',
        campanha_nome: a.campanha_nome,
        acao: a.acao,
        motivo: a.motivo,
        urgencia: (a.urgencia as 'imediata' | 'proximas_24h' | 'proxima_semana') || 'proximas_24h',
      });
    }
  } catch (err) {
    console.error('[jose-performance-analyst] jarvisGerarResumoPerformance falhou:', err);
    // Fallback: resumo gerado localmente
  }

  // Fallback de resumo se IA falhou
  if (!resumo_executivo) {
    if (situacao === 'otima') {
      resumo_executivo = `Campanhas funcionando bem! Investimento de R$${gasto_total.toFixed(0)} gerou R$${retorno_total.toFixed(0)} (ROAS ${roas_medio.toFixed(1)}x). Nenhum problema crítico identificado.`;
    } else if (situacao === 'critica') {
      resumo_executivo = `Atenção: ${campanhas_problemas} campanha(s) com problema crítico. Investiu R$${gasto_total.toFixed(0)} com ROAS de apenas ${roas_medio.toFixed(1)}x. Ação imediata necessária.`;
    } else {
      resumo_executivo = `Investimento de R$${gasto_total.toFixed(0)}, retorno R$${retorno_total.toFixed(0)} (ROAS ${roas_medio.toFixed(1)}x). ${alertas.length} ponto(s) de atenção identificados.`;
    }
  }

  // Gerar ações urgentes a partir dos alertas caso a IA não tenha retornado
  if (acoes_urgentes.length === 0 && alertas.filter(a => a.tipo === 'danger').length > 0) {
    for (const alerta of alertas.filter(a => a.tipo === 'danger')) {
      acoes_urgentes.push({
        campanha_id: alerta.campanha_id,
        campanha_nome: alerta.campanha_nome,
        acao: alerta.acao_sugerida === 'pausar'
          ? 'Pausar campanha imediatamente'
          : alerta.acao_sugerida === 'novo_publico'
          ? 'Criar novo público para essa campanha'
          : 'Revisar campanha',
        motivo: alerta.mensagem,
        urgencia: 'proximas_24h',
      });
    }
  }

  return {
    resumo_executivo,
    situacao_geral: situacao,
    alertas,
    oportunidades,
    acoes_urgentes,
    metricas_consolidadas,
  };
}
