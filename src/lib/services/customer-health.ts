/**
 * Customer Health Engine — Motor de análise comportamental de clientes.
 * 
 * Calcula automaticamente:
 * - Score de saúde (0-100)
 * - Classificação inteligente (VIP, Ativo, Oportunidade, Risco, Perdido)
 * - Métricas de frequência, ticket médio, LTV (somente pedidos PAGOS)
 * - Produtos preferidos e categorias
 * - Tendências de comportamento
 * - Recomendações acionáveis
 * - Log de inteligência (frase resumo humanizada)
 */

import type { 
  CustomerHealth, 
  HealthClassification, 
  TendenciaType, 
  ProdutoPreferido 
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Status que representam pedido efetivamente pago */
const PAID_STATUSES = new Set(['paid', 'pago', 'completed', 'concluido', 'delivered', 'shipped']);

/**
 * Calcula a saúde completa de um cliente.
 */
export async function calculateCustomerHealth(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string
): Promise<CustomerHealth> {
  // Buscar todos os pedidos do cliente (qualquer status, para histórico de frequência)
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  const pedidos = orders || [];
  const agora = new Date();

  // ═══════════════════════════════════════
  // MÉTRICAS BÁSICAS
  // ═══════════════════════════════════════
  const totalPedidos = pedidos.length;
  const primeiraCompra = pedidos.length > 0 ? pedidos[0].created_at : null;
  const ultimaCompra = pedidos.length > 0 ? pedidos[pedidos.length - 1].created_at : null;

  // Dias de inatividade
  const diasInatividade = ultimaCompra
    ? Math.floor((agora.getTime() - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Meses como cliente: apenas relevante se há pedidos; sem pedidos = 0
  const mesesComoCliente = primeiraCompra && totalPedidos > 0
    ? Math.max(1, Math.floor((agora.getTime() - new Date(primeiraCompra).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  // Frequência de compra por mês (0 se sem pedidos — tratado como lead em calculateScore)
  const mediaComprasMes = mesesComoCliente > 0 ? totalPedidos / mesesComoCliente : 0;

  // ═══════════════════════════════════════
  // LTV — somente pedidos com status PAGO
  // ═══════════════════════════════════════
  const pedidosPagos = pedidos.filter(o =>
    PAID_STATUSES.has(String(o.status ?? '').toLowerCase())
  );
  const valorTotalGasto = pedidosPagos.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const ticketMedio = pedidosPagos.length > 0 ? valorTotalGasto / pedidosPagos.length : 0;

  // Produtos preferidos (top 3)
  const productCount: Record<string, { nome: string; quantidade: number }> = {};
  const categoryCount: Record<string, number> = {};

  for (const order of pedidos) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const nome = item.product_name || item.nome || 'Produto';
      if (!productCount[nome]) {
        productCount[nome] = { nome, quantidade: 0 };
      }
      productCount[nome].quantidade += Number(item.quantity) || 1;

      // Categoria (se disponível no metadata)
      const meta = typeof order.metadata === 'object' ? order.metadata : {};
      if (meta && typeof meta === 'object') {
        const cat = (meta as Record<string, unknown>).categoria || (meta as Record<string, unknown>).category;
        if (cat && typeof cat === 'string') {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }
      }
    }
  }

  const produtosPreferidos: ProdutoPreferido[] = Object.values(productCount)
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3)
    .map(p => ({
      nome: p.nome,
      quantidade: p.quantidade,
      percentualCompras: totalPedidos > 0
        ? Math.round((p.quantidade / totalPedidos) * 100)
        : 0,
    }));

  const categoriasPreferidas = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat]) => cat);

  // ═══════════════════════════════════════
  // TENDÊNCIAS (últimos 3 vs anteriores 3 meses)
  // ═══════════════════════════════════════
  const tresMesesAtras = new Date();
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

  const pedidosUlt3m = pedidos.filter(o => new Date(o.created_at) >= tresMesesAtras);
  const pedidosAnt3m = pedidos.filter(o => {
    const d = new Date(o.created_at);
    return d >= seisMesesAtras && d < tresMesesAtras;
  });

  const valorUlt3m = pedidosUlt3m.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const valorAnt3m = pedidosAnt3m.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const ticketUlt3m = pedidosUlt3m.length > 0 ? valorUlt3m / pedidosUlt3m.length : 0;
  const ticketAnt3m = pedidosAnt3m.length > 0 ? valorAnt3m / pedidosAnt3m.length : 0;

  const crescimentoFrequencia: TendenciaType = 
    pedidosUlt3m.length > pedidosAnt3m.length * 1.15 ? 'aumentando' :
    pedidosUlt3m.length < pedidosAnt3m.length * 0.85 ? 'diminuindo' : 'estavel';

  const crescimentoTicket: TendenciaType = 
    ticketUlt3m > ticketAnt3m * 1.15 ? 'aumentando' :
    ticketUlt3m < ticketAnt3m * 0.85 ? 'diminuindo' : 'estavel';

  // ═══════════════════════════════════════
  // SCORE E CLASSIFICAÇÃO
  // ═══════════════════════════════════════
  const { score, nivel, razao, recomendacoes, logInteligencia } = calculateScore({
    totalPedidos,
    diasInatividade,
    mediaComprasMes,
    ticketMedio,
    valorTotalGasto,
    crescimentoFrequencia,
    crescimentoTicket,
    pedidosUlt3m: pedidosUlt3m.length,
  });

  return {
    clienteId: clientId,
    metricas: {
      diasInatividade,
      ultimaCompra,
      frequenciaCompra: {
        mediaComprasMes: Math.round(mediaComprasMes * 100) / 100,
        totalPedidos,
        primeiraCompra,
        mesesComoCliente,
      },
      comportamentoCompra: {
        ticketMedio: Math.round(ticketMedio * 100) / 100,
        valorTotalGasto: Math.round(valorTotalGasto * 100) / 100,
        produtosPreferidos,
        categoriasPreferidas,
      },
      tendencias: {
        crescimentoFrequencia,
        crescimentoTicket,
        ultimosTresMeses: {
          pedidos: pedidosUlt3m.length,
          valorTotal: Math.round(valorUlt3m * 100) / 100,
        },
      },
    },
    classificacao: {
      nivel,
      score,
      razao,
      recomendacoes,
      logInteligencia,
    },
    calculadoEm: new Date().toISOString(),
  };
}

