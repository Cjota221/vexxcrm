// ANTES: não existia pesquisa de tendências de mercado.
// DEPOIS: AGENTE PEDRO — pesquisador de tendências (Perplexity Sonar).
//         Busca tendências de mercado em tempo real para embasar estratégias
//         de campanha. Retorna insights acionáveis e oportunidades sazonais.

const PERPLEXITY_BASE = 'https://api.perplexity.ai';

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

/* ─── Queries por nicho ─────────────────────────────────────────────────────── */

function buildSearchQuery(produto: string, publico: string): string {
  return `Tendências de mercado e oportunidades de campanha Meta Ads para: ${produto}.
Público-alvo: ${publico}.
Contexto: Brasil, março de 2026.
Inclua: tendências de consumo, eventos sazonais próximos, estratégias de concorrentes,
palavras-chave em alta, oportunidades de nicho.`;
}

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE PEDRO — Pesquisa tendências em tempo real via Perplexity Sonar.
 *
 * @param produto   - Produto/nicho da marca (ex: "rasteirinhas femininas")
 * @param publico   - Público-alvo (ex: "mulheres 25-45, sul/sudeste")
 * @param apiKey    - Perplexity API Key (usa PERPLEXITY_API_KEY env var se não fornecida)
 */
export async function pedroResearchTrends(
  produto: string,
  publico: string,
  apiKey?: string,
): Promise<PedroResearch> {
  const key = apiKey || process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY não configurada para o Pedro');

  const systemPrompt = `Você é o PEDRO, pesquisador especializado em tendências de mercado para e-commerce brasileiro.
Sua função é encontrar tendências e oportunidades de campanha em tempo real.
Responda SEMPRE em português brasileiro.
Estruture sua resposta como JSON válido com o formato especificado.
Baseie-se em dados reais e recentes — esta é sua principal vantagem.`;

  const userMessage = buildSearchQuery(produto, publico) + `

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
  "fontes": ["url1", "url2"]
}`;

  const response = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',  // modelo com acesso à internet
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2000,
      temperature: 0.2,
      return_citations: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Perplexity HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    // Fallback: se não retornou JSON, construir estrutura mínima com o texto
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
