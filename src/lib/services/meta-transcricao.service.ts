/**
 * Transcrição de vídeos via Whisper (Groq) + classificação via GPT-4o-mini.
 *
 * Fluxo:
 *   1. Buscar URL de download do vídeo via Meta Graph API
 *   2. Baixar o vídeo e enviar para Groq Whisper large-v3
 *   3. Classificar o texto transcrito via GPT-4o-mini
 *   4. Salvar resultado em ad_creatives
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { META_BASE } from '@/lib/meta-config';
import { resolverTokenMeta } from './meta-token.service';

/* ─── Tipos ─────────────────────────────────────────────────────────────── */

export interface ClassificacaoCriativo {
  tipo_conteudo: 'depoimento' | 'produto' | 'lifestyle' | 'oferta' | 'institucional' | 'tutorial';
  tom: 'emocional' | 'direto' | 'educativo' | 'urgente' | 'inspiracional';
  tem_cta: boolean;
  cta_texto?: string;
  adequacao_publico_frio: number;
  adequacao_publico_quente: number;
  adequacao_whatsapp: number;
  palavras_chave: string[];
  resumo: string;
  recomendacao_uso: string;
}

/* ─── Transcrição via Groq Whisper ──────────────────────────────────────── */

export async function transcreverAudio(
  audioBlob: Blob,
  nomeArquivo: string,
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { ok: false, erro: 'GROQ_API_KEY não configurada' };

  const form = new FormData();
  form.append('file', audioBlob, nomeArquivo);
  form.append('model', 'whisper-large-v3');
  form.append('language', 'pt');
  form.append('response_format', 'text');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message: string } };
      return { ok: false, erro: err.error?.message ?? `Groq HTTP ${res.status}` };
    }

    const texto = await res.text();
    return { ok: true, texto: texto.trim() };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

/* ─── Classificação via GPT-4o-mini ─────────────────────────────────────── */

export async function classificarCriativo(
  transcricao: string,
  nomeCriativo: string,
): Promise<{ ok: boolean; classificacao?: ClassificacaoCriativo; erro?: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return { ok: false, erro: 'OPENAI_API_KEY não configurada' };

  const prompt = `Você é um especialista em marketing digital e tráfego pago para moda feminina e calçados no Brasil.

Analise a transcrição deste vídeo criativo para anúncios e retorne um JSON com a classificação.

Nome do vídeo: ${nomeCriativo}
Transcrição: ${transcricao}

Retorne APENAS um JSON válido, sem markdown, sem explicações, com esta estrutura exata:
{
  "tipo_conteudo": "depoimento|produto|lifestyle|oferta|institucional|tutorial",
  "tom": "emocional|direto|educativo|urgente|inspiracional",
  "tem_cta": true,
  "cta_texto": "texto do CTA se houver, ou null",
  "adequacao_publico_frio": 0,
  "adequacao_publico_quente": 0,
  "adequacao_whatsapp": 0,
  "palavras_chave": ["palavra1", "palavra2", "palavra3"],
  "resumo": "Uma frase descrevendo o que o vídeo mostra e comunica",
  "recomendacao_uso": "Onde e para qual tipo de campanha usar este criativo"
}

Critérios:
- publico_frio: pessoas que nunca ouviram falar da marca (0=péssimo, 10=perfeito)
- publico_quente: pessoas que já interagiram com a marca (0=péssimo, 10=perfeito)
- whatsapp: adequado para campanha com objetivo de mensagens no WhatsApp
- depoimento: cliente falando sobre produto/experiência
- produto: mostra o produto claramente (sandálias, rasteirinhas)
- lifestyle: estilo de vida, sem foco em produto específico
- oferta: preço, desconto, promoção em destaque
- institucional: marca, valores, história
- tutorial: como usar, como revender, como funciona`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return { ok: false, erro: `OpenAI HTTP ${res.status}` };

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content?.trim() ?? '';
    const clean = content.replace(/```json|```/g, '').trim();
    const classificacao = JSON.parse(clean) as ClassificacaoCriativo;

    return { ok: true, classificacao };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

/* ─── Processar criativo completo ────────────────────────────────────────── */

export async function processarCriativo(
  criativoId: string,
  tenantId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = createServerSupabaseClient();

  await supabase
    .from('ad_creatives')
    .update({ transcricao_status: 'processando' })
    .eq('id', criativoId)
    .eq('tenant_id', tenantId);

  const { data: criativo } = await supabase
    .from('ad_creatives')
    .select('nome, meta_video_id, tipo')
    .eq('id', criativoId)
    .single();

  if (!criativo || criativo.tipo !== 'video') {
    await supabase
      .from('ad_creatives')
      .update({ transcricao_status: 'sem_audio' })
      .eq('id', criativoId);
    return { ok: false, erro: 'Não é um vídeo' };
  }

  if (!criativo.meta_video_id) {
    await supabase
      .from('ad_creatives')
      .update({ transcricao_status: 'erro', transcricao_erro: 'meta_video_id não disponível' })
      .eq('id', criativoId);
    return { ok: false, erro: 'meta_video_id não disponível' };
  }

  try {
    const tokenConfig = await resolverTokenMeta(tenantId);

    // Buscar URL de download do vídeo no Meta
    const videoRes = await fetch(
      `${META_BASE}/${criativo.meta_video_id}?fields=source&access_token=${tokenConfig.token}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!videoRes.ok) throw new Error(`Meta API HTTP ${videoRes.status}`);

    const videoData = await videoRes.json() as { source?: string; error?: { message: string } };
    if (videoData.error) throw new Error(videoData.error.message);
    if (!videoData.source) throw new Error('URL de vídeo não disponível ainda — tente novamente em alguns minutos');

    // Baixar o vídeo
    const videoBlob = await fetch(videoData.source, { signal: AbortSignal.timeout(15_000) })
      .then(r => r.blob());

    // Transcrever
    const transcricaoResult = await transcreverAudio(videoBlob, `${criativo.nome}.mp4`);

    if (!transcricaoResult.ok || !transcricaoResult.texto) {
      await supabase
        .from('ad_creatives')
        .update({
          transcricao_status: 'erro',
          transcricao_erro: transcricaoResult.erro,
          transcricao_modelo: 'whisper-large-v3',
        })
        .eq('id', criativoId);
      return { ok: false, erro: transcricaoResult.erro };
    }

    // Classificar
    const classificacaoResult = await classificarCriativo(transcricaoResult.texto, criativo.nome);

    // Salvar resultado
    await supabase
      .from('ad_creatives')
      .update({
        transcricao:          transcricaoResult.texto,
        transcricao_status:   'concluida',
        transcricao_modelo:   'whisper-large-v3',
        classificacao:        classificacaoResult.ok ? classificacaoResult.classificacao : null,
        classificacao_modelo: classificacaoResult.ok ? 'gpt-4o-mini' : null,
        transcricao_erro:     null,
      })
      .eq('id', criativoId);

    return { ok: true };
  } catch (err) {
    await supabase
      .from('ad_creatives')
      .update({
        transcricao_status: 'erro',
        transcricao_erro:   String(err),
      })
      .eq('id', criativoId);
    return { ok: false, erro: String(err) };
  }
}