/**
 * Algoritmo de classificação inteligente.
 *
 * Thresholds revisados (v2):
 *  VIP          ≥ 70  (antes 80 — muito restritivo)
 *  Ativo        ≥ 45  (antes 60)
 *  Oportunidade ≥ 25  (antes 40)
 *  Risco        ≥ 10  (antes 20)
 *  Perdido      <  10 (somente clientes MUITO inativos com histórico real)
 *
 *  Clientes sem nenhum pedido recebem tratamento especial:
 *  → classificados como "Oportunidade" (lead novo, nunca comprou)
 */
function calculateScore(params: {
  totalPedidos: number;
  diasInatividade: number;
  mediaComprasMes: number;
  ticketMedio: number;
  valorTotalGasto: number;
  crescimentoFrequencia: TendenciaType;
  crescimentoTicket: TendenciaType;
  pedidosUlt3m: number;
}): {
  score: number;
  nivel: HealthClassification;
  razao: string;
  recomendacoes: string[];
  logInteligencia: string;
} {
  const {
    totalPedidos,
    diasInatividade,
    mediaComprasMes,
    ticketMedio,
    valorTotalGasto,
    crescimentoFrequencia,
    crescimentoTicket,
    pedidosUlt3m,
  } = params;

  const recomendacoes: string[] = [];

  // ── Caso especial: cliente sem histórico de compras = lead novo ──
  if (totalPedidos === 0) {
    recomendacoes.push('Lead novo — iniciar abordagem de vendas');
    recomendacoes.push('Enviar mensagem de boas-vindas com oferta especial');
    recomendacoes.push('Apresentar os produtos mais populares da loja');
    return {
      score: 30,
      nivel: 'Oportunidade',
      razao: 'Lead novo — ainda não realizou nenhuma compra. Alto potencial de conversão.',
      recomendacoes,
      logInteligencia: 'Lead novo sem pedidos. Excelente momento para primeira abordagem.',
    };
  }

  let score = 0;

  // ── Componente 1: Recência (30 pontos) ──
  if (diasInatividade <= 7) score += 30;
  else if (diasInatividade <= 15) score += 25;
  else if (diasInatividade <= 30) score += 20;
  else if (diasInatividade <= 45) score += 14;
  else if (diasInatividade <= 60) score += 8;
  else if (diasInatividade <= 90) score += 4;
  else if (diasInatividade <= 180) score += 2;
  else score += 0;

  // ── Componente 2: Frequência (25 pontos) ──
  if (mediaComprasMes >= 3) score += 25;
  else if (mediaComprasMes >= 2) score += 20;
  else if (mediaComprasMes >= 1) score += 15;
  else if (mediaComprasMes >= 0.5) score += 10;
  else if (mediaComprasMes >= 0.25) score += 6;
  else if (mediaComprasMes > 0) score += 3;
  else score += 1;

  // ── Componente 3: Volume de pedidos (15 pontos) ──
  if (totalPedidos >= 20) score += 15;
  else if (totalPedidos >= 10) score += 12;
  else if (totalPedidos >= 5) score += 8;
  else if (totalPedidos >= 3) score += 5;
  else if (totalPedidos >= 1) score += 3;

  // ── Componente 4: Tendência (15 pontos) ──
  if (crescimentoFrequencia === 'aumentando') score += 8;
  else if (crescimentoFrequencia === 'estavel') score += 5;
  else score += 1;

  if (crescimentoTicket === 'aumentando') score += 7;
  else if (crescimentoTicket === 'estavel') score += 4;
  else score += 1;

  // ── Componente 5: Atividade recente (15 pontos) ──
  if (pedidosUlt3m >= 5) score += 15;
  else if (pedidosUlt3m >= 3) score += 12;
  else if (pedidosUlt3m >= 2) score += 8;
  else if (pedidosUlt3m >= 1) score += 5;

  // Limitar entre 0 e 100
  score = Math.min(100, Math.max(0, score));

  // ── Classificação com thresholds revisados ──
  let nivel: HealthClassification;
  let razao: string;

  if (score >= 70) {
    nivel = 'VIP';
    razao = `Cliente premium com score ${score}/100. Compra frequentemente (${mediaComprasMes.toFixed(1)}/mês) e está ativo.`;
    recomendacoes.push('Oferecer programa de fidelidade exclusivo');
    recomendacoes.push('Enviar lançamentos antes do público geral');
    recomendacoes.push('Desconto especial de aniversário');
    if (crescimentoTicket === 'aumentando') {
      recomendacoes.push('Upsell: ticket crescendo — apresentar produtos premium');
    }
  } else if (score >= 45) {
    nivel = 'Ativo';
    razao = `Cliente ativo com score ${score}/100. Frequência de ${mediaComprasMes.toFixed(1)} compras/mês.`;
    recomendacoes.push('Manter engajamento com promoções periódicas');
    recomendacoes.push('Enviar novidades e lançamentos');
    if (diasInatividade > 20) {
      recomendacoes.push(`Atenção: ${diasInatividade} dias sem comprar — enviar incentivo`);
    }
  } else if (score >= 25) {
    nivel = 'Oportunidade';
    razao = `Cliente com potencial (score ${score}/100). Ticket médio de R$ ${ticketMedio.toFixed(2)} mas frequência baixa.`;
    recomendacoes.push('Enviar cupom de desconto para incentivar nova compra');
    recomendacoes.push('Oferecer frete grátis na próxima compra');
    if (ticketMedio > 100) {
      recomendacoes.push('Alto ticket médio — vale investir em reativação personalizada');
    }
  } else if (score >= 10) {
    nivel = 'Risco';
    razao = `Cliente em risco (score ${score}/100). ${diasInatividade} dias sem comprar, frequência decrescente.`;
    recomendacoes.push('URGENTE: Enviar mensagem de reativação');
    recomendacoes.push('Cupom de desconto agressivo (15-20%)');
    recomendacoes.push('Perguntar se houve algum problema');
  } else {
    nivel = 'Perdido';
    razao = `Cliente provavelmente perdido (score ${score}/100). ${diasInatividade} dias sem qualquer compra.`;
    recomendacoes.push('Última tentativa: cupom especial de volta');
    recomendacoes.push('Pesquisa de satisfação para entender motivo');
    recomendacoes.push('Se sem resposta em 30 dias, arquivar contato');
  }

  // ── Log de Inteligência humanizado ──
  const diasStr = diasInatividade >= 999
    ? 'sem histórico de compra'
    : diasInatividade === 0
      ? 'comprou hoje'
      : diasInatividade === 1
        ? 'última compra ontem'
        : `última compra há ${diasInatividade} dia${diasInatividade > 1 ? 's' : ''}`;

  const ticketStr = ticketMedio > 0
    ? `, ticket médio de R$ ${ticketMedio.toFixed(2).replace('.', ',')}`
    : '';

  const ltvStr = valorTotalGasto > 0
    ? `, LTV total R$ ${valorTotalGasto.toFixed(2).replace('.', ',')}`
    : '';

  const freqStr = mediaComprasMes > 0
    ? `, frequência de ${mediaComprasMes.toFixed(1)} compra${mediaComprasMes > 1 ? 's' : ''}/mês`
    : '';

  const logInteligencia = `${nivel === 'VIP' ? 'Cliente fiel' : nivel === 'Ativo' ? 'Cliente ativo' : nivel === 'Oportunidade' ? 'Cliente com potencial' : nivel === 'Risco' ? 'Cliente em risco' : 'Cliente inativo'}, ${diasStr}${ticketStr}${ltvStr}${freqStr}.`;

  return { score, nivel, razao, recomendacoes, logInteligencia };
}

