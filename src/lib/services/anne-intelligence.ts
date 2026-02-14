/**
 * Sentinela Anne v3 — Motor de Inteligência Autônoma.
 *
 * Analisa clientes automaticamente e gera:
 * - Diagnósticos com urgência e tipo
 * - Recomendações acionáveis (mensagem, cupom, campanha)
 * - Cupons personalizados (via tabela sentinela_coupons)
 * - Learning log (feedback loop para melhoria contínua)
 *
 * Usa dados do SalesAssistant, CustomerHealth e RFM Engine.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SalesAssistant, type ClientInsight } from './sales-assistant';

/* ━━━━━━━━━━━━ TIPOS ━━━━━━━━━━━━ */

export type AnalysisType =
  | 'churn_risk'
  | 'upsell_opportunity'
  | 'reactivation'
  | 'vip_care'
  | 'seasonal_opportunity'
  | 'cross_sell'
  | 'win_back'
  | 'new_customer_nurture';

export type AnalysisStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
export type ActionType = 'send_message' | 'generate_coupon' | 'create_campaign' | 'add_tag' | 'schedule_followup';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SentinelaAnalysis {
  id: string;
  tenant_id: string;
  client_id: string;
  client_name: string;
  type: AnalysisType;
  urgency: UrgencyLevel;
  title: string;
  description: string;
  recommended_action: ActionType;
  action_payload: Record<string, unknown>;
  confidence: number;
  status: AnalysisStatus;
  insight_snapshot: ClientInsight | null;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  feedback_score: number | null;
  feedback_notes: string | null;
  created_at: string;
}

export interface AnalysisBatchResult {
  total_analyzed: number;
  analyses_created: number;
  by_type: Record<string, number>;
  by_urgency: Record<string, number>;
  duration_ms: number;
}

/* ━━━━━━━━━━━━ REGRAS DE ANÁLISE ━━━━━━━━━━━━ */

interface AnalysisRule {
  type: AnalysisType;
  check: (insight: ClientInsight) => boolean;
  urgency: (insight: ClientInsight) => UrgencyLevel;
  title: (insight: ClientInsight) => string;
  description: (insight: ClientInsight) => string;
  action: ActionType;
  actionPayload: (insight: ClientInsight) => Record<string, unknown>;
  confidence: (insight: ClientInsight) => number;
}

