// AGENTE JUDITE — avaliadora de criativos visuais (Anthropic Claude Haiku Vision).
//         Analisa imagens de anúncios e retorna nota 1-10, pontos positivos/negativos
//         e sugestões de melhoria. Usa claude-haiku-4-5-20251001 com visão multimodal.
//         Migrado de OpenAI GPT-4o-mini Vision para Anthropic Claude.

import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

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

/* ─── Helper: baixar imagem e converter para base64 ────────────────────────── */

async function downloadImageAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: HTTP ${imgRes.status}`);
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  // Mapear content-type para o formato aceito pelo Anthropic
  let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
  if (contentType.includes('png')) mediaType = 'image/png';
  else if (contentType.includes('gif')) mediaType = 'image/gif';
  else if (contentType.includes('webp')) mediaType = 'image/webp';

  return { base64, mediaType };
}

/* ─── Função principal ──────────────────────────────────────────────────────── */

/**
 * AGENTE JUDITE — Avalia um criativo visual com Claude Haiku Vision (Anthropic).
 *
 * @param imageUrl    - URL pública da imagem do anúncio (será baixada e convertida para base64)
 * @param adContext   - Contexto do anúncio (nome, objetivo, produto)
 * @param apiKey      - Anthropic API Key (usa ai_provider_config.visual_api_key ou ANTHROPIC_API_KEY)
 */
export async function juditeEvaluateCreative(
  imageUrl: string,
  adContext: { adName?: string; produto?: string; objetivo?: string },
  apiKey?: string,
): Promise<VisualEvaluation> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada para a Judite');

  const client = new Anthropic({ apiKey: key });

  const contextText = [
    adContext.adName && `Anúncio: ${adContext.adName}`,
    adContext.produto && `Produto: ${adContext.produto}`,
    adContext.objetivo && `Objetivo: ${adContext.objetivo}`,
  ].filter(Boolean).join(' | ');

  const userText = `Avalie este criativo de anúncio.${contextText ? `\nContexto: ${contextText}` : ''}`;

  // Baixar imagem e converter para base64 (Anthropic não aceita URLs externas diretamente)
  const { base64, mediaType } = await downloadImageAsBase64(imageUrl);

  let text = '';
  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1000,
      system: JUDITE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          { type: 'text', text: userText },
        ],
      }],
    });

    text = response.content[0].type === 'text' ? response.content[0].text : '';
  } catch (err) {
    return {
      nota: 5,
      aprovado: false,
      pontos_positivos: [],
      pontos_negativos: ['Erro ao processar imagem com a IA'],
      sugestoes: String(err).slice(0, 300),
      elementos_criticos: [],
    };
  }

  const jsonMatch = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);

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
