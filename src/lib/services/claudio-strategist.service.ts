// AGENTE CLÁUDIO — estrategista + copywriter (OpenAI GPT-4o-mini).
//         Recebe análise do José e contexto de marca, decide ações estratégicas
//         e gera copies de anúncio prontos. Nunca executa — apenas sugere.
//         Usa OpenAI API via HTTP (padrão do projeto).

import type { JoseAnalysis } from './jose-analyst.service';

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos de entrada ──────────────────────────────────────────────────────── */

export interface BrandContext {
  produto: string;      // ex: "rasteirinhas femininas para revenda"
  publico: string;      // ex: "mulheres 25-45, renda C/B, sul/sudeste"
  ticket: string;       // ex: "R$ 120-350"
  objetivo: string;     // ex: "geração de leads para revendedoras C4 Franquias"
}

/* ─── Tipos de saída ────────────────────────────────────────────────────────── */

export type ActionType =
  | 'pausar_anuncio'
  | 'escalar_orcamento'
  | 'reduzir_orcamento'
  | 'criar_copy'
  | 'testar_publico';

export interface AIAction {
  tipo: ActionType;
  alvo_id: string;
  alvo_nome: string;
  parametros: Record<string, unknown>;
  motivo: string;              // linguagem simples para a operadora
  impacto_esperado: string;
  urgencia: 'imediata' | 'proximas_24h' | 'proxima_semana';
}

export interface GeneratedCopy {
  para_substituir_id: string;
  para_substituir_nome: string;
  headline: string;            // máx 40 chars
  texto_principal: string;     // máx 125 chars
  cta: string;                 // ex: "Comprar agora"
  publico_sugerido: string;
  justificativa: string;
}

export interface ClaudioStrategy {
  acoes: AIAction[];
  copies_novos: GeneratedCopy[];
  publicos_novos: Array<{
    nome: string;
    descricao: string;
    tipo: 'interesse' | 'lookalike' | 'remarketing';
    configuracao: string;
  }>;
  insights: string;            // 2-3 frases sobre panorama geral
}

/* ─── System prompt do Cláudio ───────────────────────────────────────────────── */

function buildClaudioPrompt(brand: BrandContext): string {
  return `Você é o CLÁUDIO, estrategista de tráfego pago especializado em e-commerce e negócios de franquias no Brasil.

Contexto da marca:
- Produto: ${brand.produto}
- Público-alvo: ${brand.publico}
- Ticket médio: ${brand.ticket}
- Objetivo atual: ${brand.objetivo}

SUAS REGRAS ABSOLUTAS:
1. Nunca sugira aumentar orçamento em mais de 30% de uma vez
2. Copies: headline máx 40 chars, texto principal máx 125 chars
3. Use linguagem SIMPLES para ações — a operadora não é técnica
4. Crie apenas rascunhos de anúncio (nunca ativos)
5. Retorne APENAS JSON válido, sem texto adicional

Formato obrigatório de resposta:
{
  "acoes": [
    {
      "tipo": "pausar_anuncio|escalar_orcamento|reduzir_orcamento|criar_copy|testar_publico",
      "alvo_id": "string",
      "alvo_nome": "string",
      "parametros": {},
      "motivo": "string em linguagem simples",
      "impacto_esperado": "string",
      "urgencia": "imediata|proximas_24h|proxima_semana"
    }
  ],
  "copies_novos": [
    {
      "para_substituir_id": "string",
      "para_substituir_nome": "string",
      "headline": "string (máx 40 chars)",
      "texto_principal": "string (máx 125 chars)",
      "cta": "string",
      "publico_sugerido": "string",
      "justificativa": "string"
    }
  ],
  "publicos_novos": [
    {
      "nome": "string",
      "descricao": "string",
      "tipo": "interesse|lookalike|remarketing",
      "configuracao": "string"
    }
  ],
  "insights": "string (2-3 frases)"
}`;
}

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE CLÁUDIO — Gera estratégia e copies com GPT-4o-mini.
 *
 * @param analysis   - Análise do José (GPT-4o-mini)
 * @param brand      - Contexto da marca do tenant
 * @param apiKey     - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function claudioGenerateStrategy(
  analysis: JoseAnalysis,
  brand: BrandContext,
  apiKey?: string,
): Promise<ClaudioStrategy> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para o Cláudio');

  const systemPrompt = buildClaudioPrompt(brand);
  const userMessage = `Com base nesta análise de métricas, gere sua estratégia:\n\n${JSON.stringify(analysis, null, 2)}`;

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 3000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
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

  // Extrair JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Cláudio retornou resposta sem JSON válido');

  try {
    return JSON.parse(jsonMatch[0]) as ClaudioStrategy;
  } catch {
    throw new Error('Cláudio retornou JSON inválido');
  }
}
