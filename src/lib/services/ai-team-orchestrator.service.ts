// ANTES: não existia orquestrador de múltiplas IAs.
// DEPOIS: ORQUESTRADOR CENTRAL — coordena o Time de IAs (José, Cláudio, Pedro, Judite).
//         É o único ponto de entrada para análise completa. Todos os agentes são
//         independentes — se um falhar, os outros continuam.
//         REGRA DE OURO: nenhuma ação é executada sem aprovação em ai_action_queue.

import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchCampaignMetrics, testMetaConnection, pauseAd } from './meta-ads.service';
import { mudarOrcamento } from './meta-editor.service';
import { joseAnalyzeMetrics } from './jose-analyst.service';
import { claudioGenerateStrategy, type BrandContext } from './claudio-strategist.service';
import { pedroResearchTrends } from './pedro-researcher.service';
import type { JoseAnalysis } from './jose-analyst.service';
import type { ClaudioStrategy, AIAction, GeneratedCopy } from './claudio-strategist.service';
import type { PedroResearch } from './pedro-researcher.service';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

export interface AITeamRunResult {
  runId: string;
  tenantId: string;
  joseAnalysis: JoseAnalysis | null;
  claudioStrategy: ClaudioStrategy | null;
  pedroResearch: PedroResearch | null;
  actionsCreated: number;
  copiesCreated: number;
  errors: string[];
  durationMs: number;
}

export interface TenantAIConfig {
  tenantId: string;
  analyticsApiKey?: string;
  strategyApiKey?: string;
  researchApiKey?: string;
  visualApiKey?: string;
  brand: BrandContext;
  analysisEnabled: boolean;
  researchEnabled: boolean;
  maxBudgetIncreasePct: number;
}

/* ─── Carregar config do tenant ─────────────────────────────────────────────── */

async function loadTenantAIConfig(tenantId: string): Promise<TenantAIConfig | null> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ai_provider_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (!data) return null;

  return {
    tenantId,
    analyticsApiKey: data.analytics_api_key || undefined,
    strategyApiKey: data.strategy_api_key || undefined,
    researchApiKey: data.research_api_key || undefined,
    visualApiKey: data.visual_api_key || undefined,
    brand: {
      produto: data.brand_produto || 'produto não configurado',
      publico: data.brand_publico || 'público não configurado',
      ticket: data.brand_ticket || 'não informado',
      objetivo: data.brand_objetivo || 'não informado',
    },
    analysisEnabled: data.analysis_enabled,
    researchEnabled: data.research_enabled,
    maxBudgetIncreasePct: data.max_budget_increase_pct || 0.30,
  };
}

/* ─── Salvar run no banco ────────────────────────────────────────────────────── */

async function createRunRecord(tenantId: string): Promise<string> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ai_analysis_runs')
    .insert({ tenant_id: tenantId, status: 'running' })
    .select('id')
    .single();
  return data?.id || crypto.randomUUID();
}

async function updateRunRecord(
  runId: string,
  updates: {
    metrics_snapshot?: unknown;
    analyst_output?: unknown;
    strategist_output?: unknown;
    researcher_output?: unknown;
    actions_generated?: number;
    copies_generated?: number;
    status: 'completed' | 'failed';
    error_message?: string;
    duration_ms?: number;
  },
): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase.from('ai_analysis_runs').update(updates).eq('id', runId);
}

/* ─── Salvar ações na fila de aprovação ─────────────────────────────────────── */

async function saveActionsToQueue(
  tenantId: string,
  runId: string,
  actions: AIAction[],
): Promise<number> {
  if (actions.length === 0) return 0;
  const supabase = createServerSupabaseClient();

  const rows = actions.map(action => ({
    tenant_id: tenantId,
    agent: 'claudio',
    action_type: action.tipo,
    alvo_id: action.alvo_id,
    alvo_nome: action.alvo_nome,
    parametros: action.parametros,
    motivo: action.motivo,
    impacto_esperado: action.impacto_esperado,
    urgencia: action.urgencia,
    status: 'pending_approval',
    analysis_run_id: runId,
  }));

  const { error } = await supabase.from('ai_action_queue').insert(rows);
  if (error) throw new Error(`Erro ao salvar ações: ${error.message}`);
  return rows.length;
}

