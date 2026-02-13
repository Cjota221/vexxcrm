/**
 * Sales Assistant — Insights em tempo real para vendedores.
 *
 * Gera contexto completo de um cliente para o atendente usar
 * durante a conversa no WhatsApp. Inclui RFM, sazonalidade,
 * preferências de produto, sugestões de cross-sell e scripts.
 *
 * Combinação de: clients, orders, rfm, seasonal, grade_preferences, product_affinity
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SEASONAL_CALENDAR } from './seasonal-analyzer';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ClientInsight {
  client_id: string;
  client_name: string;

  // Resumo rápido
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';

  // RFM
  rfm: {
    segment: string;
    score: string;
    churn_probability: number;
    purchase_prob_30d: number;
    ltv_projected_12m: number;
    days_since_purchase: number;
  } | null;

  // Comportamento de compra
  purchase: {
    total_orders: number;
    total_spent: number;
    avg_ticket: number;
    last_purchase: string | null;
    preferred_category: string | null;
    price_sensitivity: string | null;
    reorder_rate: number;
  };

  // Sazonalidade
  seasonal: {
    is_seasonal_buyer: boolean;
    preferred_season: string | null;
    seasonal_score: number;
    upcoming_event: string | null;
    days_until_event: number | null;
  } | null;

  // Produtos favoritos
  favorites: Array<{
    name: string;
    qty: number;
  }>;

  // Sugestões de cross-sell
  cross_sell: Array<{
    product_name: string;
    reason: string;
    confidence: number;
  }>;

  // Script sugerido para o vendedor
  script: {
    greeting: string;
    talking_points: string[];
    offers: string[];
    caution: string[];
  };

  // Flags
  flags: {
    is_vip: boolean;
    is_at_risk: boolean;
    needs_attention: boolean;
    upsell_ready: boolean;
  };

  generated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SALES ASSISTANT ENGINE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class SalesAssistant {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /* ════════════════════════════════════════════════════════════
     GERAR INSIGHT COMPLETO DO CLIENTE
     ════════════════════════════════════════════════════════════ */

  async getClientInsight(clientId: string): Promise<ClientInsight | null> {
    // 1. Buscar dados do cliente
    const { data: client } = await this.supabase
      .from('clients')
      .select(`
        id, name, phone, status, ltv, ticket_medio, total_pedidos, ultima_compra,
        rfm_score, rfm_segment, rfm_recency, rfm_frequency, rfm_monetary,
        churn_probability, purchase_prob_30d, ltv_projected_12m,
        preferred_category, price_sensitivity, reorder_rate, variety_score,
        seasonal_buyer, seasonal_score, preferred_season,
        flag_auto_vip, flag_churn_risk, flag_needs_attention, flag_upsell_ready,
        tags
      `)
      .eq('id', clientId)
      .eq('tenant_id', this.tenantId)
      .single();

    if (!client) return null;

    // 2. Buscar preferências de grade
    const { data: gradeProfile } = await this.supabase
      .from('client_grade_preferences')
      .select('preferred_categories, top_products, price_sensitivity')
      .eq('client_id', clientId)
      .eq('tenant_id', this.tenantId)
      .single();

    // 3. Buscar cross-sell suggestions baseado nos produtos favoritos
    const crossSell = await this.getCrossSellSuggestions(
      gradeProfile?.top_products || []
    );

    // 4. Calcular dias desde última compra
    const daysSincePurchase = client.ultima_compra
      ? Math.floor((Date.now() - new Date(client.ultima_compra).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // 5. Verificar próximo evento sazonal
    const upcomingEvent = this.getNextSeasonalEvent(client);

    // 6. Determinar urgência
    const urgency = this.calculateUrgency(client, daysSincePurchase);

    // 7. Gerar script
    const script = this.generateScript(client, gradeProfile, crossSell, upcomingEvent, daysSincePurchase);

    // 8. Gerar summary
    const summary = this.generateSummary(client, daysSincePurchase, urgency);

    // 9. Montar insight
    const insight: ClientInsight = {
      client_id: client.id,
      client_name: client.name || 'Cliente',

      summary,
      urgency,

      rfm: client.rfm_score ? {
        segment: client.rfm_segment || 'Unknown',
        score: client.rfm_score,
        churn_probability: client.churn_probability || 0,
        purchase_prob_30d: client.purchase_prob_30d || 0,
        ltv_projected_12m: client.ltv_projected_12m || 0,
        days_since_purchase: daysSincePurchase,
      } : null,

      purchase: {
        total_orders: client.total_pedidos || 0,
        total_spent: client.ltv || 0,
        avg_ticket: client.ticket_medio || 0,
        last_purchase: client.ultima_compra || null,
        preferred_category: client.preferred_category || gradeProfile?.preferred_categories?.[0] || null,
        price_sensitivity: client.price_sensitivity || gradeProfile?.price_sensitivity || null,
        reorder_rate: client.reorder_rate || 0,
      },

      seasonal: {
        is_seasonal_buyer: client.seasonal_buyer || false,
        preferred_season: client.preferred_season || null,
        seasonal_score: client.seasonal_score || 0,
        upcoming_event: upcomingEvent?.name || null,
        days_until_event: upcomingEvent?.daysUntil || null,
      },

      favorites: (gradeProfile?.top_products || []).slice(0, 5),

      cross_sell: crossSell.slice(0, 3),

      script,

      flags: {
        is_vip: client.flag_auto_vip || false,
        is_at_risk: client.flag_churn_risk || false,
        needs_attention: client.flag_needs_attention || false,
        upsell_ready: client.flag_upsell_ready || false,
      },

      generated_at: new Date().toISOString(),
    };

    // Salvar hint de script no cliente
    await this.supabase
      .from('clients')
      .update({
        sales_script_hint: script.talking_points.join(' | '),
        last_insight_at: new Date().toISOString(),
      })
      .eq('id', clientId);

    return insight;
  }

  /* ════════════════════════════════════════════════════════════
     CROSS-SELL SUGGESTIONS
     ════════════════════════════════════════════════════════════ */

  private async getCrossSellSuggestions(
    topProducts: Array<{ name: string; product_id?: string; qty?: number }>
  ): Promise<ClientInsight['cross_sell']> {
    if (!topProducts || topProducts.length === 0) return [];

    const suggestions: ClientInsight['cross_sell'] = [];
    const productNames = topProducts.map(p => p.name);

    // Buscar pares de afinidade para cada produto favorito
    for (const productName of productNames.slice(0, 3)) {
      const { data: pairs } = await this.supabase
        .from('product_affinity')
        .select('product_a_name, product_b_name, affinity_score, confidence_a_to_b, confidence_b_to_a')
        .eq('tenant_id', this.tenantId)
        .or(`product_a_name.eq.${productName},product_b_name.eq.${productName}`)
        .order('affinity_score', { ascending: false })
        .limit(3);

      if (pairs) {
        for (const pair of pairs) {
          const suggestedProduct = pair.product_a_name === productName
            ? pair.product_b_name
            : pair.product_a_name;

          // Evitar duplicatas
          if (!suggestions.find(s => s.product_name === suggestedProduct)) {
            suggestions.push({
              product_name: suggestedProduct,
              reason: `Frequentemente comprado junto com "${productName}"`,
              confidence: pair.affinity_score || 0,
            });
          }
        }
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /* ════════════════════════════════════════════════════════════
     URGÊNCIA
     ════════════════════════════════════════════════════════════ */

  private calculateUrgency(
    client: Record<string, unknown>,
    daysSincePurchase: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const churnProb = (client.churn_probability as number) || 0;
    const isVip = client.flag_auto_vip as boolean;
    const isRisk = client.flag_churn_risk as boolean;

    if (isVip && isRisk) return 'critical';
    if (isRisk && churnProb >= 70) return 'critical';
    if (isRisk || daysSincePurchase > 120) return 'high';
    if (churnProb >= 40 || daysSincePurchase > 60) return 'medium';
    return 'low';
  }

  /* ════════════════════════════════════════════════════════════
     PRÓXIMO EVENTO SAZONAL
     ════════════════════════════════════════════════════════════ */

  private getNextSeasonalEvent(
    client: Record<string, unknown>
  ): { name: string; slug: string; daysUntil: number } | null {
    if (!client.seasonal_buyer) return null;

    const now = new Date();
    const year = now.getFullYear();
    let closest: { name: string; slug: string; daysUntil: number } | null = null;

    for (const event of SEASONAL_CALENDAR) {
      const { start } = event.getDateRange(year);
      const daysUntil = Math.floor((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil > 0 && daysUntil <= 60) {
        if (!closest || daysUntil < closest.daysUntil) {
          closest = { name: event.name, slug: event.slug, daysUntil };
        }
      }
    }

    return closest;
  }

  /* ════════════════════════════════════════════════════════════
     GERAÇÃO DE SCRIPT
     ════════════════════════════════════════════════════════════ */

  private generateScript(
    client: Record<string, unknown>,
    gradeProfile: Record<string, unknown> | null,
    crossSell: ClientInsight['cross_sell'],
    upcomingEvent: { name: string; daysUntil: number } | null,
    daysSincePurchase: number,
  ): ClientInsight['script'] {
    const name = (client.name as string)?.split(' ')[0] || 'cliente';
    const segment = (client.rfm_segment as string) || '';
    const totalOrders = (client.total_pedidos as number) || 0;
    const avgTicket = (client.ticket_medio as number) || 0;
    const isVip = client.flag_auto_vip as boolean;
    const isRisk = client.flag_churn_risk as boolean;
    const prefCategory = (client.preferred_category as string) ||
      (gradeProfile?.preferred_categories as string[])?.[0] || '';

    // Greeting
    let greeting = `Olá ${name}! 😊`;
    if (isVip) {
      greeting = `Olá ${name}! ⭐ Que prazer falar com você, cliente VIP!`;
    } else if (totalOrders > 5) {
      greeting = `Olá ${name}! 😊 Sempre bom ter você de volta!`;
    } else if (totalOrders === 0) {
      greeting = `Olá ${name}! 👋 Seja bem-vindo(a)!`;
    }

    // Talking points
    const talkingPoints: string[] = [];

    if (daysSincePurchase < 7 && daysSincePurchase >= 0) {
      talkingPoints.push(`Comprou recentemente (${daysSincePurchase} dias) — perguntar se chegou tudo bem`);
    } else if (daysSincePurchase > 90) {
      talkingPoints.push(`Inativo há ${daysSincePurchase} dias — acolher e entender motivo`);
    }

    if (prefCategory) {
      talkingPoints.push(`Gosta de: ${prefCategory} — mostrar novidades dessa categoria`);
    }

    if (avgTicket > 0) {
      talkingPoints.push(`Ticket médio: R$ ${avgTicket.toFixed(0)} — oferecer na faixa de preço`);
    }

    if (isVip) {
      talkingPoints.push('⭐ Cliente VIP — tratamento diferenciado, prioridade no atendimento');
    }

    if (segment === 'Potential Loyalist') {
      talkingPoints.push('🎯 Potencial para fidelizar — criar conexão, oferecer benefício');
    }

    // Offers
    const offers: string[] = [];

    if (crossSell.length > 0) {
      offers.push(`💡 Sugerir: ${crossSell.map(c => c.product_name).join(', ')}`);
    }

    if (upcomingEvent) {
      offers.push(`🗓️ ${upcomingEvent.name} em ${upcomingEvent.daysUntil} dias — oferecer antecipação`);
    }

    if (isRisk) {
      offers.push('🎁 Oferecer cupom de retorno / frete grátis para reativação');
    }

    if (totalOrders >= 3 && !isVip) {
      offers.push('⬆️ Sugerir kit ou combo com desconto progressivo');
    }

    // Caution
    const caution: string[] = [];

    if (isRisk) {
      caution.push('⚠️ Cliente em risco de churn — evitar pressão, focar em valor');
    }

    if ((client.nps_estimated as number) < -20) {
      caution.push('😡 Sentimento negativo detectado — ser extra empático');
    }

    if (segment === 'Cant Lose Them') {
      caution.push('🚨 Cliente de alto valor prestes a sair — escalar se necessário');
    }

    return { greeting, talking_points: talkingPoints, offers, caution };
  }

  /* ════════════════════════════════════════════════════════════
     SUMMARY
     ════════════════════════════════════════════════════════════ */

  private generateSummary(
    client: Record<string, unknown>,
    daysSincePurchase: number,
    urgency: string,
  ): string {
    const name = (client.name as string)?.split(' ')[0] || 'Cliente';
    const totalOrders = (client.total_pedidos as number) || 0;
    const ltv = (client.ltv as number) || 0;
    const segment = (client.rfm_segment as string) || 'novo';

    const parts: string[] = [];

    parts.push(`${name}: ${totalOrders} pedidos, R$ ${ltv.toFixed(0)} LTV`);
    parts.push(`Segmento: ${segment}`);

    if (daysSincePurchase < 999) {
      parts.push(`Última compra: ${daysSincePurchase}d atrás`);
    }

    if (urgency === 'critical') {
      parts.push('🚨 ATENÇÃO CRÍTICA');
    } else if (urgency === 'high') {
      parts.push('⚠️ Atenção alta');
    }

    return parts.join(' | ');
  }

  /* ════════════════════════════════════════════════════════════
     BATCH: GERAR INSIGHTS PARA TODOS OS ATIVOS
     ════════════════════════════════════════════════════════════ */

  async generateBatchInsights(limit = 50): Promise<{
    total: number;
    critical: number;
    high: number;
    generated_at: string;
  }> {
    // Buscar clientes que precisam de atenção
    const { data: clients } = await this.supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', this.tenantId)
      .or('flag_churn_risk.eq.true,flag_needs_attention.eq.true,flag_auto_vip.eq.true')
      .limit(limit);

    if (!clients) return { total: 0, critical: 0, high: 0, generated_at: new Date().toISOString() };

    let critical = 0;
    let high = 0;

    for (const client of clients) {
      const insight = await this.getClientInsight(client.id);
      if (insight?.urgency === 'critical') critical++;
      if (insight?.urgency === 'high') high++;
    }

    return {
      total: clients.length,
      critical,
      high,
      generated_at: new Date().toISOString(),
    };
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FACTORY
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function createSalesAssistant(supabase: SupabaseClient, tenantId: string): SalesAssistant {
  return new SalesAssistant(supabase, tenantId);
}
