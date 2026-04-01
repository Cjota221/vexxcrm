// AGENTE PEDRO — pesquisador de tendências (OpenAI GPT-4o-mini).
//         Analisa tendências de mercado para embasar estratégias de campanha.
//         Retorna insights acionáveis e oportunidades sazonais.

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

export interface TrendInsight {
  titulo: string;
  descricao: string;
  fonte: string;
  relevancia: 'alta' | 'media' | 'baixa';
  oportunidade: string;           // o que fazer com essa tendência
  janela_temporal: string;        // ex: "próximos 15 dias", "mês inteiro"
}

export interface PedroResearch {
  tendencias: TrendInsight[];
  oportunidades_sazonais: Array<{
    evento: string;
    data: string;
    acao_sugerida: string;
    budget_sugerido: string;
  }>;
  concorrentes_destaque: Array<{
    descricao: string;
    estrategia: string;
  }>;
  resumo: string;
  fontes: string[];
}

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE PEDRO — Analisa tendências de mercado via GPT-4o-mini.
 *
 * @param produto   - Produto/nicho da marca (ex: "rasteirinhas femininas")
 * @param publico   - Público-alvo (ex: "mulheres 25-45, sul/sudeste")
 * @param apiKey    - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function pedroResearchTrends(
  produto: string,
  publico: string,
  apiKey?: string,
): Promise<PedroResearch> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para o Pedro');

  const systemPrompt = `Você é o PEDRO, pesquisador especializado em tendências de mercado para e-commerce brasileiro.
Sua função é analisar tendências e oportunidades de campanha com base no seu conhecimento atualizado.
Responda SEMPRE em português brasileiro.
Estruture sua resposta como JSON válido com o formato especificado.
Baseie-se em tendências reais do mercado brasileiro de e-commerce.`;

  const userMessage = `Analise tendências de mercado e oportunidades de campanha Meta Ads para: ${produto}.
Público-alvo: ${publico}.
Contexto: Brasil, 2025/2026.
Inclua: tendências de consumo, eventos sazonais próximos, estratégias de nicho,
palavras-chave em alta, oportunidades identificadas.

Retorne JSON com este formato exato:
{
  "tendencias": [
    {
      "titulo": "string",
      "descricao": "string",
      "fonte": "string (site/plataforma)",
      "relevancia": "alta|media|baixa",
      "oportunidade": "string (o que fazer)",
      "janela_temporal": "string"
    }
  ],
  "oportunidades_sazonais": [
    {
      "evento": "string",
      "data": "string",
      "acao_sugerida": "string",
      "budget_sugerido": "string"
    }
  ],
  "concorrentes_destaque": [
    {
      "descricao": "string",
      "estrategia": "string"
    }
  ],
  "resumo": "string (2-3 frases)",
  "fontes": ["string"]
}`;

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      tendencias: [],
      oportunidades_sazonais: [],
      concorrentes_destaque: [],
      resumo: text.slice(0, 500),
      fontes: [],
    };
  }

  try {
    return JSON.parse(jsonMatch[0]) as PedroResearch;
  } catch {
    return {
      tendencias: [],
      oportunidades_sazonais: [],
      concorrentes_destaque: [],
      resumo: text.slice(0, 500),
      fontes: [],
    };
  }
}
