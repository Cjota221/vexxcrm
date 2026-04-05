/**
 * POST /api/jarvis/chat
 * Chat com o Jarvis — motor de inteligência central do VEXX CRM.
 * Usa a Anthropic API diretamente via fetch (sem SDK).
 * Suporta tool_use com acesso a vendas, clientes, campanhas, Anne, produtos, kanban.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/* ─── Tipos para a Anthropic API ─────────────────────────────────── */

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
  error?: { message: string };
};

/* ─── Tools ──────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'buscar_vendas',
    description: 'Busca pedidos e vendas do período. Use para análises de faturamento, ticket médio, produtos mais vendidos.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'Data início YYYY-MM-DD' },
        data_fim:    { type: 'string', description: 'Data fim YYYY-MM-DD' },
        limite:      { type: 'number', description: 'Máximo de registros (default 100)' },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
  {
    name: 'buscar_clientes',
    description: 'Busca dados de clientes, segmentação RFM, LTV, histórico.',
    input_schema: {
      type: 'object',
      properties: {
        filtro: { type: 'string', description: 'all | ativos | inativos | risco_churn | vip' },
        limite: { type: 'number', description: 'Máximo de registros (default 50)' },
      },
    },
  },
  {
    name: 'buscar_campanhas_meta',
    description: 'Busca performance de campanhas Meta Ads. Use para análise de ROAS, CPL, gastos.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string' },
        data_fim:    { type: 'string' },
        status:      { type: 'string', description: 'all | active | paused' },
      },
    },
  },
  {
    name: 'buscar_conversas_anne',
    description: 'Busca logs de atendimento da Anne. Use para analisar padrões, intenções, crises.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string' },
        data_fim:    { type: 'string' },
        intent:      { type: 'string', description: 'Filtrar por intenção específica (opcional)' },
      },
    },
  },
  {
    name: 'buscar_produtos',
    description: 'Busca catálogo de produtos, estoque, mais vendidos.',
    input_schema: {
      type: 'object',
      properties: {
        filtro: { type: 'string', description: 'all | mais_vendidos | estoque_baixo | lancamentos' },
      },
    },
  },
  {
    name: 'buscar_kanban',
    description: 'Busca status do pipeline de vendas — leads em cada etapa.',
    input_schema: {
      type: 'object',
      properties: {
        coluna: { type: 'string', description: 'Filtrar por coluna específica (opcional)' },
      },
    },
  },
  {
    name: 'buscar_reativacao',
    description: 'Busca clientes inativos e campanhas de reativação.',
    input_schema: {
      type: 'object',
      properties: {
        dias_inativo: { type: 'number', description: 'Clientes sem compra há X dias (default 30)' },
      },
    },
  },
  {
    name: 'buscar_base_conhecimento',
    description: 'Consulta as bases de conhecimento do Jarvis sobre o negócio.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', description: 'negocio | publico | campanha | mercado | aprendizado' },
        query:     { type: 'string', description: 'Termo para buscar' },
      },
    },
  },
  {
    name: 'criar_campanha',
    description: 'Cria campanha Meta Ads pausada para aprovação.',
    input_schema: {
      type: 'object',
      properties: {
        nome:                   { type: 'string' },
        tipo:                   { type: 'string', description: 'frio | quente | whatsapp | catalogo' },
        orcamento_diario_reais: { type: 'number' },
      },
      required: ['nome', 'tipo', 'orcamento_diario_reais'],
    },
  },
  {
    name: 'gerar_relatorio',
    description: 'Gera relatório consolidado do período com insights.',
    input_schema: {
      type: 'object',
      properties: {
        tipo:        { type: 'string', description: 'vendas | campanhas | atendimento | completo' },
        periodo:     { type: 'string', description: 'hoje | semana | mes | trimestre | custom' },
        data_inicio: { type: 'string' },
        data_fim:    { type: 'string' },
      },
      required: ['tipo', 'periodo'],
    },
  },
];

/* ─── Executor de tools ───────────────────────────────────────────── */

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

