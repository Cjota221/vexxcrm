'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS LOCAIS (para respostas da API)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface RFMDistribution {
  [segment: string]: {
    count: number;
    avg_churn: number;
    vip_count: number;
    risk_count: number;
  };
}

interface RFMSummary {
  total: number;
  calculated: boolean;
  vip_total?: number;
  risk_total?: number;
  avg_recency?: number;
  avg_frequency?: number;
  avg_monetary?: number;
}

interface RFMQueryResponse {
  success: boolean;
  distribution: RFMDistribution;
  summary: RFMSummary;
}

interface RFMClientResponse {
  success: boolean;
  client: {
    id: string;
    name: string;
    phone: string;
    rfm_recency: number;
    rfm_frequency: number;
    rfm_monetary: number;
    rfm_score: string;
    rfm_segment: string;
    rfm_calculated_at: string;
    churn_probability: number;
    purchase_prob_30d: number;
    ltv_projected_12m: number;
    ltv_projected_life: number;
    flag_auto_vip: boolean;
    flag_churn_risk: boolean;
    flag_needs_attention: boolean;
    flag_upsell_ready: boolean;
    sentiment_score: number;
    sentiment_label: string;
  };
}

interface RFMCalculateResponse {
  success: boolean;
  report: {
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
  };
}

interface IntelligenceOverview {
  success: boolean;
  overview: {
    rfm: {
      total_calculated: number;
      distribution: Record<string, number>;
      last_calculated_at: string | null;
    };
    kpis: {
      vip_count: number;
      risk_count: number;
      attention_count: number;
      upsell_count: number;
      avg_churn_probability: number;
      avg_purchase_prob_30d: number;
      total_ltv_projected_12m: number;
      avg_sentiment: number;
    };
    events: {
      total_7d: number;
      by_category: Record<string, number>;
    };
    model: {
      total_predictions: number;
      accuracy: number | null;
      correct: number;
    };
    sync: {
      recent: Array<Record<string, unknown>>;
    };
  };
}