const ANALYSIS_RULES: AnalysisRule[] = [
  // ── Churn Risk ──
  {
    type: 'churn_risk',
    check: (i) => i.flags.is_at_risk && (i.rfm?.churn_probability ?? 0) >= 50,
    urgency: (i) => {
      const prob = i.rfm?.churn_probability ?? 0;
      if (prob >= 80) return 'critical';
      if (prob >= 65) return 'high';
      return 'medium';
    },
    title: (i) => `⚠️ ${i.client_name} em risco de churn`,
    description: (i) => {
      const prob = i.rfm?.churn_probability ?? 0;
      const days = i.rfm?.days_since_purchase ?? 0;
      return `Cliente com ${prob.toFixed(0)}% de probabilidade de churn. Inativo há ${days} dias. ` +
        `LTV: R$ ${i.purchase.total_spent.toFixed(0)}. Recomenda-se ação de retenção imediata.`;
    },
    action: 'generate_coupon',
    actionPayload: (i) => ({
      type: 'percentage',
      value: i.flags.is_vip ? 20 : 15,
      min_order: Math.round((i.purchase.avg_ticket || 50) * 0.8),
      message: `Oi ${i.client_name.split(' ')[0]}! 😊 Sentimos sua falta! ` +
        `Preparamos um desconto especial pra você voltar. Use o cupom {CODE} e ganhe {VALUE}% off!`,
      expires_hours: 72,
    }),
    confidence: (i) => Math.min(0.95, (i.rfm?.churn_probability ?? 50) / 100),
  },

  // ── Upsell Opportunity ──
  {
    type: 'upsell_opportunity',
    check: (i) => i.flags.upsell_ready && i.purchase.total_orders >= 2,
    urgency: () => 'medium',
    title: (i) => `📈 Oportunidade de upsell: ${i.client_name}`,
    description: (i) => {
      const avg = i.purchase.avg_ticket;
      return `Cliente com ticket médio de R$ ${avg.toFixed(0)} e ${i.purchase.total_orders} pedidos. ` +
        `Perfil indica receptividade para ofertas de maior valor.`;
    },
    action: 'send_message',
    actionPayload: (i) => ({
      message: `Oi ${i.client_name.split(' ')[0]}! 🎯 Temos novidades especiais que combinam com o seu estilo. ` +
        `Posso te mostrar?`,
      talking_points: i.script.offers,
    }),
    confidence: () => 0.7,
  },

  // ── Win Back ──
  {
    type: 'win_back',
    check: (i) => {
      const days = i.rfm?.days_since_purchase ?? 0;
      return days >= 90 && days < 180 && i.purchase.total_orders >= 2;
    },
    urgency: (i) => (i.flags.is_vip ? 'high' : 'medium'),
    title: (i) => `🔄 Win-back: ${i.client_name}`,
    description: (i) => {
      const days = i.rfm?.days_since_purchase ?? 0;
      return `Ex-cliente ativo (${i.purchase.total_orders} pedidos, R$ ${i.purchase.total_spent.toFixed(0)} gastos) ` +
        `inativo há ${days} dias. Ação de reativação recomendada.`;
    },
    action: 'generate_coupon',
    actionPayload: (i) => ({
      type: 'percentage',
      value: i.flags.is_vip ? 25 : 15,
      min_order: Math.round((i.purchase.avg_ticket || 50) * 0.7),
      message: `${i.client_name.split(' ')[0]}, faz tempo! 💛 ` +
        `Temos um presente pra você: use {CODE} e ganhe {VALUE}% de desconto na próxima compra!`,
      expires_hours: 120,
    }),
    confidence: (i) => {
      const days = i.rfm?.days_since_purchase ?? 0;
      return days < 120 ? 0.75 : 0.55;
    },
  },

  // ── VIP Care ──
  {
    type: 'vip_care',
    check: (i) => i.flags.is_vip && !i.flags.is_at_risk,
    urgency: () => 'low',
    title: (i) => `⭐ Cuidado VIP: ${i.client_name}`,
    description: (i) => {
      return `Cliente VIP com R$ ${i.purchase.total_spent.toFixed(0)} em compras ` +
        `(${i.purchase.total_orders} pedidos). Manter relacionamento proativo.`;
    },
    action: 'send_message',
    actionPayload: (i) => ({
      message: `Oi ${i.client_name.split(' ')[0]}! ⭐ Só passando pra agradecer por ser um cliente tão especial. ` +
        `Tem alguma novidade que gostaria de ver na loja?`,
    }),
    confidence: () => 0.85,
  },

  // ── Seasonal Opportunity ──
  {
    type: 'seasonal_opportunity',
    check: (i) => !!i.seasonal?.upcoming_event && (i.seasonal?.days_until_event ?? 99) <= 30,
    urgency: (i) => (i.seasonal?.days_until_event ?? 30) <= 7 ? 'high' : 'medium',
    title: (i) => `🗓️ ${i.seasonal?.upcoming_event}: oportunidade com ${i.client_name}`,
    description: (i) => {
      const event = i.seasonal?.upcoming_event || 'Evento';
      const days = i.seasonal?.days_until_event || 0;
      return `${event} em ${days} dias. Cliente tem perfil sazonal (score ${i.seasonal?.seasonal_score?.toFixed(0)}). ` +
        `Ação antecipada recomendada.`;
    },
    action: 'send_message',
    actionPayload: (i) => ({
      message: `Oi ${i.client_name.split(' ')[0]}! 🎉 ${i.seasonal?.upcoming_event} está chegando! ` +
        `Preparamos condições especiais. Quer dar uma olhada?`,
    }),
    confidence: (i) => Math.min(0.9, (i.seasonal?.seasonal_score ?? 0) / 100 + 0.3),
  },

  // ── Cross Sell ──
  {
    type: 'cross_sell',
    check: (i) => i.cross_sell.length >= 2 && i.purchase.total_orders >= 2,
    urgency: () => 'low',
    title: (i) => `🛍️ Cross-sell para ${i.client_name}`,
    description: (i) => {
      const products = i.cross_sell.map(c => c.product_name).join(', ');
      return `Produtos sugeridos com base no histórico: ${products}. ` +
        `Confiança média: ${(i.cross_sell.reduce((s, c) => s + c.confidence, 0) / i.cross_sell.length * 100).toFixed(0)}%.`;
    },
    action: 'send_message',
    actionPayload: (i) => ({
      message: `Oi ${i.client_name.split(' ')[0]}! 💡 Vi que você gosta de ${i.favorites[0]?.name || 'nossos produtos'}. ` +
        `Acho que você vai adorar: ${i.cross_sell[0]?.product_name}. Quer saber mais?`,
      products: i.cross_sell.map(c => c.product_name),
    }),
    confidence: (i) => i.cross_sell.length > 0
      ? i.cross_sell.reduce((s, c) => s + c.confidence, 0) / i.cross_sell.length
      : 0.5,
  },

  // ── New Customer Nurture ──
  {
    type: 'new_customer_nurture',
    check: (i) => {
      const days = i.rfm?.days_since_purchase ?? 999;
      return i.purchase.total_orders === 1 && days >= 7 && days <= 30;
    },
    urgency: () => 'medium',
    title: (i) => `🌱 Nutrir novo cliente: ${i.client_name}`,
    description: (i) => {
      const days = i.rfm?.days_since_purchase ?? 0;
      return `Primeira compra há ${days} dias. Momento ideal para nutrir e incentivar segunda compra.`;
    },
    action: 'send_message',
    actionPayload: (i) => ({
      message: `Oi ${i.client_name.split(' ')[0]}! 😊 Tudo certo com seu pedido? ` +
        `Adoramos ter você como cliente! Se precisar de algo, é só chamar.`,
    }),
    confidence: () => 0.8,
  },
];