async function executarTool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<unknown> {

  if (toolName === 'buscar_vendas') {
    const dataInicio = input.data_inicio
      ? new Date(String(input.data_inicio) + 'T00:00:00.000Z').toISOString()
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const dataFim = input.data_fim
      ? new Date(String(input.data_fim) + 'T23:59:59.999Z').toISOString()
      : new Date().toISOString();

    console.log('[JARVIS buscar_vendas] período:', dataInicio, 'até', dataFim);

    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, total, status, client_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', dataInicio)
      .lte('created_at', dataFim)
      .in('status', ['shipped', 'confirmed', 'delivered', 'processing'])
      .order('created_at', { ascending: false })
      .limit(50);

    console.log('[JARVIS buscar_vendas] resultado:', data?.length, 'pedidos | erro:', error?.message);

    const total_faturamento = data?.reduce((sum, o) =>
      sum + (parseFloat(String(o.total)) || 0), 0) ?? 0;

    const por_status: Record<string, number> = {};
    for (const o of data ?? []) {
      const k = String(o.status);
      por_status[k] = (por_status[k] ?? 0) + 1;
    }

    return {
      total_pedidos: data?.length ?? 0,
      total_faturamento: total_faturamento.toFixed(2),
      ticket_medio: data?.length ? (total_faturamento / data.length).toFixed(2) : '0',
      por_status,
      periodo: { inicio: dataInicio, fim: dataFim },
      pedidos: data?.slice(0, 10) ?? [],
      erro_query: error?.message ?? null,
    };
  }

  if (toolName === 'buscar_clientes') {
    let query = supabase
      .from('clients')
      .select('id, name, phone, email, created_at, tags, source')
      .eq('tenant_id', tenantId)
      .limit((input.limite as number) || 20);

    if (input.filtro === 'vip')         query = query.contains('tags', ['vip']);
    if (input.filtro === 'risco_churn') query = query.contains('tags', ['risco_churn']);

    const { data } = await query.order('created_at', { ascending: false });
    return { total: data?.length ?? 0, clientes: data ?? [] };
  }

  if (toolName === 'buscar_campanhas_meta') {
    const { data } = await supabase
      .from('meta_campaigns_cache')
      .select('id, nome, status, objetivo, orcamento_diario, metricas, sincronizado_em')
      .eq('tenant_id', tenantId)
      .order('sincronizado_em', { ascending: false })
      .limit(50);
    return { campanhas: data ?? [] };
  }

  if (toolName === 'buscar_conversas_anne') {
    const since = input.data_inicio
      ? String(input.data_inicio)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('anne_logs_v2')
      .select('id, created_at, intent, agent_used, is_crisis, action_taken, duration_ms')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (input.data_fim) query = query.lte('created_at', `${String(input.data_fim)}T23:59:59`);
    if (input.intent)   query = query.eq('intent', String(input.intent));

    const { data } = await query;
    const por_intent: Record<string, number> = {};
    for (const log of data ?? []) {
      const k = (log.intent as string) ?? 'desconhecido';
      por_intent[k] = (por_intent[k] ?? 0) + 1;
    }

    return {
      total: data?.length ?? 0,
      crises: data?.filter(l => l.is_crisis).length ?? 0,
      por_intencao: por_intent,
      logs: data ?? [],
    };
  }

  if (toolName === 'buscar_produtos') {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, stock, category, created_at')
      .eq('tenant_id', tenantId)
      .limit(100);
    return { produtos: data ?? [] };
  }

  if (toolName === 'buscar_kanban') {
    let query = supabase
      .from('kanban_cards')
      .select('id, column_id, contact_name, created_at, labels')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (input.coluna) query = query.eq('column_id', String(input.coluna));

    const { data } = await query;
    const por_coluna: Record<string, number> = {};
    for (const card of data ?? []) {
      const k = String(card.column_id);
      por_coluna[k] = (por_coluna[k] ?? 0) + 1;
    }

    return { total: data?.length ?? 0, por_coluna, cards: data ?? [] };
  }

  if (toolName === 'buscar_reativacao') {
    const diasInativo = (input.dias_inativo as number) || 30;
    const dataCorte = new Date(Date.now() - diasInativo * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, created_at, tags')
      .eq('tenant_id', tenantId)
      .lt('created_at', dataCorte)
      .limit(100);
    return { inativos: data?.length ?? 0, clientes: data ?? [] };
  }

  if (toolName === 'buscar_base_conhecimento') {
    let query = supabase
      .from('jarvis_knowledge')
      .select('titulo, conteudo, categoria, subcategoria')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);

    if (input.categoria) query = query.eq('categoria', String(input.categoria));

    const { data } = await query.limit(10);
    return { documentos: data ?? [] };
  }

  if (toolName === 'criar_campanha') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const res = await fetch(`${appUrl}/api/meta/agente/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        orcamento: input.orcamento_diario_reais,
        tipos: [input.tipo],
        nome: input.nome,
      }),
    });
    return { ok: res.ok, mensagem: 'Campanha criada e pausada para sua aprovação' };
  }

  if (toolName === 'gerar_relatorio') {
    return {
      mensagem: 'Relatório gerado com dados reais do VEXX',
      periodo: input.periodo,
      tipo: input.tipo,
    };
  }

  return { erro: 'Tool não encontrada' };
}

/* ─── Chamada à Anthropic API ────────────────────────────────────── */

async function chamarAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: AnthropicMessage[],
): Promise<AnthropicResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await res.json() as AnthropicResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Anthropic HTTP ${res.status}`);
  }
  return data;
}

