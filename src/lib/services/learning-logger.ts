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
  event_category: EventCategory;
  event_data?: Record<string, unknown>;
  channel?: string;
  sentiment_score?: number;
  sentiment_label?: string;
  session_id?: string;
  source?: string;
}

export interface PredictionLog {
  tenant_id: string;
  client_id?: string;
  prediction_type: string;
  model_version: string;
  input_features: Record<string, unknown>;
  predicted_value: number;
  predicted_label?: string;
  confidence: number;
  actual_value?: number;
  was_correct?: boolean;
}

export interface MLFeedback {
  tenant_id: string;
  prediction_id?: string;
  feedback_type: 'accuracy' | 'relevance' | 'timing' | 'action_result';
  expected_outcome: string;
  actual_outcome: string;
  accuracy_score: number;
  context?: Record<string, unknown>;
  learned_rule?: string;
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
    event: Omit<BehavioralEvent, 'tenant_id' | 'sentiment_score' | 'sentiment_label'>,
    messageText: string
  ): Promise<void> {
    const sentiment = analyzeSentiment(messageText);
    await this.logEvent({
      ...event,
      sentiment_score: sentiment.score,
      sentiment_label: sentiment.label,
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
      event_category: 'purchase',
      event_data: orderData,
      source: 'facilzap',
    });
  }

  /** Pedido cancelado */
  async logOrderCancelled(clientId: string, orderData: { order_id: string; total: number; reason?: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'order_cancelled',
      event_category: 'purchase',
      event_data: orderData,
      source: 'facilzap',
    });
  }

  /** Mensagem recebida */
  async logMessageReceived(clientId: string, messageText: string, channel = 'whatsapp') {
    await this.logEventWithSentiment(
      {
        client_id: clientId,
        event_type: 'message_received',
        event_category: 'communication',
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
      event_category: 'communication',
      channel,
    });
  }

  /** Campanha enviada */
  async logCampaignSent(clientId: string, campaignData: { campaign_id: string; template: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'campaign_sent',
      event_category: 'campaign',
      event_data: campaignData,
    });
  }

  /** Campanha convertida */
  async logCampaignConverted(clientId: string, campaignData: { campaign_id: string; order_id: string; revenue: number }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'campaign_converted',
      event_category: 'campaign',
      event_data: campaignData,
    });
  }

  /** Carrinho abandonado */
  async logCartAbandoned(clientId: string, cartData: { cart_id: string; total: number; items_count: number }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'cart_abandoned',
      event_category: 'engagement',
      event_data: cartData,
    });
  }

  /** Carrinho recuperado */
  async logCartRecovered(clientId: string, cartData: { cart_id: string; total: number; recovery_method: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'cart_recovered',
      event_category: 'engagement',
      event_data: cartData,
    });
  }

  /** Mudança de segmento */
  async logSegmentChange(clientId: string, data: { from: string; to: string; direction: string }) {
    const eventType = data.direction === 'upgrade' ? 'upgrade_segment' : 'downgrade_segment';
    await this.logEvent({
      client_id: clientId,
      event_type: eventType,
      event_category: 'lifecycle',
      event_data: data,
    });
  }

  /** Cupom utilizado */
  async logCouponUsed(clientId: string, couponData: { coupon_code: string; discount_value: number; order_id: string }) {
    await this.logEvent({
      client_id: clientId,
      event_type: 'coupon_used',
      event_category: 'engagement',
      event_data: couponData,
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
      .select('predicted_value, predicted_label')
      .eq('id', predictionId)
      .eq('tenant_id', this.tenantId)
      .single();

    if (!data) return;

    // Calcular precisão
    const deviation = Math.abs(data.predicted_value - actualValue);
    const accuracy = data.predicted_value !== 0
      ? Math.max(0, 100 - (deviation / data.predicted_value) * 100)
      : (actualValue === 0 ? 100 : 0);

    await this.supabase
      .from('predictions_log')
      .update({
        actual_value: actualValue,
        was_correct: accuracy >= 70,
        validated_at: new Date().toISOString(),
      })
      .eq('id', predictionId);

    // Feedback automático
    await this.logFeedback({
      prediction_id: predictionId,
      feedback_type: 'accuracy',
      expected_outcome: `predicted=${data.predicted_value}`,
      actual_outcome: `actual=${actualValue}`,
      accuracy_score: accuracy,
      context: { deviation, predicted: data.predicted_value, actual: actualValue },
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
      .select('was_correct, confidence')
      .eq('tenant_id', this.tenantId)
      .eq('model_version', modelVersion)
      .not('was_correct', 'is', null)
      .gte('created_at', since);

    if (!data || data.length === 0) {
      return { total_predictions: 0, correct: 0, incorrect: 0, accuracy_rate: 0, avg_confidence: 0 };
    }

    const correct = data.filter(d => d.was_correct).length;
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
    records_fetched: number;
    records_created: number;
    records_updated: number;
    records_failed: number;
    errors?: unknown[];
    metadata?: Record<string, unknown>;
    duration_ms: number;
    status: 'success' | 'partial' | 'error';
  }): Promise<void> {
    const { error } = await this.supabase
      .from('sync_audit_log')
      .insert({
        tenant_id: this.tenantId,
        ...syncData,
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
      .select('sentiment_score, custom_fields')
      .eq('id', clientId)
      .single();

    if (!data) return;

    const currentScore = data.sentiment_score || 0;
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
        sentiment_score: updatedScore,
        sentiment_label: label,
        sentiment_updated_at: new Date().toISOString(),
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
