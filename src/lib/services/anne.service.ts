/**
 * Anne AI Service — Integração com OpenAI GPT-4o para agente inteligente.
 * 
 * Todas as funções recebem `apiKey` como parâmetro (SaaS multi-tenant).
 */

interface AnneConfig {
  apiKey: string;           // OpenAI API Key do tenant
  model?: string;           // Modelo (padrão: gpt-4o-mini)
  systemPrompt?: string;    // Prompt do sistema personalizado
  maxTokens?: number;       // Limite de tokens (padrão: 500)
}

interface AnneMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AnneResponse {
  reply: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Envia mensagem para Anne (GPT-4o) e recebe resposta.
 * 
 * @param config - Configuração da Anne (API key, model, etc)
 * @param userMessage - Mensagem do usuário
 * @param conversationHistory - Histórico da conversa (opcional)
 * @param context - Contexto adicional (produtos, pedidos, etc)
 * @returns Resposta da Anne
 * 
 * @example
 * const response = await chat({
 *   apiKey: tenant.openai_api_key,
 *   model: 'gpt-4o-mini',
 *   systemPrompt: 'Você é Anne, assistente de vendas...',
 * }, 'Qual o preço do produto X?', [], { products: [...] });
 */
export async function chat(
  config: AnneConfig,
  userMessage: string,
  conversationHistory: AnneMessage[] = [],
  context?: Record<string, unknown>
): Promise<AnneResponse> {
  const systemPrompt = config.systemPrompt || `
Você é Anne, a assistente de IA do VEXX CRM — plataforma de gestão de vendas via WhatsApp.
Você é o copiloto comercial dos atendentes: analisa clientes (RFM, churn, LTV), sugere ações de venda/retenção, ajuda a redigir mensagens e resume métricas.
Responda em português brasileiro, de forma objetiva e profissional. Use emojis com moderação.
NUNCA invente dados. Se não tiver a informação, diga claramente.
Se receber contexto do cliente, personalize a resposta com base nos dados.
`;

  const messages: AnneMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  // Se houver contexto (produtos, pedidos), adicionar ao system
  if (context && Object.keys(context).length > 0) {
    messages[0].content += `\n\nContexto disponível:\n${JSON.stringify(context, null, 2)}`;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages,
      max_tokens: config.maxTokens || 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erro ao chamar OpenAI');
  }

  const data = await response.json();

  return {
    reply: data.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}

/**
 * Extrai intenções do usuário (ação que ele deseja realizar).
 * 
 * @param config - Configuração da Anne
 * @param userMessage - Mensagem do usuário
 * @returns Intenção detectada: 'buscar_produto' | 'consultar_pedido' | 'falar_com_humano' | 'desconhecido'
 * 
 * @example
 * const intent = await detectIntent(config, 'Qual o preço do tênis Nike?');
 * // Retorna: 'buscar_produto'
 */
export async function detectIntent(
  config: AnneConfig,
  userMessage: string
): Promise<string> {
  const messages: AnneMessage[] = [
    {
      role: 'system',
      content: `
Você é um classificador de intenções. Analise a mensagem do usuário e retorne APENAS uma das seguintes opções:
- buscar_produto
- consultar_pedido
- consultar_estoque
- falar_com_humano
- saudacao
- agradecimento
- desconhecido

Retorne apenas a palavra-chave, sem pontuação ou texto adicional.
`,
    },
    { role: 'user', content: userMessage },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 20,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    return 'desconhecido';
  }

  const data = await response.json();
  const intent = data.choices[0]?.message?.content.trim().toLowerCase() || 'desconhecido';

  return intent;
}

/**
 * Gera resumo de uma conversa longa.
 * 
 * @param config - Configuração da Anne
 * @param messages - Array de mensagens da conversa
 * @returns Resumo em até 200 tokens
 */
export async function summarizeConversation(
  config: AnneConfig,
  messages: AnneMessage[]
): Promise<string> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Resuma a conversa a seguir em até 3 frases, destacando os pontos principais.',
        },
        { role: 'user', content: conversationText },
      ],
      max_tokens: 200,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    return 'Não foi possível gerar resumo.';
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'Resumo indisponível.';
}