/**
 * Persiste os dados de health no cliente (via custom_fields).
 */
export async function saveCustomerHealth(
  supabase: SupabaseClient,
  clientId: string,
  health: CustomerHealth
): Promise<void> {
  // Buscar custom_fields atual
  const { data: client } = await supabase
    .from('clients')
    .select('custom_fields, status')
    .eq('id', clientId)
    .single();

  const currentFields = (client?.custom_fields && typeof client.custom_fields === 'object')
    ? client.custom_fields as Record<string, unknown>
    : {};

  // Mesclar com health data
  const updatedFields = {
    ...currentFields,
    health_score: health.classificacao.score,
    health_classification: health.classificacao.nivel,
    health_data: health,
  };

  // Mapear classificação para status do CRM
  const statusMap: Record<HealthClassification, string> = {
    'VIP': 'vip',
    'Ativo': 'ativo',
    'Oportunidade': 'ativo',
    'Risco': 'risco',
    'Perdido': 'inativo',
  };

  await supabase
    .from('clients')
    .update({
      custom_fields: updatedFields,
      status: statusMap[health.classificacao.nivel],
      ltv: health.metricas.comportamentoCompra.valorTotalGasto,
      avg_ticket: health.metricas.comportamentoCompra.ticketMedio,
      total_orders: health.metricas.frequenciaCompra.totalPedidos,
      last_order_at: health.metricas.ultimaCompra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);
}

/**
 * Executa varredura completa (Sentinela) em todos os clientes do tenant.
 * Otimizado: busca todos os orders de uma vez e processa em memória.
 * @deprecated Use executeSentinelaChunk com paginação para evitar timeout no Netlify.
 */
export async function executeSentinelaFullScan(
  supabase: SupabaseClient,
  tenantId: string,
  onProgress?: (processed: number, total: number, current: string) => void
): Promise<import('@/types').SentinelaResult> {
  const startTime = Date.now();
  const erros: string[] = [];
  const mudancasStatus: import('@/types').SentinelaResult['mudancasStatus'] = [];
  const distribuicao: Record<HealthClassification, number> = {
    VIP: 0, Ativo: 0, Oportunidade: 0, Risco: 0, Perdido: 0,
  };

  // Buscar todos os clientes do tenant
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, status, custom_fields')
    .eq('tenant_id', tenantId);

  if (error || !clients) {
    return {
      totalProcessados: 0,
      distribuicao,
      mudancasStatus,
      vipsEmRisco: [],
      ltvMedioBase: 0,
      tempoExecucao: '0s',
      erros: [error?.message || 'Erro ao buscar clientes'],
    };
  }

  // ─── OTIMIZAÇÃO: Buscar TODOS os orders do tenant de uma vez ───
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id, client_id, total, status, created_at, metadata')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  // Agrupar orders por client_id em memória
  const ordersByClient = new Map<string, typeof allOrders>();
  for (const order of (allOrders || [])) {
    if (!order.client_id) continue;
    if (!ordersByClient.has(order.client_id)) {
      ordersByClient.set(order.client_id, []);
    }
    ordersByClient.get(order.client_id)!.push(order);
  }

  let processed = 0;
  const BATCH_SIZE = 20;
  const clientUpdates: Array<Record<string, unknown>> = [];

  // Processar em lotes maiores (sem query individual por cliente)
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    
    for (const client of batch) {
      try {
        const clientOrders = ordersByClient.get(client.id) || [];
        const health = calculateCustomerHealthFromOrders(client.id, clientOrders);
        
        // Verificar mudança de status
        const cf = client.custom_fields as Record<string, unknown> | null;
        const statusAnterior = (cf?.health_classification as string) || client.status || 'novo';
        const statusNovo = health.classificacao.nivel;

        if (statusAnterior !== statusNovo) {
          mudancasStatus.push({
            clienteId: client.id,
            clienteNome: client.name,
            statusAnterior,
            statusNovo,
            razao: health.classificacao.razao,
            logInteligencia: health.classificacao.logInteligencia,
          });
        }

        // Acumular updates para batch
        const currentFields = (cf && typeof cf === 'object') ? cf : {};
        const statusMap: Record<HealthClassification, string> = {
          'VIP': 'vip', 'Ativo': 'ativo', 'Oportunidade': 'ativo', 'Risco': 'risco', 'Perdido': 'inativo',
        };

        clientUpdates.push({
          id: client.id,
          tenant_id: tenantId,
          custom_fields: {
            ...currentFields,
            health_score: health.classificacao.score,
            health_classification: health.classificacao.nivel,
            health_data: health,
          },
          status: statusMap[health.classificacao.nivel],
          ltv: health.metricas.comportamentoCompra.valorTotalGasto,
          avg_ticket: health.metricas.comportamentoCompra.ticketMedio,
          total_orders: health.metricas.frequenciaCompra.totalPedidos,
          last_order_at: health.metricas.ultimaCompra,
          updated_at: new Date().toISOString(),
        });
        
        distribuicao[health.classificacao.nivel]++;
        processed++;
        
        onProgress?.(processed, clients.length, client.name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        erros.push(`Erro em ${client.name}: ${msg}`);
        processed++;
      }
    }
  }

  // ─── Batch UPDATE (nunca INSERT) — atualiza apenas campos de saúde ───
  // Usamos .update().eq('id') em vez de .upsert() para evitar violação
  // da constraint NOT NULL de 'phone' quando o cliente já existe no banco.
  const CHUNK = 50;
  for (let i = 0; i < clientUpdates.length; i += CHUNK) {
    const batch = clientUpdates.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      batch.map(u =>
        supabase
          .from('clients')
          .update({
            custom_fields: u.custom_fields,
            status: u.status,
            ltv: u.ltv,
            avg_ticket: u.avg_ticket,
            total_orders: u.total_orders,
            last_order_at: u.last_order_at,
            updated_at: u.updated_at,
          })
          .eq('id', u.id)
          .eq('tenant_id', u.tenant_id)
      )
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        erros.push(`Erro batch update: ${String(r.reason)}`);
      } else if (r.value.error) {
        erros.push(`Erro batch update: ${r.value.error.message}`);
      }
    }
  }

  const tempoMs = Date.now() - startTime;
  const tempoExecucao = tempoMs > 60000
    ? `${Math.round(tempoMs / 60000)}min ${Math.round((tempoMs % 60000) / 1000)}s`
    : `${Math.round(tempoMs / 1000)}s`;

  // ── Calcular LTV médio da base para identificar VIPs em risco ──
  const todosLtv = clientUpdates.map(u => Number(u.ltv) || 0).filter(v => v > 0);
  const ltvMedioBase = todosLtv.length > 0
    ? todosLtv.reduce((s, v) => s + v, 0) / todosLtv.length
    : 0;

  type VipRiscoItem = {
    clienteId: string;
    clienteNome: string;
    ltv: number;
    ticketMedio: number;
    diasInatividade: number;
    logInteligencia: string;
  };

  // ── Identificar VIPs em risco (LTV > média + inatividade > 15 dias) ──
  const vipsEmRisco: VipRiscoItem[] = clientUpdates
    .filter(u => {
      const ltv = Number(u.ltv) || 0;
      const cf = u.custom_fields as Record<string, unknown> | null;
      const healthData = cf?.health_data as CustomerHealth | undefined;
      const dias = healthData?.metricas?.diasInatividade ?? 999;
      return ltv > ltvMedioBase && ltv > 0 && dias >= 15;
    })
    .map(u => {
      const cf = u.custom_fields as Record<string, unknown> | null;
      const healthData = cf?.health_data as CustomerHealth | undefined;
      const dias = healthData?.metricas?.diasInatividade ?? 0;
      const ltv = Number(u.ltv) || 0;
      const ticket = Number(u.avg_ticket) || 0;
      const clientName = clients.find(c => c.id === u.id)?.name ?? 'Cliente';
      return {
        clienteId: String(u.id),
        clienteNome: clientName,
        ltv,
        ticketMedio: ticket,
        diasInatividade: dias,
        logInteligencia: healthData?.classificacao?.logInteligencia
          ?? `VIP em risco — ${dias} dias sem comprar, LTV R$ ${ltv.toFixed(2).replace('.', ',')}.`,
      };
    })
    .sort((a, b) => b.ltv - a.ltv)
    .slice(0, 20);

  return {
    totalProcessados: processed,
    distribuicao,
    mudancasStatus,
    vipsEmRisco,
    ltvMedioBase: Math.round(ltvMedioBase * 100) / 100,
    tempoExecucao,
    erros,
  };
}