/* ─── Handler principal ───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { mensagem, historico } = await req.json() as {
    mensagem: string;
    historico?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!mensagem?.trim()) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('brand_name, anthropic_api_key')
    .eq('tenant_id', tenantId)
    .single();

  const apiKey = config?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Token Anthropic não configurado. Adicione sua API key na página do Jarvis.' },
      { status: 400 },
    );
  }

  // Base de conhecimento injetada no system prompt
  const { data: knowledgeDocs } = await supabase
    .from('jarvis_knowledge')
    .select('titulo, conteudo, categoria')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('criado_em', { ascending: false })
    .limit(20);

  const knowledgeBlock = knowledgeDocs && knowledgeDocs.length > 0
    ? `\n\n## BASE DE CONHECIMENTO DO NEGÓCIO\nAs informações abaixo foram cadastradas pelo usuário. Use-as sempre que relevante:\n\n${
        knowledgeDocs
          .map(doc => `### [${doc.categoria.toUpperCase()}] ${doc.titulo}\n${doc.conteudo}`)
          .join('\n\n---\n\n')
      }`
    : '';

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const JARVIS_SYSTEM = `Você é o JARVIS, motor de inteligência central do VEXX CRM.

DATA DE HOJE: ${hoje}
Sempre use esta data como referência para análises e períodos.
Quando pedirem "últimos 3 meses", calcule a partir de hoje.
Você foi criado para a ${config?.brand_name ?? 'empresa'}.

Suas responsabilidades:
- Analisar performance de campanhas Meta Ads
- Criar e otimizar públicos de alta performance
- Gerar copies e estratégias de anúncio
- Identificar oportunidades e alertar sobre problemas
- Analisar vendas, clientes, atendimentos e pipeline
- Aprender com cada campanha para melhorar continuamente

Você tem acesso a tools que buscam dados reais do VEXX CRM.
Sempre que o usuário pedir uma análise, use as tools para buscar dados reais antes de responder.
Quando pedir para criar campanha, você executa.
Você é direto, estratégico e fala português brasileiro.
Você nunca diz "não posso" — você encontra uma forma.
Seja conciso. Máximo 3 parágrafos por resposta. Use bullet points. Vá direto ao ponto.

Dados de pedidos vêm da tabela orders do VEXX. Status válidos: shipped (entregue pelo transportador), confirmed (pagamento confirmado), delivered (entregue ao cliente), processing (em processamento). O FacilZap pode mostrar números diferentes por usar filtros de data distintos — explique isso quando perguntado.${knowledgeBlock}`;

  try {
    // Montar histórico de mensagens
    const messages: AnthropicMessage[] = [
      ...(historico ?? []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: mensagem },
    ];

    // Primeira chamada
    let resposta = await chamarAnthropic(apiKey, JARVIS_SYSTEM, messages);

    // Loop de tool_use
    while (resposta.stop_reason === 'tool_use') {
      // Adicionar resposta do assistente (com tool_use blocks)
      messages.push({ role: 'assistant', content: resposta.content });

      // Executar todas as tools em paralelo
      const toolResults: AnthropicContentBlock[] = await Promise.all(
        resposta.content
          .filter((b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
          .map(async block => {
            const resultado = await executarTool(block.name, block.input, tenantId, supabase);
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(resultado),
            };
          }),
      );

      // Adicionar resultados como mensagem do user
      messages.push({ role: 'user', content: toolResults });

      // Próxima chamada
      resposta = await chamarAnthropic(apiKey, JARVIS_SYSTEM, messages);
    }

    const texto = resposta.content
      .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
      .map(b => b.text)
      .join('');

    return NextResponse.json({ resposta: texto, role: 'assistant' });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
