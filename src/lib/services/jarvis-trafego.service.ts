/**
 * JARVIS — Motor de inteligência de tráfego pago.
 * Substitui José + Cláudio + Pedro com Claude Haiku.
 * Retorna os mesmos tipos das interfaces originais para compatibilidade total.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { JoseAnalysis } from './jose-analyst.service';
import type { ClaudioStrategy } from './claudio-strategist.service';
import type { ClaudioAudienceConfig } from './claudio-audience-creator.service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const JARVIS_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

const JARVIS_TRAFEGO_SYSTEM = `Você é o JARVIS, motor de inteligência de tráfego pago da CJ Rasteirinhas.

NEGÓCIO: Atacado de rasteirinhas femininas, fabricação própria em Goiânia-BR.
PÚBLICO-ALVO: Mulheres 25-55 anos, empreendedoras, revendedoras, Brasil.
ROAS MÍNIMO: 3x | CPL MÁXIMO: R$15 | CPC MÁXIMO: R$1,50

Você analisa dados reais e retorna APENAS JSON válido, sem texto adicional.
Nunca invente métricas. Seja direto e preciso.`;

/* ─── Análise de campanhas (substitui José) ──────────────────────────────── */

export async function jarvisAnalisarCampanhas(
  metrics: unknown[],
  apiKey?: string,
): Promise<JoseAnalysis> {
  const client = apiKey ? new Anthropic({ apiKey }) : anthropic;

  const response = await client.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 1024,
    system: JARVIS_TRAFEGO_SYSTEM,
    messages: [{
      role: 'user',
      content: `Analise estas métricas de campanhas Meta Ads e retorne JSON exato:
{
  "ruins": [{"campaign_id":"","campaign_name":"","motivo":"","metricas_problema":{}}],
  "escalando": [{"campaign_id":"","campaign_name":"","motivo":"","metricas_problema":{}}],
  "pausar_imediato": [{"ad_id":"","ad_name":"","motivo":""}],
  "anomalias": [{"descricao":"","impacto":""}],
  "resumo_executivo": "2 frases em português simples para a Carol",
  "gasto_total": 0,
  "roas_medio": 0,
  "alertas_criticos": ["string"]
}

Métricas: ${JSON.stringify(metrics).slice(0, 3000)}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as JoseAnalysis;
  } catch {
    return {
      ruins: [], escalando: [], pausar_imediato: [], anomalias: [],
      resumo_executivo: 'Não foi possível analisar as métricas.',
      gasto_total: 0, roas_medio: 0, alertas_criticos: [],
    };
  }
}

/* ─── Geração de estratégia + copies (substitui Cláudio + Pedro) ─────────── */

export async function jarvisGerarEstrategia(
  analise: JoseAnalysis,
  brandContext: { produto: string; publico: string; ticket: string; objetivo: string },
  apiKey?: string,
): Promise<ClaudioStrategy> {
  const client = apiKey ? new Anthropic({ apiKey }) : anthropic;

  const response = await client.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 1500,
    system: JARVIS_TRAFEGO_SYSTEM,
    messages: [{
      role: 'user',
      content: `Com base na análise abaixo, gere estratégia completa em JSON exato:
{
  "acoes": [{
    "tipo": "pausar_anuncio|escalar_orcamento|reduzir_orcamento|criar_copy|testar_publico",
    "alvo_id": "id da campanha/anúncio",
    "alvo_nome": "nome legível",
    "parametros": {},
    "motivo": "explicação em linguagem simples",
    "impacto_esperado": "o que vai mudar",
    "urgencia": "imediata|proximas_24h|proxima_semana"
  }],
  "copies_novos": [{
    "para_substituir_id": "",
    "para_substituir_nome": "",
    "headline": "máx 40 chars",
    "texto_principal": "máx 125 chars",
    "cta": "Saiba mais",
    "publico_sugerido": "quem vai ver",
    "justificativa": "por que vai converter"
  }],
  "publicos_novos": [],
  "insights": "2-3 frases sobre panorama geral"
}

Contexto do negócio: ${JSON.stringify(brandContext)}
Análise: ${JSON.stringify(analise).slice(0, 2000)}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as ClaudioStrategy;
  } catch {
    return { acoes: [], copies_novos: [], publicos_novos: [], insights: '' };
  }
}

/* ─── Resumo executivo de performance (substitui OpenAI em jose-performance-analyst) ── */

export async function jarvisGerarResumoPerformance(
  resumoCampanhas: string,
  resumoAlertas: string,
  totais: { gasto: number; retorno: number; roas: number; leads: number },
  apiKey?: string,
): Promise<{
  resumo_executivo: string;
  acoes_urgentes: Array<{ campanha_nome: string; acao: string; motivo: string; urgencia: string }>;
}> {
  const client = apiKey ? new Anthropic({ apiKey }) : anthropic;

  const response = await client.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 800,
    system: JARVIS_TRAFEGO_SYSTEM,
    messages: [{
      role: 'user',
      content: `Analise as campanhas abaixo e retorne JSON com resumo e ações urgentes:
{
  "resumo_executivo": "2-3 frases em português simples explicando a situação para uma empreendedora sem conhecimento técnico. Mencione os números mais importantes.",
  "acoes_urgentes": [
    {
      "campanha_nome": "nome da campanha",
      "acao": "o que fazer em palavras simples",
      "motivo": "por que fazer isso",
      "urgencia": "imediata|proximas_24h|proxima_semana"
    }
  ]
}

CAMPANHAS:
${resumoCampanhas}

ALERTAS:
${resumoAlertas}

TOTAIS: Investido R$${totais.gasto.toFixed(0)}, retorno R$${totais.retorno.toFixed(0)}, ROAS ${totais.roas.toFixed(1)}x, ${totais.leads} leads`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { resumo_executivo: '', acoes_urgentes: [] };
  }
}

/* ─── Criação de públicos (substitui José Audience + Cláudio Audience) ───── */

export async function jarvisAnalisarParaPublicos(
  tenantId: string,
  dadosCRM: unknown,
  apiKey?: string,
): Promise<ClaudioAudienceConfig & { analise_resumo: string }> {
  const client = apiKey ? new Anthropic({ apiKey }) : anthropic;

  const response = await client.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 1500,
    system: JARVIS_TRAFEGO_SYSTEM,
    messages: [{
      role: 'user',
      content: `Analise os dados do CRM e crie 4 públicos segmentados para Meta Ads.
Retorne JSON exato:
{
  "analise_resumo": "1 frase explicando os públicos escolhidos",
  "publicos_configurados": [{
    "nome_interno": "slug_sem_espacos",
    "nome_meta": "CJ — Nome do Público (máx 60 chars)",
    "descricao": "descrição em 1 linha",
    "targeting": {
      "age_min": 25,
      "age_max": 55,
      "genders": [2],
      "geo_locations": {"countries": ["BR"]},
      "interests": [{"name": "Moda Feminina"}, {"name": "Empreendedorismo"}],
      "behaviors": []
    },
    "estrategia_uso": "quando usar este público",
    "copy_sugerido": {
      "headline": "máx 40 chars",
      "texto": "máx 125 chars",
      "cta": "Saiba mais"
    },
    "justificativa_jose": "por que esse público converte para CJ Rasteirinhas"
  }]
}

Use apenas interesses reais do Meta em português: "Atacado", "Moda", "Empreendedorismo",
"Franquia", "Renda extra", "Revenda de roupas", "Negócio próprio", "Calçados femininos",
"Loja de roupas", "Moda feminina", "Pequenos negócios", "Marketing digital".

Dados CRM: ${JSON.stringify(dadosCRM).slice(0, 2000)}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as ClaudioAudienceConfig & { analise_resumo: string };
  } catch {
    return {
      analise_resumo: 'Não foi possível gerar públicos.',
      publicos_configurados: [],
    };
  }
}
