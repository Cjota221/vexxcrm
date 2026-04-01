/**
 * audio-transcription.ts — Transcrição de áudio via Whisper API
 *
 * Suporta OpenAI e Groq como providers de transcrição.
 * Usado pela Anne para entender mensagens de voz do WhatsApp.
 */

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

const WHISPER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
};

/**
 * Transcreve áudio usando a API Whisper (OpenAI ou Groq).
 *
 * @returns TranscriptionResult com o texto, ou null se falhar
 */
export async function transcribeAudio(
  audioUrl: string,
  apiKey: string,
  provider?: string,
  baseUrl?: string,
): Promise<TranscriptionResult | null> {
  try {
    // Determinar endpoint — só OpenAI e Groq suportam Whisper
    let endpoint: string;
    if (baseUrl) {
      endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/audio/transcriptions`;
    } else if (provider && WHISPER_ENDPOINTS[provider]) {
      endpoint = WHISPER_ENDPOINTS[provider];
    } else if (!provider || provider === 'openai') {
      endpoint = WHISPER_ENDPOINTS.openai;
    } else {
      // Provider groq não suporta Whisper — usar openai para transcrição
      console.log(`[audio-transcription] Provider '${provider}' não suporta Whisper, pulando`);
      return null;
    }

    // Baixar o áudio da URL
    const audioRes = await fetch(audioUrl, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!audioRes.ok) {
      console.warn(`[audio-transcription] Falha ao baixar áudio: ${audioRes.status}`);
      return null;
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Montar FormData para a API Whisper
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    const formData = new FormData();
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', provider === 'groq' ? 'whisper-large-v3' : 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    // Enviar para transcrição
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[audio-transcription] Whisper API erro ${res.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const json = await res.json();
    const text = (json.text || '').trim();

    if (!text) {
      console.log('[audio-transcription] Transcrição retornou vazio');
      return null;
    }

    console.log(`[audio-transcription] Transcrito: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    return {
      text,
      language: json.language,
      duration: json.duration,
    };
  } catch (err) {
    console.warn('[audio-transcription] Erro na transcrição:', err);
    return null;
  }
}