/* ━━━━━━━━━━━━ SERVIÇO PRINCIPAL ━━━━━━━━━━━━ */

export class AnneIntelligenceService {
  private supabase: SupabaseClient;
  private tenantId: string;
  private salesAssistant: SalesAssistant;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
    this.salesAssistant = new SalesAssistant(supabase, tenantId);
  }

  /* ─── Analisar um cliente ─── */

  async analyzeClient(clientId: string): Promise<SentinelaAnalysis[]> {
    const insight = await this.salesAssistant.getClientInsight(clientId);
    if (!insight) return [];

    const analyses: SentinelaAnalysis[] = [];

    for (const rule of ANALYSIS_RULES) {
      try {
        if (!rule.check(insight)) continue;

        // Verificar se já existe análise recente do mesmo tipo
        const { count } = await this.supabase
          .from('sentinela_analyses')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', this.tenantId)
          .eq('client_id', clientId)
          .eq('type', rule.type)
          .in('status', ['pending', 'approved'])
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if ((count || 0) > 0) continue; // Evita duplicatas

        const analysis: Omit<SentinelaAnalysis, 'id' | 'created_at'> = {
          tenant_id: this.tenantId,
          client_id: clientId,
          client_name: insight.client_name,
          type: rule.type,
          urgency: rule.urgency(insight),
          title: rule.title(insight),
          description: rule.description(insight),
          recommended_action: rule.action,
          action_payload: rule.actionPayload(insight),
          confidence: rule.confidence(insight),
          status: 'pending',
          insight_snapshot: insight,
          approved_by: null,
          approved_at: null,
          executed_at: null,
          feedback_score: null,
          feedback_notes: null,
        };

        const { data, error } = await this.supabase
          .from('sentinela_analyses')
          .insert(analysis)
          .select()
          .single();

        if (!error && data) {
          analyses.push(data as SentinelaAnalysis);
        }
      } catch (err) {
        console.error(`[Anne v3] Erro ao processar regra ${rule.type} para ${clientId}:`, err);
      }
    }

    return analyses;
  }

  /* ─── Análise em batch (todos os clientes relevantes) ─── */

  async analyzeBatch(limit = 100): Promise<AnalysisBatchResult> {
    const start = Date.now();

    // Buscar clientes que merecem análise
    const { data: clients } = await this.supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', this.tenantId)
      .or('flag_churn_risk.eq.true,flag_needs_attention.eq.true,flag_auto_vip.eq.true,flag_upsell_ready.eq.true')
      .limit(limit);

    // Também buscar novos clientes (1 pedido, 7-30 dias)
    const { data: newClients } = await this.supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', this.tenantId)
      .eq('total_pedidos', 1)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(20);

    const allClientIds = new Set([
      ...(clients || []).map(c => c.id),
      ...(newClients || []).map(c => c.id),
    ]);

    let totalAnalyses = 0;
    const byType: Record<string, number> = {};
    const byUrgency: Record<string, number> = {};

    for (const clientId of allClientIds) {
      const analyses = await this.analyzeClient(clientId);
      totalAnalyses += analyses.length;

      for (const a of analyses) {
        byType[a.type] = (byType[a.type] || 0) + 1;
        byUrgency[a.urgency] = (byUrgency[a.urgency] || 0) + 1;
      }
    }

    return {
      total_analyzed: allClientIds.size,
      analyses_created: totalAnalyses,
      by_type: byType,
      by_urgency: byUrgency,
      duration_ms: Date.now() - start,
    };
  }

  /* ─── Listar análises pendentes ─── */

  async getPendingAnalyses(filters?: {
    type?: AnalysisType;
    urgency?: UrgencyLevel;
    limit?: number;
  }): Promise<SentinelaAnalysis[]> {
    let query = this.supabase
      .from('sentinela_analyses')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('status', 'pending')
      .order('urgency', { ascending: true })
      .order('confidence', { ascending: false });

    if (filters?.type) query = query.eq('type', filters.type);
    if (filters?.urgency) query = query.eq('urgency', filters.urgency);
    query = query.limit(filters?.limit || 50);

    const { data, error } = await query;
    if (error) return [];
    return (data || []) as SentinelaAnalysis[];
  }

  /* ─── Aprovar análise ─── */

  async approveAnalysis(analysisId: string, profileId: string): Promise<SentinelaAnalysis | null> {
    const { data, error } = await this.supabase
      .from('sentinela_analyses')
      .update({
        status: 'approved',
        approved_by: profileId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', analysisId)
      .eq('tenant_id', this.tenantId)
      .select()
      .single();

    if (error || !data) return null;

    const analysis = data as SentinelaAnalysis;

    // Executar ação automaticamente se for cupom
    if (analysis.recommended_action === 'generate_coupon') {
      await this.executeGenerateCoupon(analysis);
    }

    // Log de aprendizado
    await this.logLearning(analysis, 'approved');

    return analysis;
  }

  /* ─── Rejeitar análise ─── */

  async rejectAnalysis(
    analysisId: string,
    profileId: string,
    reason?: string
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('sentinela_analyses')
      .update({
        status: 'rejected',
        approved_by: profileId,
        approved_at: new Date().toISOString(),
        feedback_notes: reason || null,
      })
      .eq('id', analysisId)
      .eq('tenant_id', this.tenantId);

    if (!error) {
      // Buscar análise para learning
      const { data } = await this.supabase
        .from('sentinela_analyses')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (data) {
        await this.logLearning(data as SentinelaAnalysis, 'rejected', reason);
      }
    }

    return !error;
  }

  /* ─── Feedback pós-execução ─── */

  async submitFeedback(
    analysisId: string,
    score: number,
    notes?: string
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('sentinela_analyses')
      .update({
        feedback_score: score,
        feedback_notes: notes || null,
      })
      .eq('id', analysisId)
      .eq('tenant_id', this.tenantId);

    if (!error) {
      const { data } = await this.supabase
        .from('sentinela_analyses')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (data) {
        await this.logLearning(
          data as SentinelaAnalysis,
          score >= 4 ? 'positive_feedback' : 'negative_feedback',
          notes
        );
      }
    }

    return !error;
  }

  /* ─── Gerar cupom Sentinela ─── */

  private async executeGenerateCoupon(analysis: SentinelaAnalysis): Promise<void> {
    const payload = analysis.action_payload;

    // Gerar código via SQL function
    const { data: codeResult } = await this.supabase.rpc('generate_coupon_code');
    const code = codeResult || `ANNE${Date.now().toString(36).toUpperCase()}`;

    const expiresHours = (payload.expires_hours as number) || 72;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresHours);

    await this.supabase.from('sentinela_coupons').insert({
      tenant_id: this.tenantId,
      analysis_id: analysis.id,
      client_id: analysis.client_id,
      code,
      type: (payload.type as string) || 'percentage',
      value: (payload.value as number) || 10,
      min_order_value: (payload.min_order as number) || null,
      max_uses: 1,
      expires_at: expiresAt.toISOString(),
      message_template: (payload.message as string) || null,
    });

    // Marcar análise como executada
    await this.supabase
      .from('sentinela_analyses')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString(),
        action_payload: {
          ...payload,
          generated_code: code,
          expires_at: expiresAt.toISOString(),
        },
      })
      .eq('id', analysis.id);
  }

  /* ─── Learning Log ─── */

  private async logLearning(
    analysis: SentinelaAnalysis,
    action: string,
    notes?: string
  ): Promise<void> {
    try {
      await this.supabase.from('sentinela_learning_log').insert({
        tenant_id: this.tenantId,
        analysis_id: analysis.id,
        rule_type: analysis.type,
        input_data: {
          client_id: analysis.client_id,
          urgency: analysis.urgency,
          confidence: analysis.confidence,
        },
        action_taken: action,
        result: notes || null,
        success: action === 'approved' || action === 'positive_feedback',
      });
    } catch (err) {
      console.error('[Anne v3] Erro ao gravar learning log:', err);
    }
  }

  /* ─── Estatísticas ─── */

  async getStats(): Promise<Record<string, unknown>> {
    const { count: total } = await this.supabase
      .from('sentinela_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId);

    const { count: pending } = await this.supabase
      .from('sentinela_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .eq('status', 'pending');

    const { count: approved } = await this.supabase
      .from('sentinela_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .eq('status', 'approved');

    const { count: executed } = await this.supabase
      .from('sentinela_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .eq('status', 'executed');

    const { count: couponsGenerated } = await this.supabase
      .from('sentinela_coupons')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId);

    const { count: couponsUsed } = await this.supabase
      .from('sentinela_coupons')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .eq('was_used', true);

    return {
      total_analyses: total || 0,
      pending: pending || 0,
      approved: approved || 0,
      executed: executed || 0,
      coupons_generated: couponsGenerated || 0,
      coupons_used: couponsUsed || 0,
      conversion_rate: (couponsGenerated || 0) > 0
        ? (((couponsUsed || 0) / (couponsGenerated || 1)) * 100).toFixed(1) + '%'
        : '0%',
    };
  }
}
