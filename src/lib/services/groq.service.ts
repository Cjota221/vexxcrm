// ANTES: Groq era tratado apenas como provedor genérico OpenAI-compatible em anne.service.ts,
//        sem interface dedicada para o time de IAs.
// DEPOIS: Serviço dedicado para o Agente ANNE (WhatsApp) e para todos os agentes do Time IA
//         que precisam de respostas rápidas (< 200ms). Usa Groq Llama 3.3 70B.
//         Não instala groq-sdk — usa fetch diretamente (mesmo padrão do anne.service.ts).

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Envia mensagens para o Groq (Llama 3.3 70B) e retorna a resposta.
 * Usa a API compatível com OpenAI — sem SDK externo.
 *
 * @param messages        - Histórico da conversa
 * @param opts            - Opções: modelo, tokens, temperatura, system prompt
 * @param apiKey          - Groq API Key (obtida em console.groq.com — gratuito)
 */
export async function groqChat(
  messages: GroqMessage[],
  opts: GroqChatOptions = {},
  apiKey?: string,
): Promise<string> {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY não configurada');

  const model = opts.model || 'llama-3.3-70b-versatile';
  const maxTokens = opts.maxTokens || 500;
  const temperature = opts.temperature ?? 0.7;

  const payload: { model: string; messages: GroqMessage[]; max_tokens: number; temperature: number } = {
    model,
    messages: opts.systemPrompt
      ? [{ role: 'system', content: opts.systemPrompt }, ...messages]
      : messages,
    max_tokens: maxTokens,
    temperature,
  };

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Groq HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || '';
}

/**
 * Versão simplificada: uma mensagem → uma resposta.
 * Ideal para uso no anne-auto-reply e nos agentes do time.
 */
export async function groqComplete(
  userMessage: string,
  systemPrompt: string,
  apiKey?: string,
  opts?: Omit<GroqChatOptions, 'systemPrompt'>,
): Promise<string> {
  return groqChat(
    [{ role: 'user', content: userMessage }],
    { ...opts, systemPrompt },
    apiKey,
  );
}
