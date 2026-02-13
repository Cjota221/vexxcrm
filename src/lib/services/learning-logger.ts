/**
 * Learning Logger — Sistema de registro de eventos comportamentais e feedback ML.
 *
 * Registra eventos de interação, calcula sentimento básico por keywords,
 * alimenta o loop de feedback para auto-otimização do sistema.
 *
 * Adaptado ao schema real: behavioral_events, predictions_log, ml_feedback
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type EventCategory =
  | 'purchase'
  | 'communication'
  | 'engagement'
  | 'support'
  | 'lifecycle'
  | 'campaign'
  | 'product'
  | 'churn_signal';

export type EventType =
  | 'order_placed'
  | 'order_completed'
  | 'order_cancelled'
  | 'message_sent'
  | 'message_received'
  | 'message_read'
  | 'cart_created'
  | 'cart_abandoned'
  | 'cart_recovered'
  | 'campaign_sent'
  | 'campaign_opened'
  | 'campaign_clicked'
  | 'campaign_converted'
  | 'support_requested'
  | 'complaint_made'
  | 'product_viewed'
  | 'product_wishlisted'
  | 'coupon_used'
  | 'coupon_expired'
  | 'review_submitted'
  | 'client_created'
  | 'client_returned'
  | 'inactivity_30d'
  | 'inactivity_60d'
  | 'inactivity_90d'
  | 'churn_detected'
  | 'win_back'
  | 'upgrade_segment'
  | 'downgrade_segment';

export interface BehavioralEvent {
  tenant_id: string;
  client_id: string;
  event_type: EventType;
  category: EventCategory;
  data?: Record<string, unknown>;
  channel?: string;
  sentiment_score?: number;
  sentiment?: string;
  session_id?: string;
  source?: string;
}

export interface PredictionLog {
  tenant_id: string;
  client_id?: string;
  prediction_type: string;
  model_version: string;
  features_used: Record<string, unknown>;
  predicted_value: Record<string, unknown>;
  confidence: number;
  actual_value?: Record<string, unknown>;
  prediction_correct?: boolean;
}

export interface MLFeedback {
  tenant_id: string;
  client_id?: string;
  decision_type: string;
  features: Record<string, unknown>;
  action_taken?: string;
  expected_outcome: string;
  actual_outcome: string;
  success?: boolean;
  performance?: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SENTIMENT ANALYSIS (PT-BR Keyword-based)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const POSITIVE_KEYWORDS = [
  'obrigad', 'amei', 'excelente', 'ótimo', 'otimo', 'perfeito', 'maravilhos',
  'adorei', 'incrível', 'incrivel', 'parabéns', 'parabens', 'recomendo',
  'satisfeit', 'feliz', 'lindo', 'top', 'show', 'sensacional', 'rápid',
  'rapido', 'eficient', 'gostei', 'legal', 'bom', 'boa', 'melhor',
  'nota 10', '100%', 'impecável', 'impecavel', '👏', '😍', '❤️', '🔥', '⭐',
];

const NEGATIVE_KEYWORDS = [
  'péssim', 'pessim', 'horrível', 'horrivel', 'ruim', 'lixo', 'porcaria',
  'demor', 'atraso', 'atrasad', 'errad', 'problem', 'reclamação', 'reclamacao',
  'cancelar', 'devolver', 'devolução', 'devoluçao', 'estragad', 'quebrad',
  'faltando', 'defeito', 'defeituos', 'insatisf', 'decepcion', 'frustrad',
  'raiva', 'absurdo', 'vergonha', 'nunca mais', 'não compro', 'nao compro',
  'não gostei', 'nao gostei', '😡', '😤', '👎', '😠', '💩',
];

const URGENT_KEYWORDS = [
  'procon', 'advogado', 'justiça', 'justica', 'processo', 'reclame aqui',
  'reclameaqui', 'denúncia', 'denuncia', 'consumidor', 'direito do consumidor',
];

export function analyzeSentiment(text: string): { score: number; label: string } {
  if (!text) return { score: 0, label: 'neutral' };

  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let positiveCount = 0;
  let negativeCount = 0;
  let urgentHit = false;

  for (const kw of POSITIVE_KEYWORDS) {
    const normalized = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalized)) positiveCount++;
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    const normalized = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalized)) negativeCount++;
  }

  for (const kw of URGENT_KEYWORDS) {
    const normalized = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalized)) urgentHit = true;
  }

  if (urgentHit) return { score: -100, label: 'critical' };

  const total = positiveCount + negativeCount;
  if (total === 0) return { score: 0, label: 'neutral' };

  const score = Math.round(((positiveCount - negativeCount) / total) * 100);

  let label: string;
  if (score >= 50) label = 'very_positive';
  else if (score >= 20) label = 'positive';
  else if (score <= -50) label = 'very_negative';
  else if (score <= -20) label = 'negative';
  else label = 'neutral';

  return { score, label };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LEARNING LOGGER
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class LearningLogger {
  private supabase: SupabaseClient;
  private tenantId: string;
  private eventBuffer: BehavioralEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /* ════════════════════════════════════════════════════════════
     EVENTOS COMPORTAMENTAIS
     ════════════════════════════════════════════════════════════ */

  /** Registrar evento individual */
  async logEvent(event: Omit<BehavioralEvent, 'tenant_id'>): Promise<void> {
    const fullEvent: BehavioralEvent = {
      ...event,
      tenant_id: this.tenantId,
    };
    this.eventBuffer.push(fullEvent);

    // Flush automático se buffer atingir 50
    if (this.eventBuffer.length >= 50) {
      await this.flush();
    }
  }

  /** Registrar evento com análise de sentimento automática */
  async logEventWithSentiment(
    event: Omit<BehavioralEvent, 'tenant_id' | 'sentiment_score' | 'sentiment'>,
    messageText: string
  ): Promise<void> {
    const sentiment = analyzeSentiment(messageText);
    await this.logEvent({
      ...event,
      sentiment_score: sentiment.score,
      sentiment: sentiment.label,
    });

    // Atualizar sentimento do cliente
    if (event.client_id) {
      await this.updateClientSentiment(event.client_id, sentiment.score);
    }
  }

  /** Flush do buffer para o banco */
  async flush(): Promise<{ inserted: number; errors: number }> {
    if (this.eventBuffer.length === 0) return { inserted: 0, errors: 0 };

    const batch = [...this.eventBuffer];
    this.eventBuffer = [];

    let inserted = 0;
    let errors = 0;

    // Inserir em chunks de 100
    for (let i = 0; i < batch.length; i += 100) {
      const chunk = batch.slice(i, i + 100);
      const { error } = await this.supabase.from('behavioral_events').insert(chunk);
      if (error) {
        console.error('Erro ao inserir eventos:', error);
        errors += chunk.length;
      } else {
        inserted += chunk.length;
      }
    }

    return { inserted, errors };
  }

  /** Iniciar flush periódico (para uso em long-running processes) */
  startAutoFlush(intervalMs = 30000): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }

  /** Parar flush periódico */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     EVENTOS DE CONVENIÊNCIA
     ════════════════════════════════════════════════════════════ */

  /** Pedido realizado */
  async logOrderPlaced(clientId: string, orderData: { order_id: string; total: number; items_count: number }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'order_placed',
      category: 'purchase',
      data: orderData,
      source: 'facilzap',
    });
  }

  /** Pedido cancelado */
  async logOrderCancelled(clientId: string, orderData: { order_id: string; total: number; reason?: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'order_cancelled',
      category: 'purchase',
      data: orderData,
      source: 'facilzap',
    });
  }

  /** Mensagem recebida */
  async logMessageReceived(clientId: string, messageText: string, channel = 'whatsapp') {
    await this.logEventWithSentiment(
      {
        client_id: clientId,
        event_type: 'message_received',
        category: 'communication',
        channel,
      },
      messageText
    );
  }

  /** Mensagem enviada */
  async logMessageSent(clientId: string, channel = 'whatsapp') {
    await this.logEvent({
      client_id: clientId,
      event_type: 'message_sent',
      category: 'communication',
      channel,
    });
  }

  /** Campanha enviada */
  async logCampaignSent(clientId: string, campaignData: { campaign_id: string; template: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'campaign_sent',
      category: 'campaign',
      data: campaignData,
    });
  }

  /** Campanha convertida */
  async logCampaignConverted(clientId: string, campaignData: { campaign_id: string; order_id: string; revenue: number }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'campaign_converted',
      category: 'campaign',
      data: campaignData,
    });
  }

  /** Carrinho abandonado */
  async logCartAbandoned(clientId: string, cartData: { cart_id: string; total: number; items_count: number }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'cart_abandoned',
      category: 'engagement',
      data: cartData,
    });
  }

  /** Carrinho recuperado */
  async logCartRecovered(clientId: string, cartData: { cart_id: string; total: number; recovery_method: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'cart_recovered',
      category: 'engagement',
      data: cartData,
    });
  }

  /** Mudança de segmento */
  async logSegmentChange(clientId: string, segData: { from: string; to: string; direction: string }) {
    const eventType = segData.direction === 'upgrade' ? 'upgrade_segment' : 'downgrade_segment';
    await this.logEvent({
      client_id: clientId,
      event_type: eventType,
      category: 'lifecycle',
      data: segData,
    });
  }

  /** Cupom utilizado */
  async logCouponUsed(clientId: string, couponData: { coupon_code: string; discount_value: number; order_id: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'coupon_used',
      category: 'engagement',
      data: couponData,
    });
  }

  /* ════════════════════════════════════════════════════════════
     PREDICTIONS LOG
     ════════════════════════════════════════════════════════════ */

  /** Registrar predição feita pelo sistema */
  async logPrediction(prediction: Omit<PredictionLog, 'tenant_id'>): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('predictions_log')
      .insert({ ...prediction, tenant_id: this.tenantId })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao logar predição:', error);
      return null;
    }

    return data?.id || null;
  }

  /** Validar predição (após resultado real) */
  async validatePrediction(predictionId: string, actualValue: number): Promise<void> {
    const { data } = await this.supabase
      .from('predictions_log')
      .select('predicted_value, confidence')
      .eq('id', predictionId)
      .eq('tenant_id', this.tenantId)
      .single();

    if (!data) return;

    // predicted_value é JSONB — extrair valor numérico
    const predictedNumeric = typeof data.predicted_value === 'object'
      ? (data.predicted_value?.value ?? 0)
      : Number(data.predicted_value) || 0;

    // Calcular precisão
    const deviation = Math.abs(predictedNumeric - actualValue);
    const accuracy = predictedNumeric !== 0
      ? Math.max(0, 100 - (deviation / predictedNumeric) * 100)
      : (actualValue === 0 ? 100 : 0);

    await this.supabase
      .from('predictions_log')
      .update({
        actual_value: { value: actualValue },
        prediction_correct: accuracy >= 70,
        absolute_error: deviation,
        validated_at: new Date().toISOString(),
      })
      .eq('id', predictionId);

    // Feedback automático
    await this.logFeedback({
      decision_type: 'prediction_validation',
      features: { prediction_id: predictionId },
      action_taken: 'validate',
      expected_outcome: `predicted=${predictedNumeric}`,
      actual_outcome: `actual=${actualValue}`,
      success: accuracy >= 70,
      performance: accuracy / 100,
    });
  }

  /* ════════════════════════════════════════════════════════════
     ML FEEDBACK LOOP
     ════════════════════════════════════════════════════════════ */

  /** Registrar feedback de aprendizado */
  async logFeedback(feedback: Omit<MLFeedback, 'tenant_id'>): Promise<void> {
    const { error } = await this.supabase
      .from('ml_feedback')
      .insert({ ...feedback, tenant_id: this.tenantId });

    if (error) {
      console.error('Erro ao logar feedback ML:', error);
    }
  }

  /** Obter precisão média do modelo */
  async getModelAccuracy(modelVersion: string, days = 30): Promise<{
    total_predictions: number;
    correct: number;
    incorrect: number;
    accuracy_rate: number;
    avg_confidence: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await this.supabase
      .from('predictions_log')
      .select('prediction_correct, confidence')
      .eq('tenant_id', this.tenantId)
      .eq('model_version', modelVersion)
      .not('prediction_correct', 'is', null)
      .gte('predicted_at', since);

    if (!data || data.length === 0) {
      return { total_predictions: 0, correct: 0, incorrect: 0, accuracy_rate: 0, avg_confidence: 0 };
    }

    const correct = data.filter(d => d.prediction_correct).length;
    const avgConfidence = data.reduce((sum, d) => sum + (d.confidence || 0), 0) / data.length;

    return {
      total_predictions: data.length,
      correct,
      incorrect: data.length - correct,
      accuracy_rate: parseFloat(((correct / data.length) * 100).toFixed(1)),
      avg_confidence: parseFloat(avgConfidence.toFixed(1)),
    };
  }

  /* ════════════════════════════════════════════════════════════
     SYNC AUDIT LOG
     ════════════════════════════════════════════════════════════ */

  /** Registrar auditoria de sincronização */
  async logSync(syncData: {
    sync_type: string;
    source: string;
    records_imported: number;
    records_new: number;
    records_updated: number;
    total_errors: number;
    errors?: unknown[];
    metadata?: Record<string, unknown>;
    duration_secs: number;
    status: 'success' | 'partial' | 'error';
  }): Promise<void> {
    const { error } = await this.supabase
      .from('sync_audit_log')
      .insert({
        tenant_id: this.tenantId,
        sync_type: syncData.sync_type,
        source: syncData.source,
        records_imported: syncData.records_imported,
        records_new: syncData.records_new,
        records_updated: syncData.records_updated,
        total_errors: syncData.total_errors,
        errors: syncData.errors ? JSON.stringify(syncData.errors) : null,
        config_used: syncData.metadata || {},
        duration_secs: syncData.duration_secs,
        status: syncData.status,
        started_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Erro ao logar sync audit:', error);
    }
  }

  /* ════════════════════════════════════════════════════════════
     HELPERS PRIVADOS
     ════════════════════════════════════════════════════════════ */

  /** Atualizar sentimento médio do cliente */
  private async updateClientSentiment(clientId: string, newScore: number): Promise<void> {
    // Buscar sentimento atual
    const { data } = await this.supabase
      .from('clients')
      .select('nps_estimated, custom_fields')
      .eq('id', clientId)
      .single();

    if (!data) return;

    const currentScore = data.nps_estimated || 0;
    // Média exponencial ponderada (novo vale 30%)
    const updatedScore = Math.round(currentScore * 0.7 + newScore * 0.3);

    let label: string;
    if (updatedScore >= 50) label = 'very_positive';
    else if (updatedScore >= 20) label = 'positive';
    else if (updatedScore <= -50) label = 'very_negative';
    else if (updatedScore <= -20) label = 'negative';
    else label = 'neutral';

    await this.supabase
      .from('clients')
      .update({
        nps_estimated: updatedScore,
        sentiment_general: label,
      })
      .eq('id', clientId);
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FACTORY (para uso em API routes)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function createLearningLogger(supabase: SupabaseClient, tenantId: string): LearningLogger {
  return new LearningLogger(supabase, tenantId);
}
