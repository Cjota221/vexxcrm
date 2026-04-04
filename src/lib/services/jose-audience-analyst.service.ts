// AGENTE JOSÉ — Analisa dados do CRM para recomendar segmentações de público Meta Ads.
// Usa GPT-4o-mini para processar dados de clientes, pedidos e leads e retornar
// uma estrutura de 4 públicos prontos para o Cláudio refinar.

import { createServerSupabaseClient } from '@/lib/supabase';

const OPENAI_BASE = 'https://api.openai.com/v1';

/* ─── Tipos de entrada ───────────────────────────────────────────────────────── */

interface ClienteRow {
  phone: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  total_orders: number | null;
  ltv: number | null;
  rfm_segment: string | null;
  tags: string[] | null;
  created_at: string | null;
}

interface PedidoRow {
  client_id: string | null;
  total: number | null;
  created_at: string | null;
  status: string | null;
}

interface LeadRow {
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  column_id: string | null;
  labels: string[] | null;
}

/* ─── Tipos de saída ─────────────────────────────────────────────────────────── */

export interface JosePublicoRecomendado {
  nome: string;
  objetivo: string;
  faixa_etaria_min: number;
  faixa_etaria_max: number;
  genero: 'FEMALE' | 'MALE' | 'ALL';
  paises: string[];
  estados_prioritarios: string[];
  interesses: string[];
  comportamentos: string[];
  excluir_interesses: string[];
  temperatura: 'frio' | 'morno' | 'quente';
  tamanho_estimado: string;
  justificativa: string;
}

export interface JoseAudienceAnalysis {
  analise_resumo: string;
  publicos: JosePublicoRecomendado[];
}

/* ─── Helpers de agregação ───────────────────────────────────────────────────── */

function calcularTicketMedio(pedidos: PedidoRow[] | null): number {
  if (!pedidos?.length) return 0;
  const total = pedidos.reduce((sum, p) => sum + (p.total || 0), 0);
  return Math.round(total / pedidos.length);
}

function contarPorEstado(clientes: ClienteRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clientes || []) {
    if (c.state) map[c.state] = (map[c.state] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  );
}

function contarPorCidade(clientes: ClienteRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clientes || []) {
    if (c.city) map[c.city] = (map[c.city] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  );
}

function contarPorRFM(clientes: ClienteRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clientes || []) {
    const seg = c.rfm_segment || 'sem_segmento';
    map[seg] = (map[seg] || 0) + 1;
  }
  return map;
}

function contarTags(clientes: ClienteRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clientes || []) {
    for (const tag of c.tags || []) {
      map[tag] = (map[tag] || 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
  );
}

function calcularTaxaConversao(leads: LeadRow[] | null): string {
  if (!leads?.length) return '0%';
  const convertidos = leads.filter(l => l.column_id && l.column_id !== 'novo').length;
  return `${Math.round((convertidos / leads.length) * 100)}%`;
}

/* ─── Prompt do José ─────────────────────────────────────────────────────────── */

function buildJosePrompt(resumo: Record<string, unknown>): string {
  return `Você é o JOSÉ, analista de dados especialista em Meta Ads para moda feminina atacado no Brasil.

Analise esses dados dos clientes da CJ Rasteirinhas e recomende segmentações precisas para 4 tipos de público:

1. REVENDEDORAS/LOJISTAS (público principal — compram no atacado)
2. CANDIDATAS A FRANQUEADAS C4 (querem negócio próprio online)
3. MARCA PRÓPRIA (lojistas que querem personalizar produtos)
4. REMARKETING (já interagiram com a CJ)

Para cada público recomende:
- Faixa etária mais provável de converter (baseado nos dados)
- Estados/regiões com maior potencial
- Interesses específicos para segmentar no Meta
- Comportamentos de compra relevantes
- Tamanho estimado do público (pequeno <50k / médio 50-500k / grande >500k)
- Nível de temperatura: frio / morno / quente

Contexto CJ Rasteirinhas:
- Produto: rasteirinhas femininas atacado (mínimo 5 pares, R$25-49,90/par)
- C4 Franquias: site próprio de revenda, modelo dropshipping
- Instagram: @cjotarasteirinhas

Dados da base:
${JSON.stringify(resumo, null, 2)}

Retorne APENAS JSON válido:
{
  "analise_resumo": "string resumindo o perfil dos clientes e oportunidades",
  "publicos": [
    {
      "nome": "string",
      "objetivo": "string",
      "faixa_etaria_min": number,
      "faixa_etaria_max": number,
      "genero": "FEMALE",
      "paises": ["BR"],
      "estados_prioritarios": ["GO", "SP"],
      "interesses": ["Atacado", "Moda feminina"],
      "comportamentos": ["Compradores online frequentes"],
      "excluir_interesses": [],
      "temperatura": "frio",
      "tamanho_estimado": "médio 50-500k",
      "justificativa": "string explicando a recomendação"
    }
  ]
}`;
}

/* ─── Função principal ───────────────────────────────────────────────────────── */

/**
 * AGENTE JOSÉ — Analisa dados do CRM e recomenda segmentações de público.
 *
 * @param tenantId - ID do tenant
 * @param apiKey   - OpenAI API Key (usa OPENAI_API_KEY env var se não fornecida)
 */
export async function joseAnalisarDadosParaPublicos(
  tenantId: string,
  apiKey?: string,
): Promise<JoseAudienceAnalysis> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada para o José');

  const supabase = createServerSupabaseClient();

  // Buscar dados do CRM em paralelo
  const [clientesRes, pedidosRes, leadsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('phone, name, city, state, total_orders, ltv, rfm_segment, tags, created_at')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null)
      .limit(1000),

    supabase
      .from('orders')
      .select('client_id, total, created_at, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'entregue')
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('kanban_cards')
      .select('metadata, created_at, column_id, labels')
      .eq('tenant_id', tenantId)
      .contains('labels', ['meta-ads'])
      .limit(200),
  ]);

  const clientes = clientesRes.data as ClienteRow[] | null;
  const pedidos = pedidosRes.data as PedidoRow[] | null;
  const leads = leadsRes.data as LeadRow[] | null;

  const resumo = {
    total_clientes: clientes?.length || 0,
    ticket_medio: calcularTicketMedio(pedidos),
    estados_top5: contarPorEstado(clientes),
    cidades_top5: contarPorCidade(clientes),
    segmentos_rfm: contarPorRFM(clientes),
    tags_comuns: contarTags(clientes),
    leads_meta_total: leads?.length || 0,
    leads_convertidos: leads?.filter(l => l.column_id && l.column_id !== 'novo')?.length || 0,
    taxa_conversao: calcularTaxaConversao(leads),
    data_analise: new Date().toISOString(),
  };

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3000,
      messages: [{ role: 'user', content: buildJosePrompt(resumo) }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  try {
    return JSON.parse(data.choices[0].message.content) as JoseAudienceAnalysis;
  } catch {
    throw new Error('José retornou JSON inválido na análise de públicos');
  }
}
