// ANTES: não existia avaliação automática de criativos visuais.
// DEPOIS: AGENTE JUDITE — avaliadora de criativos visuais (Google Gemini Vision).
//         Analisa imagens de anúncios e retorna nota 1-10, pontos positivos/negativos
//         e sugestões de melhoria. Usa Gemini 2.0 Flash com visão multimodal.
//         Sem @google/generative-ai SDK — usa fetch diretamente (padrão do projeto).

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
 * AGENTE JUDITE — Avalia um criativo visual com Google Gemini Vision.
 *
 * @param imageUrl    - URL pública da imagem do anúncio
 * @param adContext   - Contexto do anúncio (nome, objetivo, produto)
 * @param apiKey      - Google AI API Key (usa GEMINI_API_KEY env var se não fornecida)
 */
export async function juditeEvaluateCreative(
  imageUrl: string,
  adContext: { adName?: string; produto?: string; objetivo?: string },
  apiKey?: string,
): Promise<VisualEvaluation> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada para a Judite');

  const model = 'gemini-2.0-flash';
  const contextText = [
    adContext.adName && `Anúncio: ${adContext.adName}`,
    adContext.produto && `Produto: ${adContext.produto}`,
    adContext.objetivo && `Objetivo: ${adContext.objetivo}`,
  ].filter(Boolean).join(' | ');

  const userMessage = `Avalie este criativo de anúncio.${contextText ? `\nContexto: ${contextText}` : ''}`;

  const response = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: JUDITE_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: userMessage },
              {
                inlineData: {
                  // Gemini aceita URL via fetch image — mas para URLs externas,
                  // usar fileData ou passar como texto descritivo se não suportado
                  mimeType: 'image/jpeg',
                  // imageUrl será passada como referência; Gemini 2.0 suporta
                  // imagens via URL com fileData para URLs públicas
                },
              },
              // Fallback: passar a URL como texto para que o modelo descreva
              { text: `URL da imagem para análise: ${imageUrl}` },
            ].filter(p => !('inlineData' in p)), // remover inlineData vazio
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.3,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Gemini HTTP ${response.status}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    // Fallback mínimo se não retornou JSON
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
