// ANTES: não existia análise de métricas de Meta Ads.
// DEPOIS: AGENTE JOSÉ — analista de métricas (GPT-4o-mini).
//         Recebe dados brutos do Meta, analisa performance de campanhas e
//         retorna diagnóstico estruturado em JSON para o Cláudio processar.

import type { MetaCampaignMetrics } from './meta-ads.service';

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos de saída ───────────────────────────────────────────────────────── */

export interface CampaignDiagnosis {
  campaign_id: string;
  campaign_name: string;
  motivo: string;
  metricas_problema: Record<string, number | string>;
}

export interface JoseAnalysis {
  ruins: CampaignDiagnosis[];
  escalando: CampaignDiagnosis[];
  pausar_imediato: Array<{ ad_id: string; ad_name: string; motivo: string }>;
  anomalias: Array<{ descricao: string; impacto: string }>;
  resumo_executivo: string;
  gasto_total: number;
  roas_medio: number;
  alertas_criticos: string[];
}

/* ─── System prompt do José ──────────────────────────────────────────────────── */

const JOSE_SYSTEM_PROMPT = `Você é o JOSÉ, analista especialista em Meta Ads do VEXX CRM.
Sua função é analisar métricas brutas de campanhas e retornar um diagnóstico objetivo.

CRITÉRIOS (aplique sempre):
- Campanha RUIM: ROAS < 1.5 por mais de 3 dias, CPC > R$5, CTR < 0.5%
- Campanha ESCALANDO: ROAS > 3.0, CTR > 2%, conversões crescendo
- PAUSAR IMEDIATO: gasto > R$50 sem nenhuma conversão nos últimos 7 dias
- ANOMALIA: variação brusca de métricas (> 50% em 24h)

REGRAS:
- Retorne APENAS JSON válido, sem texto adicional
- Use valores numéricos reais — nunca invente dados
- Se não houver campanhas ruins, retorne arrays vazios
- O resumo_executivo deve ser em português simples (não técnico)

Formato obrigatório:
{
  "ruins": [{ "campaign_id": "string", "campaign_name": "string", "motivo": "string", "metricas_problema": {} }],
  "escalando": [{ "campaign_id": "string", "campaign_name": "string", "motivo": "string", "metricas_problema": {} }],
  "pausar_imediato": [{ "ad_id": "string", "ad_name": "string", "motivo": "string" }],
  "anomalias": [{ "descricao": "string", "impacto": "string" }],
  "resumo_executivo": "string",
  "gasto_total": 0,
  "roas_medio": 0,
  "alertas_criticos": ["string"]
}`;

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE JOSÉ — Analisa métricas do Meta Ads com GPT-4o-mini.
 *
 * @param metrics   - Dados brutos de campaignsdo Meta (de fetchCampaignMetrics)
 * @param apiKey    - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function joseAnalyzeMetrics(
  metrics: MetaCampaignMetrics[],
  apiKey?: string,
): Promise<JoseAnalysis> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para o José');

  if (metrics.length === 0) {
    return {
      ruins: [],
      escalando: [],
      pausar_imediato: [],
      anomalias: [],
      resumo_executivo: 'Nenhuma campanha encontrada para análise.',
      gasto_total: 0,
      roas_medio: 0,
      alertas_criticos: [],
    };
  }

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,   // baixo para análise precisa e reproduzível
      max_tokens: 2000,
      messages: [
        { role: 'system', content: JOSE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analise estas ${metrics.length} campanhas:\n\n${JSON.stringify(metrics, null, 2)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  try {
    return JSON.parse(data.choices[0].message.content) as JoseAnalysis;
  } catch {
    throw new Error('José retornou JSON inválido');
  }
}
