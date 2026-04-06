/**
 * PIPELINE UNIFICADO — José + Cláudio + Pedro em sequência com Claude Haiku.
 *
 * Substitui os três serviços legados (OpenAI) por um único pipeline Anthropic:
 *   1. José  — analisa dados do CRM: ROAS, CPL, CPC, CTR, anomalias, campanhas
 *   2. Cláudio — refina: segmentação, públicos, copy (headline ≤40, texto ≤125)
 *   3. Pedro  — tendências sazonais e oportunidades de mercado
 *
 * Resultados são salvos em ai_action_queue como pending_approval (mesma lógica do Jarvis).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase';

/* ─── Modelo ────────────────────────────────────────────────────────────────── */

const HAIKU_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

/* ─── Helpers de dados CRM (copiados do josé-audience-analyst.service.ts) ─── */

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
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5));
}

function contarPorCidade(clientes: ClienteRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clientes || []) {
    if (c.city) map[c.city] = (map[c.city] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5));
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
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10));
}

function calcularTaxaConversao(leads: LeadRow[] | null): string {
  if (!leads?.length) return '0%';
  const convertidos = leads.filter(l => l.column_id && l.column_id !== 'novo').length;
  return `${Math.round((convertidos / leads.length) * 100)}%`;
}

/* ─── Tipos de saída ────────────────────────────────────────────────────────── */

export interface JoseDiagnostico {
  analise_resumo: string;
  metricas_gerais: {
    ticket_medio: number;
    taxa_conversao: string;
    total_clientes: number;
    total_leads: number;
  };
  publicos_recomendados: Array<{
    nome: string;
    temperatura: 'frio' | 'morno' | 'quente';
    estados_prioritarios: string[];
    justificativa: string;
  }>;
  alertas: string[];
}

export interface ClaudioRecomendacoes {
  acoes: Array<{
    tipo: 'pausar_anuncio' | 'escalar_orcamento' | 'reduzir_orcamento' | 'criar_copy' | 'testar_publico';
    alvo_nome: string;
    motivo: string;
    impacto_esperado: string;
    urgencia: 'imediata' | 'proximas_24h' | 'proxima_semana';
  }>;
  copies: Array<{
    headline: string;      // ≤40 chars
    texto: string;         // ≤125 chars
    cta: string;
    publico_sugerido: string;
    justificativa: string;
  }>;
  segmentacoes: Array<{
    nome: string;
    interesses: string[];
    faixa_etaria: string;
    estados: string[];
  }>;
}

export interface PedroTendencias {
  tendencias: Array<{
    titulo: string;
    descricao: string;
    relevancia: 'alta' | 'media' | 'baixa';
    oportunidade: string;
    janela_temporal: string;
  }>;
  oportunidades_sazonais: Array<{
    evento: string;
    data: string;
    acao_sugerida: string;
  }>;
  resumo: string;
}

export interface AnaliseCampanhaResult {
  jose: JoseDiagnostico;
  claudio: ClaudioRecomendacoes;
  pedro: PedroTendencias;
  actionsCreated: number;
  errors: string[];
}

/* ─── Cliente Anthropic ─────────────────────────────────────────────────────── */

function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  return new Anthropic({ apiKey: key });
}

/* ─── Etapa 1: José — análise de dados do CRM ──────────────────────────────── */