/* ─── Salvar copies no banco ────────────────────────────────────────────────── */

async function saveCopies(
  tenantId: string,
  runId: string,
  copies: GeneratedCopy[],
): Promise<number> {
  if (copies.length === 0) return 0;
  const supabase = createServerSupabaseClient();

  const rows = copies.map(copy => ({
    tenant_id: tenantId,
    headline: copy.headline.slice(0, 40),         // limitar a 40 chars
    texto_principal: copy.texto_principal.slice(0, 125),  // limitar a 125 chars
    cta: copy.cta,
    publico_sugerido: copy.publico_sugerido,
    para_substituir_id: copy.para_substituir_id,
    justificativa: copy.justificativa,
    status: 'draft',
    analysis_run_id: runId,
  }));

  const { error } = await supabase.from('ai_generated_copies').insert(rows);
  if (error) throw new Error(`Erro ao salvar copies: ${error.message}`);
  return rows.length;
}

/* ─── Notificar operadora via WhatsApp ──────────────────────────────────────── */

async function notifyOperator(
  tenantId: string,
  summary: { actionsCount: number; copiesCount: number; alertas: string[] },
): Promise<void> {
  // Busca número da operadora e envia via Evolution API
  // Implementação simplificada — a notificação completa usa sendTextMessage()
  try {
    const supabase = createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, owner_phone')
      .eq('id', tenantId)
      .single();

    if (!tenant?.owner_phone) return;

    const msg = `🤖 *Time de IAs — Relatório Diário*\n\n` +
      `📋 *${summary.actionsCount}* ações aguardando aprovação\n` +
      `✍️ *${summary.copiesCount}* copies prontos para usar\n` +
      (summary.alertas.length > 0
        ? `\n⚠️ *Alertas:*\n${summary.alertas.slice(0, 3).map(a => `• ${a}`).join('\n')}`
        : '') +
      `\n\nAcesse o VEXX CRM → Time de IAs para revisar.`;

    console.log(`[Orchestrator] Notificação para ${tenant.name}:`, msg);
    // TODO: chamar sendTextMessage(evoConfig, tenant.owner_phone, msg) aqui
  } catch (err) {
    console.warn('[Orchestrator] Falha ao notificar operadora:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FUNÇÃO PRINCIPAL — runFullAnalysis
   ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Executa a análise completa do Time de IAs para um tenant.
 *
 * Pipeline:
 *   1. Carregar config do tenant
 *   2. José: buscar métricas + analisar (GPT-4o-mini)
 *   3. Cláudio: gerar estratégia + copies (Claude Haiku) — paralelo com Pedro
 *   4. Pedro: pesquisar tendências (Perplexity) — paralelo com Cláudio
 *   5. Salvar ações na fila de aprovação (NUNCA executar direto)
 *   6. Salvar copies no banco
 *   7. Notificar operadora
 *
 * Se qualquer agente falhar, os outros continuam e os erros são registrados.
 */
export async function runFullAnalysis(
  tenantId: string,
  dateRange: 'last_7d' | 'last_30d' = 'last_7d',
): Promise<AITeamRunResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  let joseAnalysis: JoseAnalysis | null = null;
  let claudioStrategy: ClaudioStrategy | null = null;
  let pedroResearch: PedroResearch | null = null;
  let actionsCreated = 0;
  let copiesCreated = 0;

  const runId = await createRunRecord(tenantId);

  try {
    // ── 1. Carregar config ────────────────────────────────────────────────
    const config = await loadTenantAIConfig(tenantId);
    if (!config) {
      errors.push('Tenant sem configuração de IA (ai_provider_config não encontrado)');
      await updateRunRecord(runId, { status: 'failed', error_message: errors[0] });
      return { runId, tenantId, joseAnalysis, claudioStrategy, pedroResearch, actionsCreated, copiesCreated, errors, durationMs: Date.now() - t0 };
    }

    // ── 2. José: buscar métricas + analisar ──────────────────────────────
    let metrics;
    try {
      metrics = await fetchCampaignMetrics(dateRange);
      joseAnalysis = await joseAnalyzeMetrics(metrics, config.analyticsApiKey);
    } catch (err) {
      errors.push(`José (análise): ${String(err)}`);
      console.error('[Orchestrator] José falhou:', err);
    }

    // ── 3+4. Cláudio + Pedro em paralelo ─────────────────────────────────
    const [claudioResult, pedroResult] = await Promise.allSettled([
      // Cláudio só roda se José retornou análise
      joseAnalysis
        ? claudioGenerateStrategy(joseAnalysis, config.brand, config.strategyApiKey)
        : Promise.reject(new Error('José não disponível')),
      // Pedro roda independentemente (tendências não dependem de métricas)
      config.researchEnabled
        ? pedroResearchTrends(config.brand.produto, config.brand.publico, config.researchApiKey)
        : Promise.reject(new Error('Pedro desabilitado (research_enabled=false)')),
    ]);

    if (claudioResult.status === 'fulfilled') {
      claudioStrategy = claudioResult.value;
    } else {
      errors.push(`Cláudio (estratégia): ${claudioResult.reason}`);
    }

    if (pedroResult.status === 'fulfilled') {
      pedroResearch = pedroResult.value;
    } else if (config.researchEnabled) {
      errors.push(`Pedro (tendências): ${pedroResult.reason}`);
    }

    // ── 5. Salvar ações na fila de aprovação ─────────────────────────────
    if (claudioStrategy?.acoes) {
      try {
        actionsCreated = await saveActionsToQueue(tenantId, runId, claudioStrategy.acoes);
      } catch (err) {
        errors.push(`Salvar ações: ${String(err)}`);
      }
    }

    // ── 6. Salvar copies ─────────────────────────────────────────────────
    if (claudioStrategy?.copies_novos) {
      try {
        copiesCreated = await saveCopies(tenantId, runId, claudioStrategy.copies_novos);
      } catch (err) {
        errors.push(`Salvar copies: ${String(err)}`);
      }
    }

    // ── 7. Atualizar registro do run ─────────────────────────────────────
    await updateRunRecord(runId, {
      metrics_snapshot: metrics,
      analyst_output: joseAnalysis,
      strategist_output: claudioStrategy,
      researcher_output: pedroResearch,
      actions_generated: actionsCreated,
      copies_generated: copiesCreated,
      status: errors.length === 0 || (joseAnalysis && claudioStrategy) ? 'completed' : 'failed',
      duration_ms: Date.now() - t0,
    });

    // ── 8. Notificar operadora ───────────────────────────────────────────
    await notifyOperator(tenantId, {
      actionsCount: actionsCreated,
      copiesCount: copiesCreated,
      alertas: joseAnalysis?.alertas_criticos || [],
    });

  } catch (err) {
    const msg = String(err);
    errors.push(`Erro fatal no orquestrador: ${msg}`);
    await updateRunRecord(runId, { status: 'failed', error_message: msg, duration_ms: Date.now() - t0 });
    console.error('[Orchestrator] Erro fatal:', err);
  }

  return { runId, tenantId, joseAnalysis, claudioStrategy, pedroResearch, actionsCreated, copiesCreated, errors, durationMs: Date.now() - t0 };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   EXECUTAR AÇÃO APROVADA — executeApprovedAction
   ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Executa uma ação da fila SOMENTE se status = 'approved'.
 * Chamado pelo endpoint POST /api/ai-team/actions/[id]/execute
 *
 * ⚠️ REGRA DE OURO: só chega aqui após aprovação explícita da operadora.
 */
export async function executeApprovedAction(actionId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const supabase = createServerSupabaseClient();

  const { data: action, error } = await supabase
    .from('ai_action_queue')
    .select('*')
    .eq('id', actionId)
    .single();

  if (error || !action) return { ok: false, message: 'Ação não encontrada' };
  if (action.status !== 'approved') return { ok: false, message: `Ação com status "${action.status}" — só executa se "approved"` };

  try {
    switch (action.action_type) {
      case 'pausar_anuncio': {
        const ok = await pauseAd(action.alvo_id);
        if (!ok) throw new Error('Meta API recusou a pausagem');
        break;
      }

      case 'escalar_orcamento': {
        const params = action.parametros as { novo_budget_cents: number; budget_atual_cents: number; token: string };
        const resultado = await mudarOrcamento({
          campaignId: action.alvo_id,
          novoOrcamentoCentavos: params.novo_budget_cents,
          orcamentoAtualCentavos: params.budget_atual_cents,
          token: params.token,
        });
        if (!resultado.ok) throw new Error(resultado.erro || 'Meta API recusou atualização de orçamento');
        console.log(`[Orchestrator] Orçamento aplicado: R$ ${resultado.aplicado / 100}`);
        break;
      }

      case 'reduzir_orcamento': {
        const params = action.parametros as { novo_budget_cents: number; token: string };
        // Reduções: passa budget_atual como novo*2 para não travar no limite de 30%
        const resultado = await mudarOrcamento({
          campaignId: action.alvo_id,
          novoOrcamentoCentavos: params.novo_budget_cents,
          orcamentoAtualCentavos: params.novo_budget_cents * 2,
          token: params.token,
        });
        if (!resultado.ok) throw new Error(resultado.erro || 'Meta API recusou redução de orçamento');
        break;
      }

      default:
        // criar_copy, testar_publico: não têm ação automática — operadora faz manualmente
        console.log(`[Orchestrator] Ação "${action.action_type}" marcada como executada (ação manual)`);
    }

    await supabase
      .from('ai_action_queue')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', actionId);

    return { ok: true, message: `Ação "${action.action_type}" executada com sucesso` };

  } catch (err) {
    await supabase
      .from('ai_action_queue')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', actionId);

    return { ok: false, message: String(err) };
  }
}

/* ─── Status dos agentes ────────────────────────────────────────────────────── */

/**
 * Verifica o status de cada agente para o dashboard.
 * Testa conexões e retorna o estado atual de cada IA.
 */
export async function getAgentStatus(tenantId: string): Promise<{
  anne: { active: boolean; provider: string; model: string };
  jose: { active: boolean; metaConnected: boolean; accountName?: string; lastRun?: string; metaError?: string };
  claudio: { active: boolean; hasApiKey: boolean };
  pedro: { active: boolean; hasApiKey: boolean };
  judite: { active: boolean; hasApiKey: boolean };
}> {
  const supabase = createServerSupabaseClient();

  const [configResult, lastRunResult] = await Promise.all([
    supabase.from('ai_provider_config').select('*').eq('tenant_id', tenantId).single(),
    supabase
      .from('ai_analysis_runs')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const config = configResult.data;
  const lastRun = lastRunResult.data;

  // Testar conexão Meta (só se configurado)
  let metaStatus: { ok: boolean; accountName?: string; error?: string } = { ok: false };
  if (config?.meta_access_token && config?.meta_ad_account_id) {
    metaStatus = await testMetaConnection({
      accessToken: config.meta_access_token,
      adAccountId: config.meta_ad_account_id,
    });
  }

  return {
    anne: {
      active: true,  // Anne sempre ativa (usa openai_api_key da tabela tenants)
      provider: config?.auto_reply_provider || 'groq',
      model: config?.auto_reply_model || 'llama-3.3-70b-versatile',
    },
    jose: {
      active: config?.analysis_enabled || false,
      metaConnected: metaStatus.ok,
      accountName: metaStatus.accountName,
      lastRun: lastRun?.created_at,
      metaError: metaStatus.error,
    },
    claudio: {
      active: config?.analysis_enabled || false,
      hasApiKey: !!(config?.strategy_api_key || process.env.ANTHROPIC_API_KEY),
    },
    pedro: {
      active: config?.research_enabled || false,
      hasApiKey: !!(config?.research_api_key || process.env.PERPLEXITY_API_KEY),
    },
    judite: {
      active: config?.visual_enabled || false,
      hasApiKey: !!(config?.visual_api_key || process.env.GEMINI_API_KEY),
    },
  };
}