interface BehavioralEventResponse {
  success: boolean;
  events: Array<Record<string, unknown>>;
  total: number;
  summary: Record<string, number>;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOOKS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Hook para overview completo de inteligência AI.
 */
export function useIntelligenceOverview() {
  return useQuery({
    queryKey: ['intelligence', 'overview'],
    queryFn: async () => {
      const response = await api.get<IntelligenceOverview>('/api/intelligence/overview');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
    refetchInterval: 5 * 60 * 1000, // 5 minutos
  });
}

/**
 * Hook para distribuição RFM.
 */
export function useRFMDistribution(segment?: string) {
  return useQuery({
    queryKey: ['intelligence', 'rfm', 'distribution', segment],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (segment) params.segment = segment;
      const response = await api.get<RFMQueryResponse>('/api/intelligence/rfm', params);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para dados RFM de um cliente específico.
 */
export function useClientRFM(clientId: string | null) {
  return useQuery({
    queryKey: ['intelligence', 'rfm', 'client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const response = await api.get<RFMClientResponse>('/api/intelligence/rfm', { client_id: clientId });
      if (response.error) throw new Error(response.error);
      return response.data?.client || null;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para calcular/recalcular RFM (mutação).
 */
export function useCalculateRFM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<RFMCalculateResponse>('/api/intelligence/rfm');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      // Invalidar todas as queries de inteligência
      queryClient.invalidateQueries({ queryKey: ['intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/**
 * Hook para eventos comportamentais de um cliente.
 */
export function useBehavioralEvents(clientId?: string, options?: { category?: string; days?: number; limit?: number }) {
  return useQuery({
    queryKey: ['intelligence', 'events', clientId, options],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (clientId) params.client_id = clientId;
      if (options?.category) params.category = options.category;
      if (options?.days) params.days = String(options.days);
      if (options?.limit) params.limit = String(options.limit);

      const response = await api.get<BehavioralEventResponse>('/api/intelligence/events', params);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook para registrar evento comportamental (mutação).
 */
export function useLogEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: {
      client_id: string;
      event_type: string;
      event_category: string;
      event_data?: Record<string, unknown>;
      channel?: string;
      message_text?: string;
    }) => {
      const response = await api.post('/api/intelligence/events', event);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intelligence', 'events'] });
    },
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   INTELLIGENCE V2 — Seasonal, Products, Sales Assistant
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface SeasonalInsight {
  event_slug: string;
  event_name: string;
  year: number;
  total_revenue: number;
  total_orders: number;
  avg_ticket: number;
  unique_buyers: number;
  top_products: Array<{ name: string; quantity: number; revenue: number }>;
  top_segments: Array<{ segment: string; count: number; revenue: number }>;
  yoy_growth: number | null;
}

interface SeasonalResponse {
  success: boolean;
  insights: SeasonalInsight[];
  stats: {
    seasonal_buyers: number;
    total_clients: number;
    coverage_pct: number;
  };
  year: number;
}

interface ProductTrendsResponse {
  success: boolean;
  trends: {
    growing: ProductTrendItem[];
    declining: ProductTrendItem[];
    top_sellers: ProductTrendItem[];
    total: number;
  };
}

interface ProductTrendItem {
  product_name: string;
  category: string | null;
  total_quantity: number;
  total_revenue: number;
  unique_buyers: number;
  qty_growth_pct: number | null;
  revenue_growth_pct: number | null;
  trend_direction: 'growing' | 'stable' | 'declining';
  velocity_score: number;
  period_start: string;
}

interface AffinityResponse {
  success: boolean;
  affinity: Array<{
    product_a_name: string;
    product_b_name: string;
    co_purchase_count: number;
    affinity_score: number;
    confidence_a_to_b: number;
  }>;
  total: number;
}

interface ClientInsightResponse {
  success: boolean;
  insight: {
    client_id: string;
    client_name: string;
    summary: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    rfm: {
      segment: string;
      score: string;
      churn_probability: number;
      purchase_prob_30d: number;
      ltv_projected_12m: number;
      days_since_purchase: number;
    } | null;
    purchase: {
      total_orders: number;
      total_spent: number;
      avg_ticket: number;
      preferred_category: string | null;
      price_sensitivity: string | null;
    };
    seasonal: {
      is_seasonal_buyer: boolean;
      preferred_season: string | null;
      upcoming_event: string | null;
      days_until_event: number | null;
    } | null;
    favorites: Array<{ name: string; qty: number }>;
    cross_sell: Array<{ product_name: string; reason: string; confidence: number }>;
    script: {
      greeting: string;
      talking_points: string[];
      offers: string[];
      caution: string[];
    };
    flags: {
      is_vip: boolean;
      is_at_risk: boolean;
      needs_attention: boolean;
      upsell_ready: boolean;
    };
    generated_at: string;
  };
}

/**
 * Hook para insights sazonais.
 */
export function useSeasonalInsights(year?: number) {
  const currentYear = new Date().getFullYear();
  // Se não foi passado um ano específico, tenta o ano atual; se não tiver dados, fallback para o anterior
  const targetYear = year || currentYear;

  return useQuery({
    queryKey: ['intelligence', 'seasonal', targetYear],
    queryFn: async () => {
      const params: Record<string, string> = { year: String(targetYear) };
      const response = await api.get<SeasonalResponse>('/api/intelligence/seasonal', params);
      if (response.error) throw new Error(response.error);

      // Se o ano atual não tem dados, busca o ano anterior automaticamente
      if (response.data && (!response.data.insights || response.data.insights.length === 0) && targetYear === currentYear) {
        const prevParams: Record<string, string> = { year: String(currentYear - 1) };
        const prevResponse = await api.get<SeasonalResponse>('/api/intelligence/seasonal', prevParams);
        if (!prevResponse.error && prevResponse.data?.insights?.length) {
          return { ...prevResponse.data, _fallback_year: currentYear - 1 };
        }
      }

      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para calcular sazonalidade (mutação).
 */
export function useCalculateSeasonal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/intelligence/seasonal');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intelligence', 'seasonal'] });
    },
    onError: (error: Error) => {
      console.error('❌ Erro ao calcular sazonal:', error.message);
    },
  });
}

/**
 * Hook para tendências de produto.
 */
export function useProductTrends(limit = 20) {
  return useQuery({
    queryKey: ['intelligence', 'products', 'trends', limit],
    queryFn: async () => {
      const response = await api.get<ProductTrendsResponse>('/api/intelligence/products', {
        type: 'trends',
        limit: String(limit),
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para afinidade de produtos.
 */
export function useProductAffinity(limit = 10) {
  return useQuery({
    queryKey: ['intelligence', 'products', 'affinity', limit],
    queryFn: async () => {
      const response = await api.get<AffinityResponse>('/api/intelligence/products', {
        type: 'affinity',
        limit: String(limit),
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para calcular inteligência de produto (mutação).
 */
export function useCalculateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/intelligence/products');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intelligence', 'products'] });
    },
    onError: (error: Error) => {
      console.error('❌ Erro ao calcular produtos:', error.message);
    },
  });
}

/**
 * Hook para insight de vendas de um cliente.
 */
export function useClientInsight(clientId: string | null) {
  return useQuery({
    queryKey: ['intelligence', 'assistant', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const response = await api.get<ClientInsightResponse>('/api/intelligence/assistant', {
        client_id: clientId,
      });
      if (response.error) throw new Error(response.error);
      return response.data?.insight || null;
    },
    enabled: !!clientId,
    staleTime: 2 * 60 * 1000,
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   INTELLIGENCE V3 — Segment Clients & Seasonal Buyers
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface SegmentClient {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  rfm_segment: string;
  rfm_score: string | null;
  rfm_recency: number | null;
  rfm_frequency: number | null;
  rfm_monetary: number | null;
  churn_probability: number | null;
  purchase_prob_30d: number | null;
  ltv_projected_12m: number | null;
  flag_auto_vip: boolean;
  flag_churn_risk: boolean;
  flag_needs_attention: boolean;
  flag_upsell_ready: boolean;
  total_orders: number | null;
  avg_ticket: number | null;
  total_spent: number | null;
  last_order_at: string | null;
  created_at: string;
}

interface SegmentClientsResponse {
  success: boolean;
  segment: string;
  clients: SegmentClient[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  summary: {
    total_clients: number;
    total_spent: number;
    avg_ticket: number;
  };
}

/**
 * Hook para listar clientes de um segmento RFM específico.
 */
export function useSegmentClients(segment: string | null, page = 1, search = '') {
  return useQuery({
    queryKey: ['intelligence', 'rfm', 'clients', segment, page, search],
    queryFn: async () => {
      if (!segment) return null;
      const params: Record<string, string> = { segment, page: String(page), limit: '200' };
      if (search) params.search = search;
      const response = await api.get<SegmentClientsResponse>('/api/intelligence/rfm/clients', params);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!segment,
    staleTime: 2 * 60 * 1000,
  });
}

export interface SeasonalBuyer {
  client_id: string;
  name: string;
  phone: string;
  email: string | null;
  rfm_segment: string | null;
  rfm_score: string | null;
  is_vip: boolean;
  is_at_risk: boolean;
  seasonal_orders: number;
  seasonal_spent: number;
  seasonal_items: number;
  seasonal_last_order: string;
  total_orders: number;
  total_spent: number;
  avg_ticket: number;
  last_order_at: string | null;
}

interface SeasonalBuyersResponse {
  success: boolean;
  event: string;
  event_name: string;
  year: number;
  buyers: SeasonalBuyer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  summary: {
    total_buyers: number;
    total_orders: number;
    total_revenue: number;
  };
}

/**
 * Hook para listar compradores de um evento sazonal.
 */
export function useSeasonalBuyers(eventSlug: string | null, year?: number, page = 1) {
  return useQuery({
    queryKey: ['intelligence', 'seasonal', 'buyers', eventSlug, year, page],
    queryFn: async () => {
      if (!eventSlug) return null;
      const params: Record<string, string> = { event: eventSlug, page: String(page), limit: '50' };
      if (year) params.year = String(year);
      const response = await api.get<SeasonalBuyersResponse>('/api/intelligence/seasonal/buyers', params);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!eventSlug,
    staleTime: 2 * 60 * 1000,
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MONTHLY TRENDS — Comportamento mensal histórico
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface MonthSummary {
  month: number;
  month_name: string;
  total_orders: number;
  total_revenue: number;
  avg_orders_per_year: number;
  avg_revenue_per_year: number;
  years_with_data: number;
}

export interface YearlyMonthly {
  year: number;
  months: Array<{ month: number; month_name: string; orders: number; revenue: number }>;
  total_orders: number;
  total_revenue: number;
}

export interface DayPatternEntry {
  year: number;
  month: number;
  month_name: string;
  orders: number;
  revenue: number;
}

export interface MonthlyTrendsResponse {
  success: boolean;
  reference_date: { day: number; month: number; year: number; month_name: string };
  years_analyzed: number[];
  total_orders_analyzed: number;
  monthly_summary: MonthSummary[];
  yearly_monthly: YearlyMonthly[];
  best_months: (MonthSummary & { rank: number })[];
  day_of_month_pattern: DayPatternEntry[];
  month_comparison: {
    current_month: number;
    current_month_name: string;
    prev_year: { year: number; orders: number; revenue: number };
    two_years_ago: { year: number; orders: number; revenue: number };
    growth_orders_yoy: number | null;
    growth_revenue_yoy: number | null;
  };
  insights: string[];
}

export function useMonthlyTrends() {
  return useQuery({
    queryKey: ['intelligence', 'monthly-trends'],
    queryFn: async () => {
      const response = await api.get<MonthlyTrendsResponse>('/api/intelligence/monthly-trends');
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}