async function etapaJose(
  resumoCRM: Record<string, unknown>,
  client: Anthropic,
): Promise<JoseDiagnostico> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    system: `Você é o JOSÉ, analista de dados especialista em Meta Ads para moda feminina atacado no Brasil.
Analisa dados do CRM da CJ Rasteirinhas (rasteirinhas femininas atacado, mínimo 5 pares, R$25-49,90/par).
Retorna APENAS JSON válido, sem texto adicional.`,
    messages: [{
      role: 'user',
      content: `Analise os dados do CRM abaixo e identifique:
- Perfil geral dos clientes e conversões
- Quais públicos têm maior potencial (revendedoras, franqueadas, marca própria, remarketing)
- Estados com mais tração
- Alertas críticos de performance

Dados CRM:
${JSON.stringify(resumoCRM, null, 2)}

Retorne JSON exato:
{
  "analise_resumo": "string resumindo o perfil dos clientes e oportunidades",
  "metricas_gerais": {
    "ticket_medio": 0,
    "taxa_conversao": "0%",
    "total_clientes": 0,
    "total_leads": 0
  },
  "publicos_recomendados": [
    {
      "nome": "string",
      "temperatura": "frio|morno|quente",
      "estados_prioritarios": ["GO", "SP"],
      "justificativa": "string"
    }
  ],
  "alertas": ["string"]
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as JoseDiagnostico;
  } catch {
    return {
      analise_resumo: 'Não foi possível analisar os dados do CRM.',
      metricas_gerais: {
        ticket_medio: resumoCRM.ticket_medio as number || 0,
        taxa_conversao: resumoCRM.taxa_conversao as string || '0%',
        total_clientes: resumoCRM.total_clientes as number || 0,
        total_leads: resumoCRM.leads_meta_total as number || 0,
      },
      publicos_recomendados: [],
      alertas: [],
    };
  }
}

/* ─── Etapa 2: Cláudio — estratégia, segmentação e copy ────────────────────── */

async function etapaClaudio(
  joseDiagnostico: JoseDiagnostico,
  client: Anthropic,
): Promise<ClaudioRecomendacoes> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2000,
    system: `Você é o CLÁUDIO, estrategista de tráfego pago especializado em moda feminina e franquias no Brasil.
Contexto CJ Rasteirinhas: rasteirinhas femininas atacado, mínimo 5 pares, R$25-49,90/par, Instagram @cjotarasteirinhas.
Copies: headline máx 40 chars, texto máx 125 chars. Nunca sugira aumentar orçamento >30% de uma vez.
Retorna APENAS JSON válido, sem texto adicional.`,
    messages: [{
      role: 'user',
      content: `Com base no diagnóstico do José, gere:
1. Ações táticas prioritárias (pausar, escalar, criar copy, testar público)
2. Copies prontos para anúncios (respeitando limites de caracteres)
3. Segmentações de público com interesses reais do Meta em português

Use apenas interesses reais do Meta: "Atacado", "Moda", "Empreendedorismo", "Franquia",
"Renda extra", "Revenda de roupas", "Negócio próprio", "Calçados femininos", "Loja de roupas",
"Moda feminina", "Pequenos negócios", "Marketing digital", "Comércio eletrônico", "Varejo".

Diagnóstico do José:
${JSON.stringify(joseDiagnostico, null, 2)}

Retorne JSON exato:
{
  "acoes": [
    {
      "tipo": "pausar_anuncio|escalar_orcamento|reduzir_orcamento|criar_copy|testar_publico",
      "alvo_nome": "string",
      "motivo": "string em linguagem simples para a operadora",
      "impacto_esperado": "string",
      "urgencia": "imediata|proximas_24h|proxima_semana"
    }
  ],
  "copies": [
    {
      "headline": "máx 40 chars",
      "texto": "máx 125 chars",
      "cta": "Saiba mais|Comprar agora|Cadastre-se|Entrar em contato",
      "publico_sugerido": "string",
      "justificativa": "string"
    }
  ],
  "segmentacoes": [
    {
      "nome": "string",
      "interesses": ["string"],
      "faixa_etaria": "25-50",
      "estados": ["GO", "SP"]
    }
  ]
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as ClaudioRecomendacoes;
  } catch {
    return { acoes: [], copies: [], segmentacoes: [] };
  }
}

/* ─── Etapa 3: Pedro — tendências e oportunidades sazonais ─────────────────── */

async function etapaPedro(
  joseDiagnostico: JoseDiagnostico,
  client: Anthropic,
): Promise<PedroTendencias> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1200,
    system: `Você é o PEDRO, pesquisador especializado em tendências de mercado para e-commerce brasileiro.
Foco: moda feminina, calçados, revendedoras, franquias. Contexto: Brasil 2025/2026.
Retorna APENAS JSON válido, sem texto adicional.`,
    messages: [{
      role: 'user',
      content: `Com base no perfil do negócio CJ Rasteirinhas (rasteirinhas femininas atacado, revendedoras,
franquias C4, público mulheres 25-55) e no diagnóstico de clientes abaixo, identifique:
- Tendências de mercado relevantes agora
- Oportunidades sazonais nos próximos 60 dias
- Estratégias de nicho que funcionam para revenda de moda

Diagnóstico atual:
${JSON.stringify({ resumo: joseDiagnostico.analise_resumo, alertas: joseDiagnostico.alertas }, null, 2)}

Retorne JSON exato:
{
  "tendencias": [
    {
      "titulo": "string",
      "descricao": "string",
      "relevancia": "alta|media|baixa",
      "oportunidade": "o que fazer com essa tendência",
      "janela_temporal": "ex: próximos 15 dias"
    }
  ],
  "oportunidades_sazonais": [
    {
      "evento": "string",
      "data": "string",
      "acao_sugerida": "string"
    }
  ],
  "resumo": "2-3 frases sobre o panorama de mercado"
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as PedroTendencias;
  } catch {
    return { tendencias: [], oportunidades_sazonais: [], resumo: '' };
  }
}

/* ─── Salvar resultados na fila de aprovação ────────────────────────────────── */

async function salvarNaFila(
  tenantId: string,
  claudio: ClaudioRecomendacoes,
  pedro: PedroTendencias,
): Promise<number> {
  const supabase = createServerSupabaseClient();
  const rows: Record<string, unknown>[] = [];

  // Ações táticas do Cláudio
  for (const acao of claudio.acoes) {
    rows.push({
      tenant_id: tenantId,
      agent: 'claudio',
      action_type: acao.tipo,
      alvo_id: null,
      alvo_nome: acao.alvo_nome,
      parametros: {},
      motivo: acao.motivo,
      impacto_esperado: acao.impacto_esperado,
      urgencia: acao.urgencia,
      status: 'pending_approval',
    });
  }

  // Copies do Cláudio como ações de criação
  for (const copy of claudio.copies) {
    rows.push({
      tenant_id: tenantId,
      agent: 'claudio',
      action_type: 'criar_copy',
      alvo_id: null,
      alvo_nome: copy.publico_sugerido,
      parametros: {
        headline: copy.headline.slice(0, 40),
        texto: copy.texto.slice(0, 125),
        cta: copy.cta,
      },
      motivo: copy.justificativa,
      impacto_esperado: 'Melhorar CTR e conversão do público alvo',
      urgencia: 'proxima_semana',
      status: 'pending_approval',
    });
  }

  // Oportunidades sazonais do Pedro
  for (const op of pedro.oportunidades_sazonais) {
    rows.push({
      tenant_id: tenantId,
      agent: 'pedro',
      action_type: 'testar_publico',
      alvo_id: null,
      alvo_nome: op.evento,
      parametros: { data: op.data },
      motivo: op.acao_sugerida,
      impacto_esperado: 'Capturar oportunidade sazonal de conversão',
      urgencia: 'proximas_24h',
      status: 'pending_approval',
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('ai_action_queue').insert(rows);
  if (error) throw new Error(`Erro ao salvar na fila: ${error.message}`);
  return rows.length;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FUNÇÃO PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Pipeline unificado José → Cláudio → Pedro usando Claude Haiku (Anthropic).
 *
 * @param tenantId - ID do tenant
 * @param onEtapa  - Callback opcional para acompanhar progresso em tempo real
 */
export async function analisarCampanhaComIA(
  tenantId: string,
  onEtapa?: (msg: string) => void,
): Promise<AnaliseCampanhaResult> {
  const errors: string[] = [];

  // Buscar API key do banco ou env
  const supabase = createServerSupabaseClient();
  const { data: configData } = await supabase
    .from('ai_provider_config')
    .select('analytics_api_key')
    .eq('tenant_id', tenantId)
    .single();

  const apiKey = configData?.analytics_api_key || process.env.ANTHROPIC_API_KEY;
  const client = getAnthropicClient(apiKey);

  // ── 1. Buscar dados do CRM ───────────────────────────────────────────────
  onEtapa?.('Buscando dados do CRM...');

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

  const resumoCRM = {
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

  // ── 2. Etapa José ────────────────────────────────────────────────────────
  onEtapa?.('José analisando dados do CRM...');
  let jose: JoseDiagnostico = {
    analise_resumo: '',
    metricas_gerais: { ticket_medio: 0, taxa_conversao: '0%', total_clientes: 0, total_leads: 0 },
    publicos_recomendados: [],
    alertas: [],
  };
  try {
    jose = await etapaJose(resumoCRM, client);
  } catch (err) {
    const msg = `José: ${String(err)}`;
    errors.push(msg);
    console.error('[AnaliseCampanha]', msg);
  }

  // ── 3. Etapa Cláudio ─────────────────────────────────────────────────────
  onEtapa?.('Cláudio elaborando estratégia e copies...');
  let claudio: ClaudioRecomendacoes = { acoes: [], copies: [], segmentacoes: [] };
  try {
    claudio = await etapaClaudio(jose, client);
  } catch (err) {
    const msg = `Cláudio: ${String(err)}`;
    errors.push(msg);
    console.error('[AnaliseCampanha]', msg);
  }

  // ── 4. Etapa Pedro ───────────────────────────────────────────────────────
  onEtapa?.('Pedro pesquisando tendências de mercado...');
  let pedro: PedroTendencias = { tendencias: [], oportunidades_sazonais: [], resumo: '' };
  try {
    pedro = await etapaPedro(jose, client);
  } catch (err) {
    const msg = `Pedro: ${String(err)}`;
    errors.push(msg);
    console.error('[AnaliseCampanha]', msg);
  }

  // ── 5. Salvar na fila de aprovação ───────────────────────────────────────
  onEtapa?.('Salvando recomendações para aprovação...');
  let actionsCreated = 0;
  try {
    actionsCreated = await salvarNaFila(tenantId, claudio, pedro);
  } catch (err) {
    const msg = `Fila: ${String(err)}`;
    errors.push(msg);
    console.error('[AnaliseCampanha]', msg);
  }

  onEtapa?.(`Concluído. ${actionsCreated} ações criadas para aprovação.`);

  return { jose, claudio, pedro, actionsCreated, errors };
}
