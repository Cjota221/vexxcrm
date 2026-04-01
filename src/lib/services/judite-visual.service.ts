// AGENTE JUDITE — avaliadora de criativos visuais (OpenAI GPT-4o-mini Vision).
//         Analisa imagens de anúncios e retorna nota 1-10, pontos positivos/negativos
//         e sugestões de melhoria. Usa GPT-4o-mini com visão multimodal.
//         Usa fetch diretamente (padrão do projeto).

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

export interface VisualEvaluation {
  nota: number;                     // 1-10
  aprovado: boolean;                // nota >= 7
  pontos_positivos: string[];
  pontos_negativos: string[];
  sugestoes: string;                // texto corrido com recomendações
  elementos_criticos: string[];     // problemas que reduzem conversão imediatamente
}

/* ─── System prompt da Judite ───────────────────────────────────────────────── */

const JUDITE_SYSTEM_PROMPT = `Você é a JUDITE, especialista em criativos de anúncios digitais para e-commerce brasileiro.
Você avalia imagens de anúncios com olhar crítico de diretora de arte experiente.

CRITÉRIOS DE AVALIAÇÃO:
- Legibilidade: texto é fácil de ler? (tamanho, contraste, fonte)
- Hierarquia visual: o produto é o destaque principal?
- Call-to-action: o CTA está visível e claro?
- Qualidade: resolução, iluminação, composição
- Relevância: a imagem comunica o produto/benefício corretamente?
- Emoção: desperta desejo, curiosidade ou urgência?
- Adaptação mobile: funciona bem em tela pequena?

Retorne APENAS JSON válido com este formato:
{
  "nota": 0,
  "aprovado": false,
  "pontos_positivos": ["string"],
  "pontos_negativos": ["string"],
  "sugestoes": "string",
  "elementos_criticos": ["string (problemas urgentes)"]
}`;

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE JUDITE — Avalia um criativo visual com GPT-4o-mini Vision.
 *
 * @param imageUrl    - URL pública da imagem do anúncio
 * @param adContext   - Contexto do anúncio (nome, objetivo, produto)
 * @param apiKey      - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function juditeEvaluateCreative(
  imageUrl: string,
  adContext: { adName?: string; produto?: string; objetivo?: string },
  apiKey?: string,
): Promise<VisualEvaluation> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para a Judite');

  const contextText = [
    adContext.adName && `Anúncio: ${adContext.adName}`,
    adContext.produto && `Produto: ${adContext.produto}`,
    adContext.objetivo && `Objetivo: ${adContext.objetivo}`,
  ].filter(Boolean).join(' | ');

  const userMessage = `Avalie este criativo de anúncio.${contextText ? `\nContexto: ${contextText}` : ''}`;

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: JUDITE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
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

  const text = data.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      nota: 5,
      aprovado: false,
      pontos_positivos: [],
      pontos_negativos: ['Não foi possível analisar a imagem'],
      sugestoes: text.slice(0, 300),
      elementos_criticos: [],
    };
  }

  try {
    const result = JSON.parse(jsonMatch[0]) as VisualEvaluation;
    result.aprovado = result.nota >= 7;
    return result;
  } catch {
    return {
      nota: 5,
      aprovado: false,
      pontos_positivos: [],
      pontos_negativos: ['Erro ao processar avaliação'],
      sugestoes: text.slice(0, 300),
      elementos_criticos: [],
    };
  }
}

/**
 * Versão simplificada: URL da imagem → nota rápida (sem context).
 * Útil para avaliar uploads de criativos no dashboard.
 */
export async function juditeQuickRate(
  imageUrl: string,
  apiKey?: string,
): Promise<{ nota: number; aprovado: boolean; feedback: string }> {
  const full = await juditeEvaluateCreative(imageUrl, {}, apiKey);
  return {
    nota: full.nota,
    aprovado: full.aprovado,
    feedback: full.pontos_negativos[0] || full.pontos_positivos[0] || full.sugestoes,
  };
}