/**
 * Versão paginada do Sentinela — processa um slice de clientes por chamada.
 * Resolve o problema de timeout no Netlify (26s max).
 *
 * O frontend encadeia chamadas:
 *   offset=0 → offset=150 → offset=300 → ... até hasMore=false
 */
export async function executeSentinelaChunk(
  supabase: SupabaseClient,
  tenantId: string,
  offset: number = 0,
  limit: number = 150,
): Promise<import('@/types').SentinelaResult & { offset: number; limit: number; total: number; hasMore: boolean }> {
  const startTime = Date.now();
  const erros: string[] = [];
  const mudancasStatus: import('@/types').SentinelaResult['mudancasStatus'] = [];
  const distribuicao: Record<HealthClassification, number> = {
    VIP: 0, Ativo: 0, Oportunidade: 0, Risco: 0, Perdido: 0,
  };

  // 1. Total de clientes (count apenas)
  const { count: totalCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const total = totalCount ?? 0;

  // 2. Clientes deste chunk
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, status, custom_fields')
    .eq('tenant_id', tenantId)
    .range(offset, offset + limit - 1);

  if (error || !clients) {
    return {
      totalProcessados: 0, distribuicao, mudancasStatus, vipsEmRisco: [],
      ltvMedioBase: 0, tempoExecucao: '0s',
      erros: [error?.message || 'Erro ao buscar clientes'],
      offset, limit, total, hasMore: false,
    };
  }

  if (clients.length === 0) {
    return {
      totalProcessados: 0, distribuicao, mudancasStatus, vipsEmRisco: [],
      ltvMedioBase: 0, tempoExecucao: '0s', erros: [],
      offset, limit, total, hasMore: false,
    };
  }

  // 3. Orders apenas dos clientes deste chunk
  const clientIds = clients.map(c => c.id);
  const { data: chunkOrders } = await supabase
    .from('orders')
    .select('id, client_id, total, status, created_at, metadata')
    .eq('tenant_id', tenantId)
    .in('client_id', clientIds)
    .order('created_at', { ascending: true });

  // Agrupar orders por client_id em memória
  const ordersByClient = new Map<string, typeof chunkOrders>();
  for (const order of (chunkOrders || [])) {
    if (!order.client_id) continue;
    if (!ordersByClient.has(order.client_id)) ordersByClient.set(order.client_id, []);
    ordersByClient.get(order.client_id)!.push(order);
  }

  const clientUpdates: Array<Record<string, unknown>> = [];

  for (const client of clients) {
    try {
      const clientOrders = ordersByClient.get(client.id) || [];
      const health = calculateCustomerHealthFromOrders(client.id, clientOrders);

      const cf = client.custom_fields as Record<string, unknown> | null;
      const statusAnterior = (cf?.health_classification as string) || client.status || 'novo';
      const statusNovo = health.classificacao.nivel;

      if (statusAnterior !== statusNovo) {
        mudancasStatus.push({
          clienteId: client.id,
          clienteNome: client.name,
          statusAnterior,
          statusNovo,
          razao: health.classificacao.razao,
          logInteligencia: health.classificacao.logInteligencia,
        });
      }

      const currentFields = (cf && typeof cf === 'object') ? cf : {};
      const statusMap: Record<HealthClassification, string> = {
        'VIP': 'vip', 'Ativo': 'ativo', 'Oportunidade': 'ativo', 'Risco': 'risco', 'Perdido': 'inativo',
      };

      clientUpdates.push({
        id: client.id,
        tenant_id: tenantId,
        custom_fields: {
          ...currentFields,
          health_score: health.classificacao.score,
          health_classification: health.classificacao.nivel,
          health_data: health,
        },
        status: statusMap[health.classificacao.nivel],
        ltv: health.metricas.comportamentoCompra.valorTotalGasto,
        avg_ticket: health.metricas.comportamentoCompra.ticketMedio,
        total_orders: health.metricas.frequenciaCompra.totalPedidos,
        last_order_at: health.metricas.ultimaCompra,
        updated_at: new Date().toISOString(),
      });

      distribuicao[health.classificacao.nivel]++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      erros.push(`Erro em ${client.name}: ${msg}`);
    }
  }

  // 4. Batch UPDATE em chunks de 50
  const CHUNK = 50;
  for (let i = 0; i < clientUpdates.length; i += CHUNK) {
    const batch = clientUpdates.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      batch.map(u =>
        supabase
          .from('clients')
          .update({
            custom_fields: u.custom_fields,
            status: u.status,
            ltv: u.ltv,
            avg_ticket: u.avg_ticket,
            total_orders: u.total_orders,
            last_order_at: u.last_order_at,
            updated_at: u.updated_at,
          })
          .eq('id', u.id)
          .eq('tenant_id', u.tenant_id)
      )
    );
    for (const r of results) {
      if (r.status === 'rejected') erros.push(`Erro update: ${String(r.reason)}`);
      else if (r.value.error) erros.push(`Erro update: ${r.value.error.message}`);
    }
  }

  const tempoMs = Date.now() - startTime;
  const tempoExecucao = tempoMs > 60000
    ? `${Math.round(tempoMs / 60000)}min ${Math.round((tempoMs % 60000) / 1000)}s`
    : `${Math.round(tempoMs / 1000)}s`;

  const todosLtv = clientUpdates.map(u => Number(u.ltv) || 0).filter(v => v > 0);
  const ltvMedioBase = todosLtv.length > 0
    ? todosLtv.reduce((s, v) => s + v, 0) / todosLtv.length
    : 0;

  type VipRiscoItem = {
    clienteId: string; clienteNome: string; ltv: number;
    ticketMedio: number; diasInatividade: number; logInteligencia: string;
  };

  const vipsEmRisco: VipRiscoItem[] = clientUpdates
    .filter(u => {
      const ltv = Number(u.ltv) || 0;
      const cf = u.custom_fields as Record<string, unknown> | null;
      const healthData = cf?.health_data as CustomerHealth | undefined;
      const dias = healthData?.metricas?.diasInatividade ?? 999;
      return ltv > ltvMedioBase && ltv > 0 && dias >= 15;
    })
    .map(u => {
      const cf = u.custom_fields as Record<string, unknown> | null;
      const healthData = cf?.health_data as CustomerHealth | undefined;
      const dias = healthData?.metricas?.diasInatividade ?? 0;
      const ltv = Number(u.ltv) || 0;
      const ticket = Number(u.avg_ticket) || 0;
      const clientName = clients.find(c => c.id === u.id)?.name ?? 'Cliente';
      return {
        clienteId: String(u.id),
        clienteNome: clientName,
        ltv,
        ticketMedio: ticket,
        diasInatividade: dias,
        logInteligencia: healthData?.classificacao?.logInteligencia
          ?? `VIP em risco — ${dias} dias sem comprar, LTV R$ ${ltv.toFixed(2).replace('.', ',')}.`,
      };
    })
    .sort((a, b) => b.ltv - a.ltv)
    .slice(0, 20);

  const hasMore = offset + clients.length < total;

  return {
    totalProcessados: clients.length,
    distribuicao,
    mudancasStatus,
    vipsEmRisco,
    ltvMedioBase: Math.round(ltvMedioBase * 100) / 100,
    tempoExecucao,
    erros,
    offset,
    limit,
    total,
    hasMore,
  };
}

