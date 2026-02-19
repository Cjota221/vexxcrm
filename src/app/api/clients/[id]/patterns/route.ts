import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/clients/[id]/patterns
 *
 * Retorna padrões de comportamento de compra de um cliente.
 * Calcula em tempo real com base nos pedidos históricos.
 *
 * Resposta:
 *  - dia_ouro: { dia_semana, label, total_pedidos, total_gasto }
 *  - hora_ouro: { faixa_horario, label, total_pedidos }
 *  - logistica: { frete_medio, transportadora_mais_usada, total_fretes }
 *  - inventario: { numeracoes: string[], categorias: string[], top_produtos: ... }
 *  - insights_anne: string[]  — observações geradas via análise de dados
 *  - ltv: number
 *  - ticket_medio: number
 *  - total_pedidos: number
 *  - dias_desde_ultima_compra: number | null
 *  - ciclo_recompra_medio: number | null  — dias médios entre compras
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getTenantFromRequest(request);
    const tenantId = auth.tenantId;
    const { id: clientId } = await params;
    const supabase = createServerSupabaseClient();

    // ── Buscar pedidos do cliente (com itens via JOIN) ────────
    const { data: ordersRaw, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total,
        shipping,
        created_at,
        status,
        metadata,
        order_items (
          product_name,
          product_sku,
          quantity,
          unit_price,
          total_price,
          metadata
        )
      `)
      .eq('tenant_id', auth.tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (ordersError) throw ordersError;

    // Normalizar: order_items → items para compatibilidade do código abaixo
    type OrderNorm = {
      id: string;
      total: number;
      shipping: number;
      created_at: string;
      status: string;
      metadata: unknown;
      items: Array<{
        product_name: unknown;
        nome: unknown;
        quantity: unknown;
        unit_price: unknown;
        total: unknown;
        variacao: unknown;
        category: unknown;
      }>;
    };

    const orders: OrderNorm[] = (ordersRaw ?? []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      total: o.total as number,
      shipping: o.shipping as number,
      created_at: o.created_at as string,
      status: o.status as string,
      metadata: o.metadata,
      items: Array.isArray(o.order_items)
        ? (o.order_items as Array<Record<string, unknown>>).map(item => ({
            product_name: item.product_name,
            nome: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total_price,
            variacao: (item.metadata as Record<string, unknown>)?.variacao ?? '',
            category: (item.metadata as Record<string, unknown>)?.category ?? '',
          }))
        : [],
    }));

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        dia_ouro: null,
        hora_ouro: null,
        logistica: null,
        inventario: null,
        insights_anne: ['Sem pedidos suficientes para análise.'],
        ltv: 0, ticket_medio: 0, total_pedidos: 0,
        dias_desde_ultima_compra: null,
        ciclo_recompra_medio: null,
      });
    }

    // ── Dia de Ouro ───────────────────────────────────────────
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaCount: Record<number, { pedidos: number; gasto: number }> = {};

    for (const o of orders) {
      const d = new Date(o.created_at).getDay();
      if (!diaCount[d]) diaCount[d] = { pedidos: 0, gasto: 0 };
      diaCount[d].pedidos++;
      diaCount[d].gasto += Number(o.total) || 0;
    }

    const diaOuroEntry = Object.entries(diaCount).sort((a, b) => b[1].pedidos - a[1].pedidos)[0];
    const diaOuro = diaOuroEntry
      ? {
          dia_semana: parseInt(diaOuroEntry[0]),
          label: DIAS[parseInt(diaOuroEntry[0])],
          total_pedidos: diaOuroEntry[1].pedidos,
          total_gasto: Math.round(diaOuroEntry[1].gasto * 100) / 100,
        }
      : null;

    // ── Hora de Ouro ─────────────────────────────────────────
    const FAIXAS = [
      { label: 'Madrugada (0h–6h)', min: 0, max: 6 },
      { label: 'Manhã (6h–12h)', min: 6, max: 12 },
      { label: 'Tarde (12h–18h)', min: 12, max: 18 },
      { label: 'Noite (18h–24h)', min: 18, max: 24 },
    ];

    const horaCount: Record<string, number> = {};
    for (const o of orders) {
      const hora = new Date(o.created_at).getHours();
      const faixa = FAIXAS.find(f => hora >= f.min && hora < f.max)?.label || 'Tarde (12h–18h)';
      horaCount[faixa] = (horaCount[faixa] || 0) + 1;
    }

    const horaOuroEntry = Object.entries(horaCount).sort((a, b) => b[1] - a[1])[0];
    const horaOuro = horaOuroEntry
      ? { faixa_horario: horaOuroEntry[0], label: horaOuroEntry[0], total_pedidos: horaOuroEntry[1] }
      : null;

    // ── Logística ─────────────────────────────────────────────
    const fretes: Array<{ valor: number; transportadora: string }> = orders
      .filter(o => Number(o.shipping) > 0)
      .map(o => ({
        valor: Number(o.shipping),
        transportadora: (() => {
          try {
            const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {});
            return String(
              (meta as Record<string, unknown>).transportadora
              || (meta as Record<string, unknown>).carrier
              || (meta as Record<string, unknown>).frete_nome
              || 'Correios'
            );
          } catch { return 'Correios'; }
        })(),
      }));

    const freteMedio = fretes.length > 0
      ? Math.round((fretes.reduce((s, f) => s + f.valor, 0) / fretes.length) * 100) / 100
      : 0;

    const transportadoraCount: Record<string, number> = {};
    for (const f of fretes) {
      transportadoraCount[f.transportadora] = (transportadoraCount[f.transportadora] ?? 0) + 1;
    }
    const transportadoraMaisUsada = Object.entries(transportadoraCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const logistica = {
      frete_medio: freteMedio,
      transportadora_mais_usada: transportadoraMaisUsada,
      total_fretes: fretes.length,
    };

    // ── Inventário (produtos, categorias, numerações) ─────────
    const produtoCount: Record<string, { nome: string; qtd: number; valor: number; categoria?: string; variacao?: string }> = {};

    for (const o of orders) {
      let itens: Array<Record<string, unknown>> = [];
      try {
        if (Array.isArray(o.items)) itens = o.items;
        else if (typeof o.items === 'string') itens = JSON.parse(o.items);
      } catch { /* silent */ }

      // Tentar também no metadata
      if (!itens.length) {
        try {
          const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {});
          const metaItens = (meta as Record<string, unknown>).itens;
          if (Array.isArray(metaItens)) itens = metaItens;
        } catch { /* silent */ }
      }

      for (const item of itens) {
        const nome = String(item.product_name || item.nome || item.name || '');
        if (!nome) continue;
        if (!produtoCount[nome]) {
          produtoCount[nome] = {
            nome,
            qtd: 0,
            valor: 0,
            categoria: String(item.category || item.categoria || ''),
            variacao: String(item.variacao || item.variation || ''),
          };
        }
        produtoCount[nome].qtd += Number(item.quantity || item.quantidade || 1);
        produtoCount[nome].valor += Number(item.total || item.unit_price || item.valor || 0) * Number(item.quantity || item.quantidade || 1);
      }
    }

    const topProdutos = Object.values(produtoCount)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 8)
      .map(p => ({
        nome: p.nome,
        quantidade: p.qtd,
        valor_total: Math.round(p.valor * 100) / 100,
        categoria: p.categoria || '',
        variacao: p.variacao || '',
      }));

    // Extrair numerações (padrão: números 33-48 indicam calçados)
    const NUMERACAO_REGEX = /\b(3[3-9]|4[0-8])\b/;
    const numeracoes = Array.from(new Set(
      topProdutos
        .map(p => {
          const match = (p.variacao || p.nome).match(NUMERACAO_REGEX);
          return match?.[0] || null;
        })
        .filter(Boolean)
    )) as string[];

    // Categorias mais compradas
    const categoriasSet: Record<string, number> = {};
    for (const p of Object.values(produtoCount)) {
      if (p.categoria) categoriasSet[p.categoria] = (categoriasSet[p.categoria] || 0) + p.qtd;
    }
    const categorias = Object.entries(categoriasSet)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);

    const inventario = {
      numeracoes,
      categorias,
      top_produtos: topProdutos,
    };

    // ── Métricas gerais ───────────────────────────────────────
    // LTV: apenas pedidos ativos (excluindo cancelled/refunded)
    const ACTIVE_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered', 'pending'];
    const PAID_STATUSES   = ['confirmed', 'delivered'];  // pagos/concluídos
    const TRANSIT_STATUSES = ['shipped'];                 // em trânsito

    const activeOrders   = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    const paidOrders     = orders.filter(o => PAID_STATUSES.includes(o.status));
    const transitOrders  = orders.filter(o => TRANSIT_STATUSES.includes(o.status));
    const cancelledOrders = orders.filter(o => ['cancelled', 'refunded'].includes(o.status));

    const ltv         = activeOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const ltvPaid     = paidOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const ltvTransit  = transitOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const ltvCancelled = cancelledOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const ticketMedio = activeOrders.length > 0 ? ltv / activeOrders.length : 0;

    const ultimaCompra = orders.at(-1)?.created_at;
    const diasDesdeUltimaCompra = ultimaCompra
      ? Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Ciclo de recompra (média de dias entre pedidos consecutivos)
    let cicloRecompra: number | null = null;
    if (orders.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < orders.length; i++) {
        const prev = new Date(orders[i - 1].created_at).getTime();
        const curr = new Date(orders[i].created_at).getTime();
        diffs.push((curr - prev) / (1000 * 60 * 60 * 24));
      }
      cicloRecompra = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
    }

    // ── Insights Anne ─────────────────────────────────────────
    const insights: string[] = [];

    if (diaOuro && diaOuro.total_pedidos >= 2) {
      insights.push(`Costuma comprar às ${diaOuro.label}s — ${diaOuro.total_pedidos} pedidos neste dia.`);
    }

    if (horaOuro && horaOuro.total_pedidos >= 2) {
      insights.push(`Horário preferido: ${horaOuro.label}.`);
    }

    if (cicloRecompra && cicloRecompra > 0) {
      const proximo = diasDesdeUltimaCompra !== null
        ? cicloRecompra - diasDesdeUltimaCompra
        : null;

      if (proximo !== null && proximo <= 7 && proximo >= 0) {
        insights.push(`⚡ Ciclo de recompra médio: ${cicloRecompra} dias. Próxima compra esperada em ${proximo} dia(s) — contatar agora!`);
      } else if (proximo !== null && proximo < 0) {
        insights.push(`⚠️ Ciclo de recompra médio: ${cicloRecompra} dias. Último pedido há ${diasDesdeUltimaCompra} dias — ${Math.abs(proximo)} dias em atraso.`);
      } else {
        insights.push(`Ciclo de recompra médio: ${cicloRecompra} dias.`);
      }
    }

    if (topProdutos.length > 0) {
      insights.push(`Produto mais comprado: ${topProdutos[0].nome} (${topProdutos[0].quantidade}x).`);
    }

    if (freteMedio > 0 && transportadoraMaisUsada) {
      insights.push(`Frete médio pago: R$ ${freteMedio.toFixed(2)} via ${transportadoraMaisUsada}.`);
    }

    if (ltv > 1000) {
      insights.push(`Cliente de alto valor: R$ ${ltv.toFixed(2)} de LTV acumulado em ${orders.length} pedido(s).`);
    }

    if (insights.length === 0) {
      insights.push('Dados insuficientes para gerar insights. Continue coletando histórico de compras.');
    }

    return NextResponse.json({
      dia_ouro: diaOuro,
      hora_ouro: horaOuro,
      logistica,
      inventario,
      insights_anne: insights,
      ltv: Math.round(ltv * 100) / 100,
      ticket_medio: Math.round(ticketMedio * 100) / 100,
      total_pedidos: activeOrders.length,
      dias_desde_ultima_compra: diasDesdeUltimaCompra,
      ciclo_recompra_medio: cicloRecompra,
      ltv_breakdown: {
        paid:      { count: paidOrders.length,     value: Math.round(ltvPaid * 100) / 100 },
        transit:   { count: transitOrders.length,  value: Math.round(ltvTransit * 100) / 100 },
        cancelled: { count: cancelledOrders.length, value: Math.round(ltvCancelled * 100) / 100 },
        total_all_orders: orders.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Patterns API]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
