/**
 * Product Intelligence — Motor de inteligência de produto.
 *
 * Analisa tendências de venda, afinidade entre produtos
 * (market basket analysis), preferências de grade dos clientes
 * e velocidade de venda.
 *
 * Schema: product_trends, product_affinity, client_grade_preferences, products, orders
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ProductTrend {
  product_id: string | null;
  product_name: string;
  category: string | null;
  period_type: string;
  period_start: string;
  period_end: string;
  total_quantity: number;
  total_revenue: number;
  unique_buyers: number;
  avg_ticket: number;
  qty_growth_pct: number | null;
  revenue_growth_pct: number | null;
  trend_direction: 'growing' | 'stable' | 'declining';
  velocity_score: number;
}

export interface ProductAffinityPair {
  product_a_id: string;
  product_b_id: string;
  product_a_name: string;
  product_b_name: string;
  co_purchase_count: number;
  confidence_a_to_b: number;
  confidence_b_to_a: number;
  lift: number;
  affinity_score: number;
}

export interface ClientGradeProfile {
  client_id: string;
  preferred_categories: string[];
  avg_price_paid: number;
  min_price_paid: number;
  max_price_paid: number;
  price_sensitivity: 'low' | 'medium' | 'high';
  top_products: Array<{ product_id: string; name: string; qty: number }>;
  reorder_rate: number;
  variety_score: number;
}

export interface ProductIntelligenceReport {
  trends: {
    growing: ProductTrend[];
    declining: ProductTrend[];
    top_sellers: ProductTrend[];
  };
  affinity: {
    top_pairs: ProductAffinityPair[];
    total_pairs: number;
  };
  alerts: Array<{
    type: 'opportunity' | 'warning' | 'info';
    title: string;
    message: string;
    action: string;
  }>;
  calculated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ENGINE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class ProductIntelligence {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /* ════════════════════════════════════════════════════════════
     ANÁLISE COMPLETA
     ════════════════════════════════════════════════════════════ */

  async analyze(): Promise<ProductIntelligenceReport> {
    console.log('📊 Product Intelligence: Iniciando...');

    // 1. Buscar dados
    const orders = await this.fetchOrders();
    const products = await this.fetchProducts();

    console.log(`📦 ${orders.length} pedidos, ${products.length} produtos`);

    if (orders.length === 0) {
      return {
        trends: { growing: [], declining: [], top_sellers: [] },
        affinity: { top_pairs: [], total_pairs: 0 },
        alerts: [],
        calculated_at: new Date().toISOString(),
      };
    }

    // 2. Calcular tendências mensais
    const trends = this.calculateTrends(orders, products);
    await this.persistTrends(trends);

    // 3. Calcular afinidade
    const affinityPairs = this.calculateAffinity(orders);
    await this.persistAffinity(affinityPairs);

    // 4. Calcular preferências de grade dos clientes
    const gradeProfiles = this.calculateGradeProfiles(orders, products);
    await this.persistGradeProfiles(gradeProfiles);

    // 5. Gerar alertas
    const alerts = this.generateAlerts(trends, affinityPairs, products);

    // Separar trends
    const currentMonth = trends.filter(t => t.period_type === 'monthly')
      .sort((a, b) => b.period_start.localeCompare(a.period_start));

    const latest = currentMonth.slice(0, 20);
    const growing = latest.filter(t => t.trend_direction === 'growing')
      .sort((a, b) => (b.qty_growth_pct || 0) - (a.qty_growth_pct || 0));
    const declining = latest.filter(t => t.trend_direction === 'declining')
      .sort((a, b) => (a.qty_growth_pct || 0) - (b.qty_growth_pct || 0));
    const topSellers = latest.sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10);

    const report: ProductIntelligenceReport = {
      trends: {
        growing: growing.slice(0, 10),
        declining: declining.slice(0, 10),
        top_sellers: topSellers,
      },
      affinity: {
        top_pairs: affinityPairs.sort((a, b) => b.affinity_score - a.affinity_score).slice(0, 15),
        total_pairs: affinityPairs.length,
      },
      alerts,
      calculated_at: new Date().toISOString(),
    };

    console.log('✅ Product Intelligence: Concluído!');
    return report;
  }

  /* ════════════════════════════════════════════════════════════
     TENDÊNCIAS DE PRODUTO (MENSAL)
     ════════════════════════════════════════════════════════════ */

  private calculateTrends(orders: OrderRecord[], products: ProductRecord[]): ProductTrend[] {
    // Agrupar vendas por produto + mês
    const productMonthMap = new Map<string, Map<string, {
      qty: number; revenue: number; buyers: Set<string>;
    }>>();

    for (const order of orders) {
      if (!order.items || !Array.isArray(order.items)) continue;
      const month = order.created_at.substring(0, 7); // YYYY-MM

      for (const item of order.items) {
        const productKey = item.product_name || 'Unknown';
        if (!productMonthMap.has(productKey)) {
          productMonthMap.set(productKey, new Map());
        }
        const monthMap = productMonthMap.get(productKey)!;
        if (!monthMap.has(month)) {
          monthMap.set(month, { qty: 0, revenue: 0, buyers: new Set() });
        }
        const data = monthMap.get(month)!;
        data.qty += item.quantity || 1;
        data.revenue += item.total || 0;
        if (order.client_id) data.buyers.add(order.client_id);
      }
    }

    const trends: ProductTrend[] = [];
    const productLookup = new Map(products.map(p => [p.name, p]));

    for (const [productName, monthMap] of productMonthMap) {
      const months = Array.from(monthMap.keys()).sort();
      if (months.length === 0) continue;

      for (let i = 0; i < months.length; i++) {
        const month = months[i];
        const data = monthMap.get(month)!;
        const prevMonth = months[i - 1];
        const prevData = prevMonth ? monthMap.get(prevMonth) : null;

        let qtyGrowth: number | null = null;
        let revenueGrowth: number | null = null;
        let direction: 'growing' | 'stable' | 'declining' = 'stable';

        if (prevData && prevData.qty > 0) {
          qtyGrowth = parseFloat(
            (((data.qty - prevData.qty) / prevData.qty) * 100).toFixed(1)
          );
          revenueGrowth = prevData.revenue > 0
            ? parseFloat((((data.revenue - prevData.revenue) / prevData.revenue) * 100).toFixed(1))
            : null;
          if (qtyGrowth > 10) direction = 'growing';
          else if (qtyGrowth < -10) direction = 'declining';
        }

        // Velocity score: weighted by recency, volume, and growth
        const monthsAgo = months.length - 1 - i;
        const recencyWeight = Math.max(0, 1 - monthsAgo * 0.2);
        const volumeWeight = Math.min(1, data.qty / 20);
        const growthWeight = qtyGrowth !== null ? Math.max(0, Math.min(1, (qtyGrowth + 50) / 100)) : 0.5;
        const velocityScore = parseFloat(
          ((recencyWeight * 40 + volumeWeight * 30 + growthWeight * 30)).toFixed(1)
        );

        const product = productLookup.get(productName);
        const periodStart = `${month}-01`;
        const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
        const periodEnd = endDate.toISOString().split('T')[0];

        trends.push({
          product_id: product?.id || null,
          product_name: productName,
          category: product?.category || null,
          period_type: 'monthly',
          period_start: periodStart,
          period_end: periodEnd,
          total_quantity: data.qty,
          total_revenue: parseFloat(data.revenue.toFixed(2)),
          unique_buyers: data.buyers.size,
          avg_ticket: data.qty > 0 ? parseFloat((data.revenue / data.qty).toFixed(2)) : 0,
          qty_growth_pct: qtyGrowth,
          revenue_growth_pct: revenueGrowth,
          trend_direction: direction,
          velocity_score: velocityScore,
        });
      }
    }

    return trends;
  }

  /* ════════════════════════════════════════════════════════════
     AFINIDADE ENTRE PRODUTOS (Market Basket)
     ════════════════════════════════════════════════════════════ */

  private calculateAffinity(orders: OrderRecord[]): ProductAffinityPair[] {
    // Count how often each product appears in orders
    const productFreq = new Map<string, number>();
    const pairFreq = new Map<string, number>();
    const productNames = new Map<string, string>();
    const productIds = new Map<string, string>();
    let totalOrders = 0;

    for (const order of orders) {
      if (!order.items || !Array.isArray(order.items) || order.items.length < 2) continue;
      totalOrders++;

      const uniqueProducts = [...new Set(
        order.items
          .map(i => i.product_name || '')
          .filter(n => n.length > 0)
      )];

      for (const product of uniqueProducts) {
        productFreq.set(product, (productFreq.get(product) || 0) + 1);
        if (!productNames.has(product)) {
          productNames.set(product, product);
          const item = order.items.find(i => i.product_name === product);
          if (item?.product_id) productIds.set(product, item.product_id);
        }
      }

      // Generate pairs
      for (let i = 0; i < uniqueProducts.length; i++) {
        for (let j = i + 1; j < uniqueProducts.length; j++) {
          const pairKey = [uniqueProducts[i], uniqueProducts[j]].sort().join('|||');
          pairFreq.set(pairKey, (pairFreq.get(pairKey) || 0) + 1);
        }
      }
    }

    if (totalOrders === 0) return [];

    // Build affinity pairs
    const pairs: ProductAffinityPair[] = [];

    for (const [pairKey, count] of pairFreq) {
      if (count < 2) continue; // Minimum co-occurrence

      const [nameA, nameB] = pairKey.split('|||');
      const freqA = productFreq.get(nameA) || 1;
      const freqB = productFreq.get(nameB) || 1;

      const support = count / totalOrders;
      const confidenceAtoB = count / freqA;
      const confidenceBtoA = count / freqB;
      const expectedSupport = (freqA / totalOrders) * (freqB / totalOrders);
      const lift = expectedSupport > 0 ? support / expectedSupport : 0;

      // Affinity score: weighted combination
      const affinityScore = parseFloat(
        (Math.min(100,
          confidenceAtoB * 30 +
          confidenceBtoA * 30 +
          Math.min(lift, 5) * 8 +
          Math.min(count, 20) * 1
        )).toFixed(1)
      );

      pairs.push({
        product_a_id: productIds.get(nameA) || '',
        product_b_id: productIds.get(nameB) || '',
        product_a_name: nameA,
        product_b_name: nameB,
        co_purchase_count: count,
        confidence_a_to_b: parseFloat(confidenceAtoB.toFixed(4)),
        confidence_b_to_a: parseFloat(confidenceBtoA.toFixed(4)),
        lift: parseFloat(lift.toFixed(4)),
        affinity_score: affinityScore,
      });
    }

    return pairs.sort((a, b) => b.affinity_score - a.affinity_score);
  }

  /* ════════════════════════════════════════════════════════════
     PREFERÊNCIAS DE GRADE DOS CLIENTES
     ════════════════════════════════════════════════════════════ */

  private calculateGradeProfiles(
    orders: OrderRecord[],
    products: ProductRecord[]
  ): ClientGradeProfile[] {
    const clientMap = new Map<string, {
      categories: Map<string, number>;
      products: Map<string, { name: string; qty: number }>;
      prices: number[];
      productSet: Set<string>;
      totalOrders: number;
      repeatProducts: number;
    }>();

    const productLookup = new Map(products.map(p => [p.name, p]));

    for (const order of orders) {
      if (!order.client_id || !order.items) continue;

      if (!clientMap.has(order.client_id)) {
        clientMap.set(order.client_id, {
          categories: new Map(),
          products: new Map(),
          prices: [],
          productSet: new Set(),
          totalOrders: 0,
          repeatProducts: 0,
        });
      }

      const data = clientMap.get(order.client_id)!;
      data.totalOrders++;

      for (const item of order.items) {
        const name = item.product_name || 'Unknown';
        const product = productLookup.get(name);
        const category = product?.category || 'Outros';
        const price = item.unit_price || (item.total ? item.total / (item.quantity || 1) : 0);

        data.categories.set(category, (data.categories.get(category) || 0) + (item.quantity || 1));

        const prev = data.products.get(name);
        if (prev) {
          prev.qty += item.quantity || 1;
          data.repeatProducts++;
        } else {
          data.products.set(name, { name, qty: item.quantity || 1 });
        }

        if (price > 0) data.prices.push(price);
        data.productSet.add(name);
      }
    }

    const profiles: ClientGradeProfile[] = [];

    for (const [clientId, data] of clientMap) {
      const sortedCategories = Array.from(data.categories.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat);

      const topProducts = Array.from(data.products.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map(p => ({
          product_id: productLookup.get(p.name)?.id || '',
          name: p.name,
          qty: p.qty,
        }));

      const avgPrice = data.prices.length > 0
        ? data.prices.reduce((s, p) => s + p, 0) / data.prices.length
        : 0;
      const minPrice = data.prices.length > 0 ? Math.min(...data.prices) : 0;
      const maxPrice = data.prices.length > 0 ? Math.max(...data.prices) : 0;

      // Price sensitivity: se compra muito com preço baixo = high sensitivity
      const priceRange = maxPrice - minPrice;
      let priceSensitivity: 'low' | 'medium' | 'high' = 'medium';
      if (avgPrice > 0) {
        const variationCoeff = priceRange / avgPrice;
        if (variationCoeff > 0.6) priceSensitivity = 'high';
        else if (variationCoeff < 0.3) priceSensitivity = 'low';
      }

      // Reorder rate
      const totalItems = Array.from(data.products.values()).reduce((s, p) => s + p.qty, 0);
      const reorderRate = totalItems > 0
        ? parseFloat(((data.repeatProducts / totalItems) * 100).toFixed(1))
        : 0;

      // Variety score (0-100): quanto mais produtos diferentes, maior
      const uniqueProducts = data.productSet.size;
      const varietyScore = parseFloat(
        Math.min(100, uniqueProducts * 15).toFixed(1)
      );

      profiles.push({
        client_id: clientId,
        preferred_categories: sortedCategories.slice(0, 5),
        avg_price_paid: parseFloat(avgPrice.toFixed(2)),
        min_price_paid: parseFloat(minPrice.toFixed(2)),
        max_price_paid: parseFloat(maxPrice.toFixed(2)),
        price_sensitivity: priceSensitivity,
        top_products: topProducts,
        reorder_rate: reorderRate,
        variety_score: varietyScore,
      });
    }

    return profiles;
  }

  /* ════════════════════════════════════════════════════════════
     ALERTAS DE PRODUTO
     ════════════════════════════════════════════════════════════ */

  private generateAlerts(
    trends: ProductTrend[],
    affinityPairs: ProductAffinityPair[],
    products: ProductRecord[]
  ) {
    const alerts: ProductIntelligenceReport['alerts'] = [];
    const recentTrends = trends.filter(t => {
      const d = new Date(t.period_start);
      const monthsAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 2;
    });

    // Produtos em crescimento
    const growingProducts = recentTrends
      .filter(t => t.trend_direction === 'growing' && (t.qty_growth_pct || 0) > 30)
      .slice(0, 3);

    if (growingProducts.length > 0) {
      alerts.push({
        type: 'opportunity',
        title: '📈 Produtos em Alta',
        message: `${growingProducts.map(p => p.product_name).join(', ')} estão com crescimento acima de 30%`,
        action: 'Considere aumentar estoque e criar campanhas focadas',
      });
    }

    // Produtos em queda
    const decliningProducts = recentTrends
      .filter(t => t.trend_direction === 'declining' && (t.qty_growth_pct || 0) < -30)
      .slice(0, 3);

    if (decliningProducts.length > 0) {
      alerts.push({
        type: 'warning',
        title: '📉 Produtos em Queda',
        message: `${decliningProducts.map(p => p.product_name).join(', ')} tiveram queda acima de 30%`,
        action: 'Avalie promoções ou revise posicionamento',
      });
    }

    // Estoque baixo em produtos de alta velocidade
    const lowStockHigh = products.filter(p => p.stock <= 5 && p.stock > 0);
    if (lowStockHigh.length > 0) {
      alerts.push({
        type: 'warning',
        title: '⚠️ Estoque Baixo',
        message: `${lowStockHigh.length} produtos com estoque ≤ 5 unidades`,
        action: 'Reabastecer para evitar perda de vendas',
      });
    }

    // Oportunidade de cross-sell
    if (affinityPairs.length > 0) {
      const topPair = affinityPairs[0];
      alerts.push({
        type: 'opportunity',
        title: '🤝 Oportunidade de Cross-Sell',
        message: `"${topPair.product_a_name}" e "${topPair.product_b_name}" são comprados juntos ${topPair.co_purchase_count}x`,
        action: 'Crie um kit ou sugestão automática no chat',
      });
    }

    return alerts;
  }

  /* ════════════════════════════════════════════════════════════
     DATA FETCHING
     ════════════════════════════════════════════════════════════ */

  private async fetchOrders(): Promise<OrderRecord[]> {
    const allOrders: OrderRecord[] = [];
    let from = 0;

    while (true) {
      const { data } = await this.supabase
        .from('orders')
        .select('id, client_id, items, total, created_at')
        .eq('tenant_id', this.tenantId)
        .order('created_at', { ascending: false })
        .range(from, from + 999);

      if (!data || data.length === 0) break;

      for (const o of data) {
        allOrders.push({
          id: o.id,
          client_id: o.client_id,
          items: o.items || [],
          total: Number(o.total) || 0,
          created_at: o.created_at,
        });
      }

      if (data.length < 1000) break;
      from += 1000;
    }

    return allOrders;
  }

  private async fetchProducts(): Promise<ProductRecord[]> {
    const allProducts: ProductRecord[] = [];
    let from = 0;

    while (true) {
      const { data } = await this.supabase
        .from('products')
        .select('id, name, category, price, stock, is_active')
        .eq('tenant_id', this.tenantId)
        .range(from, from + 999);

      if (!data || data.length === 0) break;

      for (const p of data) {
        allProducts.push({
          id: p.id,
          name: p.name,
          category: p.category,
          price: Number(p.price) || 0,
          stock: p.stock || 0,
          is_active: p.is_active,
        });
      }

      if (data.length < 1000) break;
      from += 1000;
    }

    return allProducts;
  }

  /* ════════════════════════════════════════════════════════════
     PERSISTÊNCIA
     ════════════════════════════════════════════════════════════ */

  private async persistTrends(trends: ProductTrend[]): Promise<void> {
    // Delete old trends for this tenant, keep last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    await this.supabase
      .from('product_trends')
      .delete()
      .eq('tenant_id', this.tenantId)
      .lt('period_start', sixMonthsAgo.toISOString().split('T')[0]);

    // Insert in batches
    for (let i = 0; i < trends.length; i += 50) {
      const batch = trends.slice(i, i + 50).map(t => ({
        tenant_id: this.tenantId,
        product_id: t.product_id,
        product_name: t.product_name,
        category: t.category,
        period_type: t.period_type,
        period_start: t.period_start,
        period_end: t.period_end,
        total_quantity: t.total_quantity,
        total_revenue: t.total_revenue,
        unique_buyers: t.unique_buyers,
        avg_ticket: t.avg_ticket,
        qty_growth_pct: t.qty_growth_pct,
        revenue_growth_pct: t.revenue_growth_pct,
        trend_direction: t.trend_direction,
        velocity_score: t.velocity_score,
        calculated_at: new Date().toISOString(),
      }));

      await this.supabase.from('product_trends').insert(batch);
    }
  }

  private async persistAffinity(pairs: ProductAffinityPair[]): Promise<void> {
    // Clear old data
    await this.supabase
      .from('product_affinity')
      .delete()
      .eq('tenant_id', this.tenantId);

    // Insert top 100 pairs
    const topPairs = pairs.slice(0, 100);
    for (let i = 0; i < topPairs.length; i += 50) {
      const batch = topPairs.slice(i, i + 50).map(p => ({
        tenant_id: this.tenantId,
        product_a_id: p.product_a_id || null,
        product_b_id: p.product_b_id || null,
        product_a_name: p.product_a_name,
        product_b_name: p.product_b_name,
        co_purchase_count: p.co_purchase_count,
        confidence_a_to_b: p.confidence_a_to_b,
        confidence_b_to_a: p.confidence_b_to_a,
        lift: p.lift,
        affinity_score: p.affinity_score,
        calculated_at: new Date().toISOString(),
      }));

      await this.supabase.from('product_affinity').insert(batch);
    }
  }

  private async persistGradeProfiles(profiles: ClientGradeProfile[]): Promise<void> {
    for (let i = 0; i < profiles.length; i += 50) {
      const batch = profiles.slice(i, i + 50).map(p => ({
        tenant_id: this.tenantId,
        client_id: p.client_id,
        preferred_categories: p.preferred_categories,
        avg_price_paid: p.avg_price_paid,
        min_price_paid: p.min_price_paid,
        max_price_paid: p.max_price_paid,
        price_sensitivity: p.price_sensitivity,
        top_products: p.top_products,
        reorder_rate: p.reorder_rate,
        variety_score: p.variety_score,
        calculated_at: new Date().toISOString(),
      }));

      await this.supabase
        .from('client_grade_preferences')
        .upsert(batch, { onConflict: 'tenant_id,client_id' });

      // Update client table
      for (const p of profiles.slice(i, i + 50)) {
        await this.supabase
          .from('clients')
          .update({
            variety_score: p.variety_score,
            price_sensitivity: p.price_sensitivity,
            reorder_rate: p.reorder_rate,
            preferred_category: p.preferred_categories[0] || null,
          })
          .eq('id', p.client_id);
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
     CONSULTAS RÁPIDAS (para UI)
     ════════════════════════════════════════════════════════════ */

  /** Top produtos em tendência */
  async getTrends(limit = 20): Promise<ProductTrend[]> {
    const { data } = await this.supabase
      .from('product_trends')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('period_type', 'monthly')
      .order('period_start', { ascending: false })
      .limit(limit);

    if (!data) return [];
    return data.map(d => ({
      product_id: d.product_id,
      product_name: d.product_name,
      category: d.category,
      period_type: d.period_type,
      period_start: d.period_start,
      period_end: d.period_end,
      total_quantity: d.total_quantity,
      total_revenue: Number(d.total_revenue) || 0,
      unique_buyers: d.unique_buyers,
      avg_ticket: Number(d.avg_ticket) || 0,
      qty_growth_pct: d.qty_growth_pct,
      revenue_growth_pct: d.revenue_growth_pct,
      trend_direction: d.trend_direction,
      velocity_score: Number(d.velocity_score) || 0,
    }));
  }

  /** Top pares de afinidade */
  async getAffinityPairs(limit = 10): Promise<ProductAffinityPair[]> {
    const { data } = await this.supabase
      .from('product_affinity')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .order('affinity_score', { ascending: false })
      .limit(limit);

    if (!data) return [];
    return data.map(d => ({
      product_a_id: d.product_a_id,
      product_b_id: d.product_b_id,
      product_a_name: d.product_a_name,
      product_b_name: d.product_b_name,
      co_purchase_count: d.co_purchase_count,
      confidence_a_to_b: Number(d.confidence_a_to_b) || 0,
      confidence_b_to_a: Number(d.confidence_b_to_a) || 0,
      lift: Number(d.lift) || 0,
      affinity_score: Number(d.affinity_score) || 0,
    }));
  }

  /** Perfil de grade de um cliente */
  async getClientProfile(clientId: string): Promise<ClientGradeProfile | null> {
    const { data } = await this.supabase
      .from('client_grade_preferences')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .single();

    if (!data) return null;
    return {
      client_id: data.client_id,
      preferred_categories: data.preferred_categories || [],
      avg_price_paid: Number(data.avg_price_paid) || 0,
      min_price_paid: Number(data.min_price_paid) || 0,
      max_price_paid: Number(data.max_price_paid) || 0,
      price_sensitivity: data.price_sensitivity || 'medium',
      top_products: data.top_products || [],
      reorder_rate: Number(data.reorder_rate) || 0,
      variety_score: Number(data.variety_score) || 0,
    };
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS INTERNOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface OrderRecord {
  id: string;
  client_id: string | null;
  items: Array<{
    product_id?: string;
    product_name?: string;
    quantity?: number;
    unit_price?: number;
    total?: number;
  }>;
  total: number;
  created_at: string;
}

interface ProductRecord {
  id: string;
  name: string;
  category: string | null;
  price: number;
  stock: number;
  is_active: boolean;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FACTORY
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function createProductIntelligence(supabase: SupabaseClient, tenantId: string): ProductIntelligence {
  return new ProductIntelligence(supabase, tenantId);
}
