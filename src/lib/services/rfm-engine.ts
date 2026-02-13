/**
 * RFM Engine — Motor de cálculo RFM completo.
 *
 * Calcula scores R-F-M para toda a base de clientes,
 * classifica em segmentos, gera predições e atualiza banco.
 *
 * Adaptado ao schema real do VEXX CRM:
 * - Tabela `clients` (UUID, tenant_id)
 * - Tabela `orders` (UUID, client_id, total, created_at)
 * - Tabela `rfm_history` para auditoria
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RFM_CONFIG, RFM_SEGMENTS, resolveSegment, getActionsForSegment } from '@/lib/rfm-segments';
import type { RFMSegmentName, RFMSegmentInfo } from '@/lib/rfm-segments';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ClientMetrics {
  id: string;
  name: string | null;
  rfm_segment_prev: string | null;
  total_orders: number;
  total_spent: number;
  last_purchase: string | null;
  first_purchase: string | null;
  days_since_purchase: number;
  avg_ticket: number;
}

export interface RFMResult {
  client_id: string;
  rfm_recency: number;
  rfm_frequency: number;
  rfm_monetary: number;
  rfm_score: string;
  rfm_segment: RFMSegmentName;
  segment_info: RFMSegmentInfo;
  previous_segment: string | null;
  segment_changed: boolean;
  change_direction: 'upgrade' | 'downgrade' | 'stable';
  predictions: {
    expected_frequency: number;
    next_purchase_at: string | null;
    purchase_prob_30d: number;
    churn_probability: number;
    ltv_current: number;
    ltv_projected_12m: number;
    ltv_projected_life: number;
    expected_next_ticket: number;
  };
  flags: {
    auto_vip: boolean;
    churn_risk: boolean;
    needs_attention: boolean;
    upsell_ready: boolean;
  };
  actions: string[];
}

export interface RFMReport {
  execution: {
    started_at: string;
    finished_at: string;
    duration_secs: number;
    algorithm_version: string;
  };
  stats: {
    total_processed: number;
    total_updated: number;
    total_errors: number;
    segment_changes: number;
    upgrades: number;
    downgrades: number;
  };
  distribution: Record<string, number>;
  alerts: Array<{
    type: 'critical' | 'warning' | 'info';
    message: string;
    action: string;
  }>;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ENGINE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ALGORITHM_VERSION = '2.0.0';

export class RFMEngine {
  private supabase: SupabaseClient;
  private tenantId: string;
  private stats = {
    processed: 0,
    updated: 0,
    errors: 0,
    segmentChanges: 0,
  };

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /* ════════════════════════════════════════════════════════════
     MÉTODO PRINCIPAL: CALCULAR RFM COMPLETO
     ════════════════════════════════════════════════════════════ */

  async calculateAll(): Promise<RFMReport> {
    const startedAt = new Date();
    console.log('🔄 RFM Engine: Iniciando cálculo...');

    // 1. Buscar clientes com histórico
    const clients = await this.fetchClientsWithHistory();
    console.log(`📊 ${clients.length} clientes com pedidos para processar`);

    if (clients.length === 0) {
      return this.buildReport(startedAt, []);
    }

    // 2. Calcular percentis de valor para score M
    const monetaryPercentiles = this.calculateMonetaryPercentiles(clients);

    // 3. Calcular RFM para cada cliente
    const results: RFMResult[] = [];
    for (const client of clients) {
      try {
        const result = this.calculateClient(client, monetaryPercentiles);
        results.push(result);
        this.stats.processed++;
      } catch (err) {
        console.error(`Erro RFM para cliente ${client.id}:`, err);
        this.stats.errors++;
      }
    }

    // 4. Persistir em batch
    await this.persistResults(results);

    // 5. Gerar report
    const report = this.buildReport(startedAt, results);
    console.log('✅ RFM Engine: Concluído!', JSON.stringify(report.stats));
    return report;
  }

  /* ════════════════════════════════════════════════════════════
     BUSCAR CLIENTES COM HISTÓRICO
     ════════════════════════════════════════════════════════════ */

  private async fetchClientsWithHistory(): Promise<ClientMetrics[]> {
    // Buscar todos os clientes do tenant
    const allClients: ClientMetrics[] = [];
    let from = 0;
    while (true) {
      const { data } = await this.supabase
        .from('clients')
        .select('id, name, rfm_segment')
        .eq('tenant_id', this.tenantId)
        .range(from, from + 999);

      if (!data || data.length === 0) break;

      for (const c of data) {
        allClients.push({
          id: c.id,
          name: c.name,
          rfm_segment_prev: c.rfm_segment || null,
          total_orders: 0,
          total_spent: 0,
          last_purchase: null,
          first_purchase: null,
          days_since_purchase: 999,
          avg_ticket: 0,
        });
      }

      if (data.length < 1000) break;
      from += 1000;
    }

    // Buscar pedidos agregados
    const orderMap = new Map<string, { count: number; total: number; first: string; last: string }>();
    from = 0;
    while (true) {
      const { data } = await this.supabase
        .from('orders')
        .select('client_id, total, created_at')
        .eq('tenant_id', this.tenantId)
        .not('client_id', 'is', null)
        .range(from, from + 999);

      if (!data || data.length === 0) break;

      for (const o of data) {
        const prev = orderMap.get(o.client_id) || { count: 0, total: 0, first: o.created_at, last: o.created_at };
        prev.count += 1;
        prev.total += Number(o.total) || 0;
        if (o.created_at < prev.first) prev.first = o.created_at;
        if (o.created_at > prev.last) prev.last = o.created_at;
        orderMap.set(o.client_id, prev);
      }

      if (data.length < 1000) break;
      from += 1000;
    }

    // Merge
    const now = Date.now();
    const result: ClientMetrics[] = [];
    for (const c of allClients) {
      const orders = orderMap.get(c.id);
      if (!orders || orders.count === 0) continue; // Pula clientes sem pedidos

      c.total_orders = orders.count;
      c.total_spent = orders.total;
      c.first_purchase = orders.first;
      c.last_purchase = orders.last;
      c.days_since_purchase = Math.floor((now - new Date(orders.last).getTime()) / (1000 * 60 * 60 * 24));
      c.avg_ticket = orders.count > 0 ? orders.total / orders.count : 0;
      result.push(c);
    }

    return result;
  }

  /* ════════════════════════════════════════════════════════════
     PERCENTIS DE VALOR
     ════════════════════════════════════════════════════════════ */

  private calculateMonetaryPercentiles(clients: ClientMetrics[]) {
    const values = clients.map(c => c.total_spent).sort((a, b) => a - b);
    const getP = (p: number) => {
      const idx = Math.ceil((p / 100) * values.length) - 1;
      return values[Math.max(0, idx)];
    };
    return { p20: getP(20), p40: getP(40), p60: getP(60), p80: getP(80) };
  }

  /* ════════════════════════════════════════════════════════════
     CALCULAR RFM PARA 1 CLIENTE
     ════════════════════════════════════════════════════════════ */

  private calculateClient(
    client: ClientMetrics,
    percentiles: { p20: number; p40: number; p60: number; p80: number }
  ): RFMResult {
    // Scores individuais
    const r = this.scoreRecency(client.days_since_purchase);
    const f = this.scoreFrequency(client.total_orders);
    const m = this.scoreMonetary(client.total_spent, percentiles);
    const rfmScore = `${r}${f}${m}`;

    // Segmento
    const segmentInfo = resolveSegment(rfmScore);
    const segment = segmentInfo.nome;

    // Mudança
    const segmentChanged = client.rfm_segment_prev !== null && client.rfm_segment_prev !== segment;
    const changeDirection = this.changeDirection(client.rfm_segment_prev, segment);

    if (segmentChanged) this.stats.segmentChanges++;

    // Predições
    const predictions = this.predict(client, r, f, m);

    // Flags
    const flags = {
      auto_vip: ['Champions', 'Loyal Customers'].includes(segment),
      churn_risk: predictions.churn_probability >= 60,
      needs_attention: ['At Risk', 'Cant Lose Them', 'Need Attention'].includes(segment),
      upsell_ready: segment === 'Potential Loyalist' && r >= 4,
    };

    // Ações
    const actions = getActionsForSegment(segment);

    return {
      client_id: client.id,
      rfm_recency: r,
      rfm_frequency: f,
      rfm_monetary: m,
      rfm_score: rfmScore,
      rfm_segment: segment,
      segment_info: segmentInfo,
      previous_segment: client.rfm_segment_prev,
      segment_changed: segmentChanged,
      change_direction: changeDirection,
      predictions,
      flags,
      actions,
    };
  }

  /* ════════════════════════════════════════════════════════════
     SCORES INDIVIDUAIS
     ════════════════════════════════════════════════════════════ */

  private scoreRecency(days: number): number {
    const thresholds = RFM_CONFIG.recency;
    for (const s of [5, 4, 3, 2, 1]) {
      if (days <= thresholds[s]) return s;
    }
    return 1;
  }

  private scoreFrequency(totalOrders: number): number {
    const thresholds = RFM_CONFIG.frequency;
    for (const s of [5, 4, 3, 2, 1]) {
      if (totalOrders >= thresholds[s]) return s;
    }
    return 1;
  }

  private scoreMonetary(totalSpent: number, p: { p20: number; p40: number; p60: number; p80: number }): number {
    if (totalSpent >= p.p80) return 5;
    if (totalSpent >= p.p60) return 4;
    if (totalSpent >= p.p40) return 3;
    if (totalSpent >= p.p20) return 2;
    return 1;
  }

  /* ════════════════════════════════════════════════════════════
     PREDIÇÕES
     ════════════════════════════════════════════════════════════ */

  private predict(client: ClientMetrics, r: number, f: number, m: number) {
    // Frequência esperada (compras/mês)
    const monthsAsClient = client.first_purchase && client.last_purchase
      ? Math.max(1, (new Date(client.last_purchase).getTime() - new Date(client.first_purchase).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 1;
    const expectedFrequency = parseFloat((client.total_orders / monthsAsClient).toFixed(2));

    // Intervalo médio entre compras
    const avgDaysBetween = monthsAsClient > 0 ? (monthsAsClient * 30) / client.total_orders : 90;

    // Próxima compra prevista
    const nextPurchaseAt = client.last_purchase
      ? new Date(new Date(client.last_purchase).getTime() + avgDaysBetween * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Probabilidade de compra em 30 dias
    let prob30d = 0;
    if (r === 5) prob30d += 40;
    else if (r === 4) prob30d += 30;
    else if (r === 3) prob30d += 20;
    else prob30d += 10;
    if (f >= 4) prob30d += 30;
    else if (f === 3) prob30d += 20;
    else prob30d += 10;
    if (avgDaysBetween < 30) prob30d += 20;
    else if (avgDaysBetween < 60) prob30d += 10;
    prob30d = Math.min(100, prob30d);

    // Probabilidade de churn
    let churn = 0;
    if (r === 1) churn += 40;
    else if (r === 2) churn += 25;
    else if (r === 3) churn += 15;
    if (client.days_since_purchase > 180) churn += 30;
    else if (client.days_since_purchase > 90) churn += 20;
    else if (client.days_since_purchase > 60) churn += 10;
    if (f <= 2) churn += 20;
    if (m >= 4) churn -= 10;
    churn = Math.max(0, Math.min(100, churn));

    // LTV
    const ltvCurrent = client.total_spent;
    const ltvProjected12m = parseFloat((expectedFrequency * 12 * client.avg_ticket).toFixed(2));
    const churnFactor = 1 - churn / 100;
    const ltvProjectedLife = parseFloat((ltvCurrent + expectedFrequency * 24 * client.avg_ticket * churnFactor).toFixed(2));

    return {
      expected_frequency: expectedFrequency,
      next_purchase_at: nextPurchaseAt,
      purchase_prob_30d: prob30d,
      churn_probability: churn,
      ltv_current: ltvCurrent,
      ltv_projected_12m: ltvProjected12m,
      ltv_projected_life: ltvProjectedLife,
      expected_next_ticket: parseFloat(client.avg_ticket.toFixed(2)),
    };
  }

  /* ════════════════════════════════════════════════════════════
     PERSISTÊNCIA
     ════════════════════════════════════════════════════════════ */

  private async persistResults(results: RFMResult[]) {
    console.log('💾 RFM: Salvando resultados...');

    for (let i = 0; i < results.length; i += 20) {
      const batch = results.slice(i, i + 20);
      await Promise.all(batch.map(async (r) => {
        // Atualizar clients
        const { error } = await this.supabase
          .from('clients')
          .update({
            rfm_recency: r.rfm_recency,
            rfm_frequency: r.rfm_frequency,
            rfm_monetary: r.rfm_monetary,
            rfm_score: r.rfm_score,
            rfm_segment: r.rfm_segment,
            rfm_calculated_at: new Date().toISOString(),
            expected_frequency: r.predictions.expected_frequency,
            next_purchase_at: r.predictions.next_purchase_at,
            purchase_prob_30d: r.predictions.purchase_prob_30d,
            churn_probability: r.predictions.churn_probability,
            expected_next_ticket: r.predictions.expected_next_ticket,
            ltv_projected_12m: r.predictions.ltv_projected_12m,
            ltv_projected_life: r.predictions.ltv_projected_life,
            flag_auto_vip: r.flags.auto_vip,
            flag_churn_risk: r.flags.churn_risk,
            flag_needs_attention: r.flags.needs_attention,
            flag_upsell_ready: r.flags.upsell_ready,
            ai_model_version: ALGORITHM_VERSION,
          })
          .eq('id', r.client_id);

        if (error) {
          this.stats.errors++;
        } else {
          this.stats.updated++;
        }

        // Histórico RFM (se mudou segmento)
        if (r.segment_changed) {
          await this.supabase.from('rfm_history').insert({
            tenant_id: this.tenantId,
            client_id: r.client_id,
            rfm_recency: r.rfm_recency,
            rfm_frequency: r.rfm_frequency,
            rfm_monetary: r.rfm_monetary,
            rfm_score: r.rfm_score,
            rfm_segment: r.rfm_segment,
            previous_segment: r.previous_segment,
            segment_changed: true,
            change_direction: r.change_direction,
            days_since_purchase: null,
            total_orders: null,
            total_spent: r.predictions.ltv_current,
            avg_ticket: r.predictions.expected_next_ticket,
            algorithm_version: ALGORITHM_VERSION,
          });
        }
      }));
    }
  }

  /* ════════════════════════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════════════════════════ */

  private changeDirection(prev: string | null, curr: string): 'upgrade' | 'downgrade' | 'stable' {
    if (!prev || prev === curr) return 'stable';
    const prevPriority = this.segmentPriority(prev);
    const currPriority = this.segmentPriority(curr);
    if (currPriority < prevPriority) return 'upgrade';
    if (currPriority > prevPriority) return 'downgrade';
    return 'stable';
  }

  private segmentPriority(segment: string): number {
    for (const [, info] of Object.entries(RFM_SEGMENTS)) {
      if (info.nome === segment) return info.prioridade;
    }
    return 11;
  }

  private buildReport(startedAt: Date, results: RFMResult[]): RFMReport {
    const finishedAt = new Date();
    const durationSecs = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000);

    const distribution: Record<string, number> = {};
    let upgrades = 0;
    let downgrades = 0;

    for (const r of results) {
      distribution[r.rfm_segment] = (distribution[r.rfm_segment] || 0) + 1;
      if (r.change_direction === 'upgrade') upgrades++;
      if (r.change_direction === 'downgrade') downgrades++;
    }

    const alerts: RFMReport['alerts'] = [];

    // VIPs em risco
    const vipsAtRisk = results.filter(r => r.flags.auto_vip && r.flags.churn_risk).length;
    if (vipsAtRisk > 0) {
      alerts.push({
        type: 'critical',
        message: `${vipsAtRisk} clientes VIP estão em risco de churn`,
        action: 'Acionar campanha de retenção VIP imediatamente',
      });
    }

    // Downgrades graves
    const topDowngrades = results.filter(
      r => r.change_direction === 'downgrade' && ['Champions', 'Loyal Customers'].includes(r.previous_segment || '')
    ).length;
    if (topDowngrades > 0) {
      alerts.push({
        type: 'warning',
        message: `${topDowngrades} clientes top fizeram downgrade`,
        action: 'Investigar causas e acionar recuperação personalizada',
      });
    }

    return {
      execution: {
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_secs: durationSecs,
        algorithm_version: ALGORITHM_VERSION,
      },
      stats: {
        total_processed: this.stats.processed,
        total_updated: this.stats.updated,
        total_errors: this.stats.errors,
        segment_changes: this.stats.segmentChanges,
        upgrades,
        downgrades,
      },
      distribution,
      alerts,
    };
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CALCULAR RFM PARA UM CLIENTE INDIVIDUAL
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function calculateClientRFM(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string
): Promise<RFMResult | null> {
  const engine = new RFMEngine(supabase, tenantId);
  const report = await engine.calculateAll();
  // Buscar resultado deste cliente do banco
  const { data } = await supabase
    .from('clients')
    .select('rfm_recency, rfm_frequency, rfm_monetary, rfm_score, rfm_segment, churn_probability, purchase_prob_30d, ltv_projected_12m')
    .eq('id', clientId)
    .single();

  if (!data || !data.rfm_score) return null;

  const segInfo = resolveSegment(data.rfm_score);
  return {
    client_id: clientId,
    rfm_recency: data.rfm_recency,
    rfm_frequency: data.rfm_frequency,
    rfm_monetary: data.rfm_monetary,
    rfm_score: data.rfm_score,
    rfm_segment: segInfo.nome,
    segment_info: segInfo,
    previous_segment: null,
    segment_changed: false,
    change_direction: 'stable',
    predictions: {
      expected_frequency: 0,
      next_purchase_at: null,
      purchase_prob_30d: data.purchase_prob_30d || 0,
      churn_probability: data.churn_probability || 0,
      ltv_current: 0,
      ltv_projected_12m: data.ltv_projected_12m || 0,
      ltv_projected_life: 0,
      expected_next_ticket: 0,
    },
    flags: {
      auto_vip: ['Champions', 'Loyal Customers'].includes(segInfo.nome),
      churn_risk: (data.churn_probability || 0) >= 60,
      needs_attention: ['At Risk', 'Cant Lose Them', 'Need Attention'].includes(segInfo.nome),
      upsell_ready: segInfo.nome === 'Potential Loyalist',
    },
    actions: getActionsForSegment(segInfo.nome),
  };
}
