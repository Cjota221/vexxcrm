// AGENTE CLÁUDIO — Refinador de públicos Meta Ads.
// Recebe análise do José, traduz para configuração técnica pronta para criar
// via Meta Ads API: interesses por nome, geo_locations, targeting completo.
// Usa OpenAI GPT-4o-mini (HTTP direto, sem SDK).

import type { JoseAudienceAnalysis } from './jose-audience-analyst.service';

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos de saída ─────────────────────────────────────────────────────────── */

export interface CopyPublico {
  headline: string;
  texto: string;
  cta: string;
}

export interface PublicoConfigurado {
  nome_interno: string;
  nome_meta: string;
  descricao: string;
  targeting: {
    age_min: number;
    age_max: number;
    genders: number[];
    geo_locations: {
      countries: string[];
      regions?: Array<{ key: string; name: string }>;
    };
    interests: Array<{ name: string }>;
    behaviors?: Array<{ name: string }>;
    excluded_connections?: unknown[];
    flexible_spec?: Array<{ interests: Array<{ name: string }> }>;
  };
  estrategia_uso: string;
  copy_sugerido: CopyPublico;
  justificativa_jose?: string;
}

export interface ClaudioAudienceConfig {
  publicos_configurados: PublicoConfigurado[];
}

/* ─── Prompt do Cláudio ──────────────────────────────────────────────────────── */

function buildClaudioPrompt(joseAnalysis: JoseAudienceAnalysis): string {
  return `Você é o CLÁUDIO, estrategista de tráfego pago especializado em moda feminina e franquias no Brasil.

Com base na análise do José, refine e complete a configuração técnica de cada público para criar via Meta Ads API.

Contexto CJ Rasteirinhas:
- Produto: rasteirinhas femininas atacado (mínimo 5 pares, R$25-49,90/par)
- C4 Franquias: site próprio de revenda, modelo dropshipping
- Instagram: @cjotarasteirinhas
- Público que CONVERTE: mulheres empreendedoras buscando renda extra

REGRAS PARA INTERESSES:
Use APENAS nomes de interesses reais disponíveis no Meta em português brasileiro.
Exemplos válidos: "Atacado", "Moda", "Empreendedorismo", "Franquia", "Renda extra",
"Revenda de roupas", "Negócio próprio", "Calçados femininos", "Loja de roupas",
"Vestuário", "Costura e artesanato", "Pequenos negócios", "Marketing digital",
"Comércio eletrônico", "Moda feminina", "Compras online", "Varejo"

REGRAS PARA COPY:
- headline: máximo 40 caracteres
- texto: máximo 125 caracteres, linguagem direta e empolgante
- cta: uma das opções do Meta: "Saiba mais", "Comprar agora", "Cadastre-se", "Entrar em contato"

Análise do José:
${JSON.stringify(joseAnalysis, null, 2)}

Retorne APENAS JSON válido (sem texto antes ou depois):
{
  "publicos_configurados": [
    {
      "nome_interno": "revendedoras",
      "nome_meta": "CJ — Revendedoras Brasil",
      "descricao": "Mulheres empreendedoras interessadas em revenda de calçados femininos",
      "targeting": {
        "age_min": 25,
        "age_max": 50,
        "genders": [2],
        "geo_locations": {
          "countries": ["BR"],
          "regions": []
        },
        "interests": [
          { "name": "Atacado" },
          { "name": "Revenda de roupas" }
        ],
        "behaviors": [],
        "flexible_spec": [
          { "interests": [{ "name": "Renda extra" }, { "name": "Negócio próprio" }] }
        ]
      },
      "estrategia_uso": "Usar em campanhas de topo de funil para captação de novas revendedoras",
      "copy_sugerido": {
        "headline": "Revenda e lucre de casa",
        "texto": "Venda rasteirinhas a partir de R$25/par. Sem estoque, sem risco. Comece hoje!",
        "cta": "Saiba mais"
      }
    }
  ]
}`;
}

/* ─── Função principal ───────────────────────────────────────────────────────── */

/**
 * AGENTE CLÁUDIO — Refina análise do José e gera configuração técnica dos públicos.
 *
 * @param joseAnalysis - Análise do José com recomendações de segmentação
 * @param apiKey       - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function claudioRefiniarPublicos(
  joseAnalysis: JoseAudienceAnalysis,
  apiKey?: string,
): Promise<ClaudioAudienceConfig> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para o Cláudio');

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        { role: 'user', content: buildClaudioPrompt(joseAnalysis) },
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

  const text = data.choices[0]?.message?.content || '';

  // Extrair JSON (Cláudio às vezes adiciona texto antes/depois)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Cláudio retornou resposta sem JSON válido');

  try {
    return JSON.parse(jsonMatch[0]) as ClaudioAudienceConfig;
  } catch {
    throw new Error('Cláudio retornou JSON inválido na configuração de públicos');
  }
}
