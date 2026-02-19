/**
 * Anne AI Service — Integração multi-provedor de LLM para o agente Anne.
 *
 * Suporta: OpenAI · Anthropic (Claude) · Google (Gemini) · Groq · DeepSeek · Custom
 *
 * Todas as funções recebem `apiKey` como parâmetro (SaaS multi-tenant).
 */

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'deepseek' | 'custom';

export interface AnneConfig {
  apiKey: string;           // API Key do provedor escolhido
  model?: string;           // Modelo (depende do provedor)
  systemPrompt?: string;    // Prompt do sistema personalizado
  maxTokens?: number;       // Limite de tokens (padrão: 500)
  provider?: AIProvider;    // Provedor de IA (padrão: openai)
  baseUrl?: string;         // URL base customizada (Groq, DeepSeek, Custom, Azure)
}

export interface AnneMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AnneResponse {
  reply: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/* ─────────────────────────────────────────────────────────
   URLs BASE POR PROVEDOR
   ───────────────────────────────────────────────────────── */

const PROVIDER_BASE_URLS: Record<AIProvider, string> = {
  openai:    'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google:    'https://generativelanguage.googleapis.com/v1beta',
  groq:      'https://api.groq.com/openai/v1',
  deepseek:  'https://api.deepseek.com/v1',
  custom:    '',
};

/* ─────────────────────────────────────────────────────────
   MODELOS PADRÃO POR PROVEDOR
   ───────────────────────────────────────────────────────── */

const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  google:    'gemini-1.5-flash',
  groq:      'llama-3.3-70b-versatile',
  deepseek:  'deepseek-chat',
  custom:    'gpt-4o-mini',
};

/* ─────────────────────────────────────────────────────────
   CHAMADA OPENAI-COMPATIBLE (OpenAI · Groq · DeepSeek · Custom)
   Todos usam o mesmo formato de requisição
   ───────────────────────────────────────────────────────── */

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AnneMessage[],
  maxTokens: number
): Promise<AnneResponse> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ||
      `Erro HTTP ${response.status} ao chamar ${baseUrl}`
    );
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  return {
    reply: data.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}

/* ─────────────────────────────────────────────────────────
   CHAMADA ANTHROPIC (Claude) — formato próprio
   ───────────────────────────────────────────────────────── */

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: AnneMessage[],
  maxTokens: number
): Promise<AnneResponse> {
  // Anthropic usa formato diferente: system separado, messages sem role 'system'
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: anthropicMessages,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ||
      `Erro HTTP ${response.status} ao chamar Anthropic`
    );
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = data.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.';
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return {
    reply: text,
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

/* ─────────────────────────────────────────────────────────
   CHAMADA GOOGLE GEMINI — formato próprio
   ───────────────────────────────────────────────────────── */

async function callGoogle(
  apiKey: string,
  model: string,
  messages: AnneMessage[],
  maxTokens: number
): Promise<AnneResponse> {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };

  // systemInstruction disponível no Gemini 1.5+
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ||
      `Erro HTTP ${response.status} ao chamar Google Gemini`
    );
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.';
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  return {
    reply: text,
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

/* ─────────────────────────────────────────────────────────
   FUNÇÃO PRINCIPAL — chat()
   ───────────────────────────────────────────────────────── */

/**
 * Envia mensagem para Anne e recebe resposta, roteando para o provedor correto.
 *
 * @param config        - Configuração: API key, modelo, provider, base_url
 * @param userMessage   - Mensagem do atendente
 * @param conversationHistory - Histórico da conversa (últimas N mensagens)
 * @param context       - Contexto adicional (dados do cliente, pedidos, etc)
 *
 * @example
 * const res = await chat({
 *   apiKey: tenant.openai_api_key,
 *   model: 'gpt-4o-mini',
 *   provider: 'openai',
 *   systemPrompt: 'Você é Anne...',
 * }, 'Esse cliente vai churnar?', [], { cliente: { nome: 'João', rfm_segment: 'At Risk' } });
 */
export async function chat(
  config: AnneConfig,
  userMessage: string,
  conversationHistory: AnneMessage[] = [],
  context?: Record<string, unknown>
): Promise<AnneResponse> {
  const provider: AIProvider = (config.provider as AIProvider) || 'openai';
  const model = config.model || PROVIDER_DEFAULT_MODELS[provider];
  const maxTokens = config.maxTokens || 500;

  const fallbackSystemPrompt = `Você é Anne, a assistente de IA do VEXX CRM — plataforma de gestão de vendas via WhatsApp.
Você é o copiloto comercial dos atendentes: analisa clientes (RFM, churn, LTV), sugere ações de venda/retenção, ajuda a redigir mensagens e resume métricas.
Responda em português brasileiro, de forma objetiva e profissional. Use emojis com moderação.
NUNCA invente dados. Se não tiver a informação, diga claramente.
Se receber contexto do cliente, personalize a resposta com base nos dados.`;

  let systemPrompt = config.systemPrompt || fallbackSystemPrompt;

  // Injetar contexto no system prompt
  if (context && Object.keys(context).length > 0) {
    systemPrompt += `\n\n## Dados disponíveis para esta consulta:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
  }

  const messages: AnneMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  // ── Rotear para o provedor correto ──────────
  if (provider === 'anthropic') {
    return callAnthropic(config.apiKey, model, systemPrompt, messages, maxTokens);
  }

  if (provider === 'google') {
    return callGoogle(config.apiKey, model, messages, maxTokens);
  }

  // OpenAI-compatible: openai, groq, deepseek, custom
  const baseUrl = config.baseUrl?.trim() || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openai;
  return callOpenAICompatible(baseUrl, config.apiKey, model, messages, maxTokens);
}

/* ─────────────────────────────────────────────────────────
   FUNÇÕES AUXILIARES
   ───────────────────────────────────────────────────────── */

/**
 * Detecta a intenção da mensagem do usuário.
 * Usa gpt-4o-mini ou equivalente (baixo custo, temperatura 0).
 */
export async function detectIntent(
  config: AnneConfig,
  userMessage: string
): Promise<string> {
  try {
    const result = await chat(
      {
        ...config,
        maxTokens: 20,
        systemPrompt: `Você é um classificador de intenções. Retorne APENAS uma das opções:
buscar_produto | consultar_pedido | consultar_estoque | falar_com_humano | saudacao | agradecimento | desconhecido
Sem pontuação ou texto adicional.`,
      },
      userMessage,
      []
    );
    return result.reply.trim().toLowerCase();
  } catch {
    return 'desconhecido';
  }
}

/**
 * Gera resumo de uma conversa em até 3 frases.
 */
export async function summarizeConversation(
  config: AnneConfig,
  messages: AnneMessage[]
): Promise<string> {
  const conversationText = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'Atendente' : 'Anne'}: ${m.content}`)
    .join('\n');

  try {
    const result = await chat(
      {
        ...config,
        maxTokens: 200,
        systemPrompt: 'Resuma a conversa a seguir em até 3 frases em português, destacando os pontos principais.',
      },
      conversationText,
      []
    );
    return result.reply;
  } catch {
    return 'Não foi possível gerar resumo.';
  }
}
