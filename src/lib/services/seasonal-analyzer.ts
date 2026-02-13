/**
 * Seasonal Analyzer — Motor de análise sazonal e temporal.
 *
 * Analisa padrões de compra por datas comerciais (Dia das Mães,
 * Black Friday, Natal, etc.), identifica clientes sazonais e
 * gera insights de oportunidade de campanha.
 *
 * Schema: seasonal_events, client_seasonal_profiles, clients, orders
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface SeasonalEvent {
  slug: string;
  name: string;
  getDateRange: (year: number) => { start: Date; end: Date };
}

export interface SeasonalInsight {
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

export interface ClientSeasonalProfile {
  client_id: string;
  seasonal_events_count: number;
  seasonal_total_spent: number;
  seasonal_avg_ticket: number;
  preferred_season: string | null;
  seasonal_score: number;
  events: Record<string, boolean>;
}

export interface SeasonalReport {
  insights: SeasonalInsight[];
  upcoming: Array<{
    slug: string;
    name: string;
    days_until: number;
    start_date: string;
    warmup_start: string;
    target_clients: number;
    projected_revenue: number;
  }>;
  client_stats: {
    seasonal_buyers: number;
    non_seasonal: number;
    top_seasonal_segment: string | null;
  };
  calculated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CALENDÁRIO COMERCIAL BRASILEIRO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SEASONAL_CALENDAR: SeasonalEvent[] = [
  {
    slug: 'carnaval',
    name: 'Carnaval',
    getDateRange: (year) => {
      // Carnaval varia — aproximação simplificada (fevereiro)
      return { start: new Date(year, 1, 1), end: new Date(year, 1, 28) };
    },
  },
  {
    slug: 'dia_mulher',
    name: 'Dia da Mulher',
    getDateRange: (year) => ({
      start: new Date(year, 2, 1),
      end: new Date(year, 2, 10),
    }),
  },
  {
    slug: 'pascoa',
    name: 'Páscoa',
    getDateRange: (year) => ({
      start: new Date(year, 2, 20),
      end: new Date(year, 3, 15),
    }),
  },
  {
    slug: 'dia_maes',
    name: 'Dia das Mães',
    getDateRange: (year) => ({
      start: new Date(year, 4, 1),
      end: new Date(year, 4, 15),
    }),
  },
  {
    slug: 'dia_namorados',
    name: 'Dia dos Namorados',
    getDateRange: (year) => ({
      start: new Date(year, 5, 1),
      end: new Date(year, 5, 15),
    }),
  },
  {
    slug: 'dia_pais',
    name: 'Dia dos Pais',
    getDateRange: (year) => ({
      start: new Date(year, 7, 1),
      end: new Date(year, 7, 15),
    }),
  },
  {
    slug: 'dia_criancas',
    name: 'Dia das Crianças',
    getDateRange: (year) => ({
      start: new Date(year, 9, 1),
      end: new Date(year, 9, 15),
    }),
  },
  {
    slug: 'black_friday',
    name: 'Black Friday',
    getDateRange: (year) => ({
      start: new Date(year, 10, 20),
      end: new Date(year, 10, 30),
    }),
  },
  {
    slug: 'natal',
    name: 'Natal',
    getDateRange: (year) => ({
      start: new Date(year, 11, 1),
      end: new Date(year, 11, 26),
    }),
  },
  {
    slug: 'ano_novo',
    name: 'Ano Novo',
    getDateRange: (year) => ({
      start: new Date(year, 11, 27),
      end: new Date(year + 1, 0, 3),
    }),
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SEASONAL ANALYZER ENGINE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class SeasonalAnalyzer {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /* ════════════════════════════════════════════════════════════
     ANALISAR TODAS AS ESTAÇÕES
     ════════════════════════════════════════════════════════════ */

  async analyze(): Promise<SeasonalReport> {
    console.log('🗓️ Seasonal Analyzer: Iniciando...');

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];

    // 1. Buscar todos os pedidos do tenant
    const orders = await this.fetchAllOrders();
    console.log(`📦 ${orders.length} pedidos para análise sazonal`);

    if (orders.length === 0) {
      return this.emptyReport();
    }

    // 2. Analisar cada estação para cada ano
    const insights: SeasonalInsight[] = [];
    for (const year of years) {
      for (const event of SEASONAL_CALENDAR) {
        const insight = this.analyzeEvent(event, year, orders);
        if (insight.total_orders > 0) {
          insights.push(insight);
        }
      }
    }

    // 3. Calcular YoY growth
    for (const insight of insights) {
      if (insight.year === currentYear) {
        const prev = insights.find(
          i => i.event_slug === insight.event_slug && i.year === currentYear - 1
        );
        if (prev && prev.total_revenue > 0) {
          insight.yoy_growth = parseFloat(
            (((insight.total_revenue - prev.total_revenue) / prev.total_revenue) * 100).toFixed(1)
          );
        }
      }
    }

    // 4. Persistir insights em seasonal_events
    await this.persistInsights(insights);

    // 5. Calcular perfis sazonais dos clientes
    const clientProfiles = this.calculateClientProfiles(orders);
    await this.persistClientProfiles(clientProfiles);

    // 6. Identificar próximos eventos
    const upcoming = this.getUpcomingEvents(clientProfiles, insights);

    // 7. Stats
    const seasonalBuyers = clientProfiles.filter(p => p.seasonal_events_count > 0).length;
    const topSeason = this.findTopSeason(clientProfiles);

    const report: SeasonalReport = {
      insights: insights.filter(i => i.year === currentYear),
      upcoming,
      client_stats: {
        seasonal_buyers: seasonalBuyers,
        non_seasonal: clientProfiles.length - seasonalBuyers,
        top_seasonal_segment: topSeason,
      },
      calculated_at: new Date().toISOString(),
    };

    console.log('✅ Seasonal Analyzer: Concluído!');
    return report;
  }

  /* ════════════════════════════════════════════════════════════
     ANALISAR UM EVENTO SAZONAL
     ════════════════════════════════════════════════════════════ */

  private analyzeEvent(
    event: SeasonalEvent,
    year: number,
    orders: OrderData[]
  ): SeasonalInsight {
    const { start, end } = event.getDateRange(year);
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    // Filtrar pedidos no período
    const periodOrders = orders.filter(o => {
      const d = o.created_at;
      return d >= startStr && d <= endStr;
    });

    if (periodOrders.length === 0) {
      return {
        event_slug: event.slug,
        event_name: event.name,
        year,
        total_revenue: 0,
        total_orders: 0,
        avg_ticket: 0,
        unique_buyers: 0,
        top_products: [],
        top_segments: [],
        yoy_growth: null,
      };
    }

    const totalRevenue = periodOrders.reduce((s, o) => s + o.total, 0);
    const uniqueBuyers = new Set(periodOrders.filter(o => o.client_id).map(o => o.client_id)).size;

    // Top products from order items
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of periodOrders) {
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          const key = item.product_name || 'Unknown';
          const prev = productMap.get(key) || { name: key, quantity: 0, revenue: 0 };
          prev.quantity += item.quantity || 1;
          prev.revenue += item.total || 0;
          productMap.set(key, prev);
        }
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Top segments (based on client RFM segments)
    const segmentMap = new Map<string, { count: number; revenue: number }>();
    for (const order of periodOrders) {
      const seg = order.client_segment || 'Unknown';
      const prev = segmentMap.get(seg) || { count: 0, revenue: 0 };
      prev.count++;
      prev.revenue += order.total;
      segmentMap.set(seg, prev);
    }

    const topSegments = Array.from(segmentMap.entries())
      .map(([segment, data]) => ({ segment, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      event_slug: event.slug,
      event_name: event.name,
      year,
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      total_orders: periodOrders.length,
      avg_ticket: parseFloat((totalRevenue / periodOrders.length).toFixed(2)),
      unique_buyers: uniqueBuyers,
      top_products: topProducts,
      top_segments: topSegments,
      yoy_growth: null,
    };
  }

  /* ════════════════════════════════════════════════════════════
     PERFIS SAZONAIS DE CLIENTES
     ════════════════════════════════════════════════════════════ */

  private calculateClientProfiles(orders: OrderData[]): ClientSeasonalProfile[] {
    const clientMap = new Map<string, ClientSeasonalProfile>();

    for (const order of orders) {
      if (!order.client_id) continue;

      if (!clientMap.has(order.client_id)) {
        clientMap.set(order.client_id, {
          client_id: order.client_id,
          seasonal_events_count: 0,
          seasonal_total_spent: 0,
          seasonal_avg_ticket: 0,
          preferred_season: null,
          seasonal_score: 0,
          events: {},
        });
      }

      const profile = clientMap.get(order.client_id)!;
      const orderDate = order.created_at;

      // Check each seasonal event
      for (const event of SEASONAL_CALENDAR) {
        const year = new Date(orderDate).getFullYear();
        const { start, end } = event.getDateRange(year);
        if (orderDate >= start.toISOString() && orderDate <= end.toISOString()) {
          if (!profile.events[event.slug]) {
            profile.events[event.slug] = true;
            profile.seasonal_events_count++;
          }
          profile.seasonal_total_spent += order.total;
        }
      }
    }

    // Calculate scores and preferred season
    for (const profile of clientMap.values()) {
      if (profile.seasonal_events_count > 0) {
        profile.seasonal_avg_ticket = parseFloat(
          (profile.seasonal_total_spent / profile.seasonal_events_count).toFixed(2)
        );
      }

      // Preferred season = most frequent
      const eventCounts: Record<string, number> = {};
      for (const [slug, active] of Object.entries(profile.events)) {
        if (active) eventCounts[slug] = (eventCounts[slug] || 0) + 1;
      }
      const sorted = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        profile.preferred_season = sorted[0][0];
      }

      // Score: 0-100 baseado em qtd de eventos sazonais e valor
      const eventScore = Math.min(50, profile.seasonal_events_count * 10);
      const spendScore = Math.min(50, (profile.seasonal_total_spent / 500) * 50);
      profile.seasonal_score = parseFloat(Math.min(100, eventScore + spendScore).toFixed(1));
    }

    return Array.from(clientMap.values());
  }

  /* ════════════════════════════════════════════════════════════
     PRÓXIMOS EVENTOS
     ════════════════════════════════════════════════════════════ */

  private getUpcomingEvents(
    profiles: ClientSeasonalProfile[],
    insights: SeasonalInsight[]
  ) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const upcoming = [];

    for (const event of SEASONAL_CALENDAR) {
      const { start } = event.getDateRange(currentYear);
      const daysUntil = Math.floor((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Mostrar eventos dos próximos 90 dias
      if (daysUntil > 0 && daysUntil <= 90) {
        const warmupStart = new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000);
        const targetClients = profiles.filter(p => p.events[event.slug]).length;

        // Projeção baseada no ano anterior
        const prevInsight = insights.find(
          i => i.event_slug === event.slug && i.year === currentYear - 1
        );
        const projectedRevenue = prevInsight ? prevInsight.total_revenue * 1.1 : 0;

        upcoming.push({
          slug: event.slug,
          name: event.name,
          days_until: daysUntil,
          start_date: start.toISOString().split('T')[0],
          warmup_start: warmupStart.toISOString().split('T')[0],
          target_clients: targetClients,
          projected_revenue: parseFloat(projectedRevenue.toFixed(2)),
        });
      }
    }

    return upcoming.sort((a, b) => a.days_until - b.days_until);
  }

  /* ════════════════════════════════════════════════════════════
     DATA FETCHING
     ════════════════════════════════════════════════════════════ */

  private async fetchAllOrders(): Promise<OrderData[]> {
    const allOrders: OrderData[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await this.supabase
        .from('orders')
        .select('id, client_id, total, metadata, created_at, status')
        .eq('tenant_id', this.tenantId)
        .not('client_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + 999);

      if (error) {
        console.error('❌ Erro ao buscar orders:', error.message);
        break;
      }
      if (!data || data.length === 0) break;

      // Fetch client segments for these orders
      const clientIds = [...new Set(data.map(o => o.client_id).filter(Boolean))];
      const { data: clients } = await this.supabase
        .from('clients')
        .select('id, rfm_segment')
        .in('id', clientIds);

      const segmentMap = new Map<string, string>();
      if (clients) {
        for (const c of clients) {
          segmentMap.set(c.id, c.rfm_segment || 'Unknown');
        }
      }

      for (const o of data) {
        // Extrair itens do metadata (FacilZap armazena como metadata.itens)
        const meta = (o.metadata || {}) as Record<string, unknown>;
        const rawItems = (meta.itens || meta.items || []) as Array<Record<string, unknown>>;
        const items = Array.isArray(rawItems) ? rawItems.map(item => ({
          product_name: (item.nome || item.product_name || 'Desconhecido') as string,
          quantity: Number(item.quantidade || item.quantity || 1),
          total: Number(item.valor || item.total || item.preco_unitario || 0),
        })) : [];

        allOrders.push({
          id: o.id,
          client_id: o.client_id,
          total: Number(o.total) || 0,
          items,
          created_at: o.created_at,
          status: o.status,
          client_segment: segmentMap.get(o.client_id) || 'Unknown',
        });
      }

      if (data.length < 1000) break;
      from += 1000;
    }

    return allOrders;
  }

  /* ════════════════════════════════════════════════════════════
     PERSISTÊNCIA
     ════════════════════════════════════════════════════════════ */

  private async persistInsights(insights: SeasonalInsight[]): Promise<void> {
    const records = insights.map(insight => {
      const event = SEASONAL_CALENDAR.find(e => e.slug === insight.event_slug);
      const range = event?.getDateRange(insight.year);
      return {
        tenant_id: this.tenantId,
        name: insight.event_name,
        slug: insight.event_slug,
        event_type: 'seasonal',
        start_date: range ? range.start.toISOString().split('T')[0] : `${insight.year}-01-01`,
        end_date: range ? range.end.toISOString().split('T')[0] : `${insight.year}-12-31`,
        total_revenue: insight.total_revenue,
        total_orders: insight.total_orders,
        avg_ticket: insight.avg_ticket,
        top_products: insight.top_products,
        top_segments: insight.top_segments,
        growth_rate_pct: insight.yoy_growth,
        year: insight.year,
        updated_at: new Date().toISOString(),
      };
    });

    // Batch upsert (max 20 seasonal events per year, total ~40)
    if (records.length > 0) {
      await this.supabase
        .from('seasonal_events')
        .upsert(records, { onConflict: 'tenant_id,slug,year' });
    }
  }

  private async persistClientProfiles(profiles: ClientSeasonalProfile[]): Promise<void> {
    // Batch upsert em client_seasonal_profiles
    for (let i = 0; i < profiles.length; i += 100) {
      const batch = profiles.slice(i, i + 100);
      const records = batch.map(p => ({
        tenant_id: this.tenantId,
        client_id: p.client_id,
        buys_dia_maes: !!p.events.dia_maes,
        buys_dia_namorados: !!p.events.dia_namorados,
        buys_dia_pais: !!p.events.dia_pais,
        buys_black_friday: !!p.events.black_friday,
        buys_natal: !!p.events.natal,
        buys_ano_novo: !!p.events.ano_novo,
        seasonal_events_count: p.seasonal_events_count,
        seasonal_total_spent: p.seasonal_total_spent,
        seasonal_avg_ticket: p.seasonal_avg_ticket,
        preferred_season: p.preferred_season,
        seasonal_score: p.seasonal_score,
        history: p.events,
        calculated_at: new Date().toISOString(),
      }));

      await this.supabase
        .from('client_seasonal_profiles')
        .upsert(records, { onConflict: 'tenant_id,client_id' });
    }

    // Batch update clients: separar seasonal_buyers e non_seasonal
    const seasonalIds = profiles.filter(p => p.seasonal_events_count > 0).map(p => p.client_id);
    const nonSeasonalIds = profiles.filter(p => p.seasonal_events_count === 0).map(p => p.client_id);

    if (seasonalIds.length > 0) {
      // Batch update em chunks de 200
      for (let i = 0; i < seasonalIds.length; i += 200) {
        const chunk = seasonalIds.slice(i, i + 200);
        await this.supabase
          .from('clients')
          .update({ seasonal_buyer: true })
          .in('id', chunk);
      }
    }

    if (nonSeasonalIds.length > 0) {
      for (let i = 0; i < nonSeasonalIds.length; i += 200) {
        const chunk = nonSeasonalIds.slice(i, i + 200);
        await this.supabase
          .from('clients')
          .update({ seasonal_buyer: false })
          .in('id', chunk);
      }
    }

    // Update preferred_season e seasonal_score para os que têm dados
    const withSeason = profiles.filter(p => p.preferred_season && p.seasonal_score > 0);
    for (let i = 0; i < withSeason.length; i += 100) {
      const chunk = withSeason.slice(i, i + 100);
      // Use parallel updates por chunk
      await Promise.all(chunk.map(p =>
        this.supabase
          .from('clients')
          .update({
            seasonal_score: p.seasonal_score,
            preferred_season: p.preferred_season,
          })
          .eq('id', p.client_id)
      ));
    }
  }

  /* ════════════════════════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════════════════════════ */

  private findTopSeason(profiles: ClientSeasonalProfile[]): string | null {
    const seasonCounts: Record<string, number> = {};
    for (const p of profiles) {
      if (p.preferred_season) {
        seasonCounts[p.preferred_season] = (seasonCounts[p.preferred_season] || 0) + 1;
      }
    }
    const sorted = Object.entries(seasonCounts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  private emptyReport(): SeasonalReport {
    return {
      insights: [],
      upcoming: this.getUpcomingEvents([], []),
      client_stats: {
        seasonal_buyers: 0,
        non_seasonal: 0,
        top_seasonal_segment: null,
      },
      calculated_at: new Date().toISOString(),
    };
  }

  /* ════════════════════════════════════════════════════════════
     CONSULTAS RÁPIDAS (para UI)
     ════════════════════════════════════════════════════════════ */

  /** Buscar insights sazonais já calculados (sem recalcular) */
  async getInsights(year?: number): Promise<SeasonalInsight[]> {
    const targetYear = year || new Date().getFullYear();

    const { data } = await this.supabase
      .from('seasonal_events')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('year', targetYear)
      .order('start_date', { ascending: true });

    if (!data) return [];

    return data.map(d => ({
      event_slug: d.slug,
      event_name: d.name,
      year: d.year,
      total_revenue: Number(d.total_revenue) || 0,
      total_orders: d.total_orders || 0,
      avg_ticket: Number(d.avg_ticket) || 0,
      unique_buyers: 0,
      top_products: d.top_products || [],
      top_segments: d.top_segments || [],
      yoy_growth: d.growth_rate_pct,
    }));
  }

  /** Buscar perfil sazonal de um cliente */
  async getClientProfile(clientId: string): Promise<ClientSeasonalProfile | null> {
    const { data } = await this.supabase
      .from('client_seasonal_profiles')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .single();

    if (!data) return null;

    return {
      client_id: data.client_id,
      seasonal_events_count: data.seasonal_events_count || 0,
      seasonal_total_spent: Number(data.seasonal_total_spent) || 0,
      seasonal_avg_ticket: Number(data.seasonal_avg_ticket) || 0,
      preferred_season: data.preferred_season,
      seasonal_score: Number(data.seasonal_score) || 0,
      events: {
        dia_maes: data.buys_dia_maes,
        dia_namorados: data.buys_dia_namorados,
        dia_pais: data.buys_dia_pais,
        black_friday: data.buys_black_friday,
        natal: data.buys_natal,
        ano_novo: data.buys_ano_novo,
      },
    };
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS INTERNOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface OrderData {
  id: string;
  client_id: string;
  total: number;
  items: Array<{ product_name?: string; quantity?: number; total?: number }>;
  created_at: string;
  status: string;
  client_segment: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FACTORY
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function createSeasonalAnalyzer(supabase: SupabaseClient, tenantId: string): SeasonalAnalyzer {
  return new SeasonalAnalyzer(supabase, tenantId);
}

export { SEASONAL_CALENDAR };
