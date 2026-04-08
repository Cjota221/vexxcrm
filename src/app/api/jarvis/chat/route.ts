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
  {
    name: 'criar_campanha_meta',
    description: 'Cria uma campanha completa no Meta Ads (campanha + adset + criativo + anúncio). Sempre cria com status PAUSED para Carol revisar antes de ativar. Use quando Carol pedir para criar uma campanha, anúncio ou publicidade no Facebook/Instagram.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_name:        { type: 'string',  description: 'Nome da campanha' },
        ad_message:           { type: 'string',  description: 'Texto principal do anúncio (máx 125 chars)' },
        ad_title:             { type: 'string',  description: 'Título do anúncio (máx 40 chars)' },
        destination_url:      { type: 'string',  description: 'URL de destino do anúncio' },
        daily_budget_reais:   { type: 'number',  description: 'Orçamento diário em reais (ex: 30)' },
        age_min:              { type: 'number',  description: 'Idade mínima do público (default 25)' },
        age_max:              { type: 'number',  description: 'Idade máxima do público (default 55)' },
      },
      required: ['campaign_name', 'ad_message', 'ad_title', 'destination_url', 'daily_budget_reais'],
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

    // Agrupar faturamento por mês
    const por_mes: Record<string, number> = {};
    for (const o of data ?? []) {
      const mes = new Date(o.created_at as string).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      por_mes[mes] = (por_mes[mes] ?? 0) + (parseFloat(String(o.total)) || 0);
    }

    return {
      total_pedidos: data?.length ?? 0,
      faturamento: total_faturamento.toFixed(2),
      ticket_medio: data?.length ? (total_faturamento / data.length).toFixed(2) : '0',
      por_mes: Object.fromEntries(Object.entries(por_mes).map(([k, v]) => [k, v.toFixed(2)])),
      por_status,
      periodo: { inicio: dataInicio, fim: dataFim },
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
    const instrucao = [
      input.nome ? `Nome: ${input.nome}.` : '',
      input.tipo ? `Tipo: ${input.tipo}.` : '',
      input.orcamento_diario_reais ? `Orçamento diário: R$ ${input.orcamento_diario_reais}.` : '',
    ].filter(Boolean).join(' ') || 'Criar campanha com configurações padrão.';

    const res = await fetch(`${appUrl}/api/meta/agente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ instrucao }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, mensagem: err.error || 'Erro ao criar campanha' };
    }
    const data = await res.json() as { resumo?: string };
    return { ok: true, mensagem: data.resumo || 'Campanha criada e pausada para sua aprovação' };
  }

  if (toolName === 'criar_campanha_meta') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const campaignName      = String(input.campaign_name ?? 'Campanha CJ Rasteirinhas');
    const dailyBudgetReais  = Number(input.daily_budget_reais ?? 30);

    const res = await fetch(`${appUrl}/api/jarvis/criar-campanha`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantId,
        campaign: {
          name:      campaignName,
          objective: 'OUTCOME_TRAFFIC',
        },
        adset: {
          name:         `${campaignName} — Conjunto`,
          dailyBudget:  dailyBudgetReais,
          ageMin:       (input.age_min as number) ?? 25,
          ageMax:       (input.age_max as number) ?? 55,
        },
        creative: {
          name:    `${campaignName} — Criativo`,
          message: String(input.ad_message ?? ''),
          title:   String(input.ad_title ?? '').slice(0, 40),
          link:    String(input.destination_url ?? ''),
        },
        adName: `${campaignName} — Anúncio`,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return {
        ok:       false,
        mensagem: `Erro ao criar campanha: ${err.error ?? 'Falha desconhecida'}`,
      };
    }

    const result = await res.json() as {
      campaignId: string;
      adsetId:    string;
      creativeId: string;
      adId:       string;
      adsManagerUrl: string;
    };

    return {
      ok:             true,
      campaign_id:    result.campaignId,
      adset_id:       result.adsetId,
      creative_id:    result.creativeId,
      ad_id:          result.adId,
      ads_manager_url: result.adsManagerUrl,
      mensagem: [
        '✅ Campanha criada com sucesso!',
        '',
        '📋 IDs gerados:',
        `• Campanha: ${result.campaignId}`,
        `• Conjunto: ${result.adsetId}`,
        `• Criativo: ${result.creativeId}`,
        `• Anúncio: ${result.adId}`,
        '',
        `🔗 Ver no Ads Manager: ${result.adsManagerUrl}`,
        '',
        '⚠️ Status: PAUSADA — ative quando estiver pronta para veicular.',
      ].join('\n'),
    };
  }

  if (toolName === 'gerar_relatorio') {
    const periodo  = String(input.periodo ?? 'semana');
    const tipo     = String(input.tipo ?? 'completo');

    // Define janela de datas
    const agora    = new Date();
    let diasAtras  = 7;
    if (periodo === 'hoje')      diasAtras = 1;
    else if (periodo === 'mes')  diasAtras = 30;
    else if (periodo === 'trimestre') diasAtras = 90;

    const dataInicio = input.data_inicio
      ? String(input.data_inicio)
      : new Date(agora.getTime() - diasAtras * 86_400_000).toISOString();
    const dataFim = input.data_fim
      ? `${String(input.data_fim)}T23:59:59`
      : agora.toISOString();

    // Busca última análise concluída
    const { data: ultimaAnalise } = await supabase
      .from('ai_analysis_runs')
      .select('analyst_output, strategist_output, metrics_snapshot, actions_generated, copies_generated, created_at, duration_ms')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Busca campanhas do cache Meta
    const { data: campanhas } = await supabase
      .from('meta_campaigns_cache')
      .select('nome, status, objetivo, orcamento_diario, metricas, sincronizado_em')
      .eq('tenant_id', tenantId)
      .order('sincronizado_em', { ascending: false })
      .limit(20);

    // Busca vendas do período se tipo inclui vendas
    let vendas = null;
    if (tipo === 'vendas' || tipo === 'completo') {
      const { data: pedidos } = await supabase
        .from('orders')
        .select('total, status, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', dataInicio)
        .lte('created_at', dataFim);

      if (pedidos) {
        const faturamento = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
        vendas = {
          total_pedidos: pedidos.length,
          faturamento: faturamento.toFixed(2),
          ticket_medio: pedidos.length ? (faturamento / pedidos.length).toFixed(2) : '0',
        };
      }
    }

    return {
      periodo,
      tipo,
      janela:         { inicio: dataInicio, fim: dataFim },
      ultima_analise: ultimaAnalise
        ? {
            criada_em:         ultimaAnalise.created_at,
            acoes_geradas:     ultimaAnalise.actions_generated,
            copies_geradas:    ultimaAnalise.copies_generated,
            insights_analista: ultimaAnalise.analyst_output,
            recomendacoes:     ultimaAnalise.strategist_output,
            metricas_snapshot: ultimaAnalise.metrics_snapshot,
          }
        : null,
      campanhas:      campanhas ?? [],
      vendas,
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
      max_tokens: 512,
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

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Buscar contexto de tráfego em paralelo para enriquecer o system prompt
  const [campanhasAtivas, criativosGaleria, memorias] = await Promise.all([
    supabase
      .from('meta_campaigns_cache')
      .select('nome, objetivo, status, metricas')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(r => r.data ?? [])
      .catch(() => []),

    supabase
      .from('ad_creatives')
      .select('id, nome, tipo, classificacao, transcricao')
      .eq('tenant_id', tenantId)
      .not('meta_video_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(r => r.data ?? [])
      .catch(() => []),

    supabase
      .from('jarvis_memoria')
      .select('tipo, titulo, resultado, aprendizado, created_at')
      .eq('tenant_id', tenantId)
      .not('aprendizado', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(r => r.data ?? [])
      .catch(() => []),
  ]);

  // Montar bloco de contexto de tráfego
  const linhasCampanhas = (campanhasAtivas as Array<{ nome: string; objetivo: string; metricas?: Record<string, unknown> }>)
    .map(c => `- ${c.nome} (${c.objetivo})${c.metricas ? ` — ROAS: ${(c.metricas as Record<string, unknown>).roas ?? 'N/A'}` : ''}`)
    .join('\n') || 'Nenhuma campanha ativa no momento.';

  const linhasCriativos = (criativosGaleria as Array<{ nome: string; tipo: string; classificacao?: Record<string, unknown> | null; transcricao?: string | null }>)
    .map(c => {
      const cl = c.classificacao as Record<string, unknown> | null;
      const tc = cl?.tipo_conteudo ?? 'não classificado';
      const trecho = c.transcricao?.trim().slice(0, 150);
      return `- "${c.nome}" (${c.tipo}, ${tc as string})${trecho ? `: "${trecho}..."` : ''}`;
    })
    .join('\n') || 'Nenhum criativo na galeria.';

  const linhasMemoria = (memorias as Array<{ titulo: string; aprendizado?: string | null }>)
    .map(m => `- ${m.titulo}: ${m.aprendizado}`)
    .join('\n') || 'Nenhum aprendizado registrado ainda.';

  const contextoTrafego = `=== CONTEXTO ATUAL (${new Date().toLocaleDateString('pt-BR')}) ===
CAMPANHAS ATIVAS:
${linhasCampanhas}

CRIATIVOS DISPONÍVEIS NA GALERIA:
${linhasCriativos}

APRENDIZADOS RECENTES:
${linhasMemoria}
=== FIM DO CONTEXTO ===`;

  const JARVIS_SYSTEM = `Você é o JARVIS do VEXX CRM da ${config?.brand_name ?? 'CJ Rasteirinhas'}.
Hoje: ${hoje}.
Negócio: atacado de rasteirinhas femininas, Goiânia-BR.
WhatsApp: 62981480687. Ad Account: act_1244920119465862.
Seja direto. Máximo 5 linhas por resposta.
Use as tools para buscar dados reais antes de responder.

${contextoTrafego}`;

  try {
    // Histórico limitado a 4 mensagens para controlar tokens
    const historicoCurtado = (historico ?? []).slice(-4);

    const messages: AnthropicMessage[] = [
      ...historicoCurtado.map(h => ({ role: h.role, content: h.content })),
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