/**
 * Versão otimizada: calcula health a partir de orders já carregados em memória.
 * Evita uma query por cliente — recebe o array de orders diretamente.
 */
function calculateCustomerHealthFromOrders(
  clientId: string,
  pedidos: Array<Record<string, unknown>>
): CustomerHealth {
  const agora = new Date();

  const totalPedidos = pedidos.length;
  const primeiraCompra = totalPedidos > 0 ? String(pedidos[0].created_at) : null;
  const ultimaCompra = totalPedidos > 0 ? String(pedidos[totalPedidos - 1].created_at) : null;

  const diasInatividade = ultimaCompra
    ? Math.floor((agora.getTime() - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // mesesComoCliente: apenas relevante se há pedidos; sem pedidos = 0
  const mesesComoCliente = primeiraCompra && totalPedidos > 0
    ? Math.max(1, Math.floor((agora.getTime() - new Date(primeiraCompra).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  // mediaComprasMes: 0 se sem pedidos (tratado como lead em calculateScore)
  const mediaComprasMes = mesesComoCliente > 0 ? totalPedidos / mesesComoCliente : 0;

  // ── LTV — somente pedidos com status PAGO ──
  const pedidosPagos = pedidos.filter(o =>
    PAID_STATUSES.has(String(o.status ?? '').toLowerCase())
  );
  const valorTotalGasto = pedidosPagos.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const ticketMedio = pedidosPagos.length > 0 ? valorTotalGasto / pedidosPagos.length : 0;

  // Produtos preferidos
  const productCount: Record<string, { nome: string; quantidade: number }> = {};
  for (const order of pedidos) {
    const meta = typeof order.metadata === 'object' && order.metadata !== null ? order.metadata as Record<string, unknown> : {};
    const items = Array.isArray(meta.itens) ? meta.itens : [];
    for (const item of items) {
      const it = item as Record<string, unknown>;
      const nome = String(it.nome || it.name || 'Produto');
      if (!productCount[nome]) productCount[nome] = { nome, quantidade: 0 };
      productCount[nome].quantidade += Number(it.quantidade) || 1;
    }
  }

  const produtosPreferidos: ProdutoPreferido[] = Object.values(productCount)
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3)
    .map(p => ({
      nome: p.nome,
      quantidade: p.quantidade,
      percentualCompras: totalPedidos > 0 ? Math.round((p.quantidade / totalPedidos) * 100) : 0,
    }));

  // Tendências (últimos 3 vs anteriores 3 meses)
  const tresMesesAtras = new Date();
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

  const pedidosUlt3m = pedidos.filter(o => new Date(String(o.created_at)) >= tresMesesAtras);
  const pedidosAnt3m = pedidos.filter(o => {
    const d = new Date(String(o.created_at));
    return d >= seisMesesAtras && d < tresMesesAtras;
  });

  const valorUlt3m = pedidosUlt3m.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const valorAnt3m = pedidosAnt3m.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const ticketUlt3m = pedidosUlt3m.length > 0 ? valorUlt3m / pedidosUlt3m.length : 0;
  const ticketAnt3m = pedidosAnt3m.length > 0 ? valorAnt3m / pedidosAnt3m.length : 0;

  const crescimentoFrequencia: TendenciaType =
    pedidosUlt3m.length > pedidosAnt3m.length * 1.15 ? 'aumentando' :
    pedidosUlt3m.length < pedidosAnt3m.length * 0.85 ? 'diminuindo' : 'estavel';

  const crescimentoTicket: TendenciaType =
    ticketUlt3m > ticketAnt3m * 1.15 ? 'aumentando' :
    ticketUlt3m < ticketAnt3m * 0.85 ? 'diminuindo' : 'estavel';

  const { score, nivel, razao, recomendacoes, logInteligencia } = calculateScore({
    totalPedidos,
    diasInatividade,
    mediaComprasMes,
    ticketMedio,
    valorTotalGasto,
    crescimentoFrequencia,
    crescimentoTicket,
    pedidosUlt3m: pedidosUlt3m.length,
  });

  return {
    clienteId: clientId,
    metricas: {
      diasInatividade,
      ultimaCompra,
      frequenciaCompra: {
        mediaComprasMes: Math.round(mediaComprasMes * 100) / 100,
        totalPedidos,
        primeiraCompra,
        mesesComoCliente,
      },
      comportamentoCompra: {
        ticketMedio: Math.round(ticketMedio * 100) / 100,
        valorTotalGasto: Math.round(valorTotalGasto * 100) / 100,
        produtosPreferidos,
        categoriasPreferidas: [],
      },
      tendencias: {
        crescimentoFrequencia,
        crescimentoTicket,
        ultimosTresMeses: {
          pedidos: pedidosUlt3m.length,
          valorTotal: Math.round(valorUlt3m * 100) / 100,
        },
      },
    },
    classificacao: {
      nivel,
      score,
      razao,
      recomendacoes,
      logInteligencia,
    },
    calculadoEm: new Date().toISOString(),
  };
}
