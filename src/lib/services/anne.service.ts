/**
 * Anne AI Service — Integração OpenAI e Groq para o agente Anne.
 *
 * Suporta: OpenAI · Groq
 *
 * Todas as funções recebem `apiKey` como parâmetro (SaaS multi-tenant).
 */

export type AIProvider = 'openai' | 'groq';

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
  openai: 'https://api.openai.com/v1',
  groq:   'https://api.groq.com/openai/v1',
};

/* ─────────────────────────────────────────────────────────
   MODELOS PADRÃO POR PROVEDOR
   ───────────────────────────────────────────────────────── */

const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  groq:   'llama-3.3-70b-versatile',
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

  // OpenAI-compatible: openai, groq
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
