/**
 * Customer Health Engine — Motor de análise comportamental de clientes.
 * 
 * Calcula automaticamente:
 * - Score de saúde (0-100)
 * - Classificação inteligente (VIP, Ativo, Oportunidade, Risco, Perdido)
 * - Métricas de frequência, ticket médio, LTV
 * - Produtos preferidos e categorias
 * - Tendências de comportamento
 * - Recomendações acionáveis
 */

import type { 
  CustomerHealth, 
  HealthClassification, 
  TendenciaType, 
  ProdutoPreferido 
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Calcula a saúde completa de um cliente.
 */
export async function calculateCustomerHealth(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string
): Promise<CustomerHealth> {
  // Buscar todos os pedidos do cliente
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

  // Meses como cliente
  const mesesComoCliente = primeiraCompra
    ? Math.max(1, Math.floor((agora.getTime() - new Date(primeiraCompra).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  // Frequência de compra por mês
  const mediaComprasMes = mesesComoCliente > 0 ? totalPedidos / mesesComoCliente : 0;

  // ═══════════════════════════════════════
  // COMPORTAMENTO DE COMPRA
  // ═══════════════════════════════════════
  const valorTotalGasto = pedidos.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const ticketMedio = totalPedidos > 0 ? valorTotalGasto / totalPedidos : 0;

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
  const { score, nivel, razao, recomendacoes } = calculateScore({
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
    },
    calculadoEm: new Date().toISOString(),
  };
}

/**
 * Algoritmo de classificação inteligente.
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
} {
  const {
    totalPedidos,
    diasInatividade,
    mediaComprasMes,
    ticketMedio,
    crescimentoFrequencia,
    crescimentoTicket,
    pedidosUlt3m,
  } = params;

  let score = 0;
  const recomendacoes: string[] = [];

  // ── Componente 1: Recência (30 pontos) ──
  if (diasInatividade <= 7) score += 30;
  else if (diasInatividade <= 15) score += 25;
  else if (diasInatividade <= 30) score += 20;
  else if (diasInatividade <= 45) score += 14;
  else if (diasInatividade <= 60) score += 8;
  else if (diasInatividade <= 90) score += 4;
  else score += 0;

  // ── Componente 2: Frequência (25 pontos) ──
  if (mediaComprasMes >= 3) score += 25;
  else if (mediaComprasMes >= 2) score += 20;
  else if (mediaComprasMes >= 1) score += 15;
  else if (mediaComprasMes >= 0.5) score += 10;
  else if (mediaComprasMes >= 0.25) score += 5;
  else score += 2;

  // ── Componente 3: Volume de pedidos (15 pontos) ──
  if (totalPedidos >= 20) score += 15;
  else if (totalPedidos >= 10) score += 12;
  else if (totalPedidos >= 5) score += 8;
  else if (totalPedidos >= 3) score += 5;
  else if (totalPedidos >= 1) score += 3;
  else score += 0;

  // ── Componente 4: Tendência (15 pontos) ──
  if (crescimentoFrequencia === 'aumentando') score += 8;
  else if (crescimentoFrequencia === 'estavel') score += 4;
  
  if (crescimentoTicket === 'aumentando') score += 7;
  else if (crescimentoTicket === 'estavel') score += 3;

  // ── Componente 5: Atividade recente (15 pontos) ──
  if (pedidosUlt3m >= 5) score += 15;
  else if (pedidosUlt3m >= 3) score += 12;
  else if (pedidosUlt3m >= 2) score += 8;
  else if (pedidosUlt3m >= 1) score += 5;
  else score += 0;

  // Limitar entre 0 e 100
  score = Math.min(100, Math.max(0, score));

  // ── Classificação ──
  let nivel: HealthClassification;
  let razao: string;

  if (score >= 80) {
    nivel = 'VIP';
    razao = `Cliente premium com score ${score}/100. Compra frequentemente (${mediaComprasMes.toFixed(1)}/mês) e está ativo.`;
    recomendacoes.push('Oferecer programa de fidelidade exclusivo');
    recomendacoes.push('Enviar lançamentos antes do público geral');
    recomendacoes.push('Desconto especial de aniversário');
    if (crescimentoTicket === 'aumentando') {
      recomendacoes.push('Upsell: ticket crescendo — apresentar produtos premium');
    }
  } else if (score >= 60) {
    nivel = 'Ativo';
    razao = `Cliente ativo com score ${score}/100. Frequência de ${mediaComprasMes.toFixed(1)} compras/mês.`;
    recomendacoes.push('Manter engajamento com promoções periódicas');
    recomendacoes.push('Enviar novidades e lançamentos');
    if (diasInatividade > 20) {
      recomendacoes.push(`Atenção: ${diasInatividade} dias sem comprar — enviar incentivo`);
    }
  } else if (score >= 40) {
    nivel = 'Oportunidade';
    razao = `Cliente com potencial (score ${score}/100). Ticket médio de R$ ${ticketMedio.toFixed(2)} mas frequência baixa.`;
    recomendacoes.push('Enviar cupom de desconto para incentivar nova compra');
    recomendacoes.push('Oferecer frete grátis na próxima compra');
    if (ticketMedio > 100) {
      recomendacoes.push('Alto ticket médio — vale investir em reativação personalizada');
    }
  } else if (score >= 20) {
    nivel = 'Risco';
    razao = `Cliente em risco (score ${score}/100). ${diasInatividade} dias sem comprar, frequência decrescente.`;
    recomendacoes.push('URGENTE: Enviar mensagem de reativação');
    recomendacoes.push('Cupom de desconto agressivo (15-20%)');
    recomendacoes.push('Perguntar se houve algum problema');
  } else {
    nivel = 'Perdido';
    razao = `Cliente provavelmente perdido (score ${score}/100). ${diasInatividade} dias sem comprar.`;
    recomendacoes.push('Última tentativa: cupom especial de volta');
    recomendacoes.push('Pesquisa de satisfação para entender motivo');
    if (totalPedidos === 0) {
      recomendacoes.push('Nunca comprou — considerar como lead');
    }
  }

  return { score, nivel, razao, recomendacoes };
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
      ticket_medio: health.metricas.comportamentoCompra.ticketMedio,
      total_pedidos: health.metricas.frequenciaCompra.totalPedidos,
      ultima_compra: health.metricas.ultimaCompra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);
}

/**
 * Executa varredura completa (Sentinela) em todos os clientes do tenant.
 */
export async function executeSentinelaFullScan(
  supabase: SupabaseClient,
  tenantId: string,
  onProgress?: (processed: number, total: number, current: string) => void
): Promise<{
  totalProcessados: number;
  distribuicao: Record<HealthClassification, number>;
  mudancasStatus: Array<{
    clienteId: string;
    clienteNome: string;
    statusAnterior: string;
    statusNovo: string;
    razao: string;
  }>;
  tempoExecucao: string;
  erros: string[];
}> {
  const startTime = Date.now();
  const erros: string[] = [];
  const mudancasStatus: Array<{
    clienteId: string;
    clienteNome: string;
    statusAnterior: string;
    statusNovo: string;
    razao: string;
  }> = [];
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
      tempoExecucao: '0s',
      erros: [error?.message || 'Erro ao buscar clientes'],
    };
  }

  const BATCH_SIZE = 10;
  let processed = 0;

  // Processar em lotes
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (client) => {
      try {
        const health = await calculateCustomerHealth(supabase, tenantId, client.id);
        
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
          });
        }

        // Salvar
        await saveCustomerHealth(supabase, client.id, health);
        
        distribuicao[health.classificacao.nivel]++;
        processed++;
        
        onProgress?.(processed, clients.length, client.name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        erros.push(`Erro em ${client.name}: ${msg}`);
        processed++;
      }
    });

    await Promise.all(promises);

    // Delay entre lotes para não sobrecarregar
    if (i + BATCH_SIZE < clients.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const tempoMs = Date.now() - startTime;
  const tempoExecucao = tempoMs > 60000
    ? `${Math.round(tempoMs / 60000)}min ${Math.round((tempoMs % 60000) / 1000)}s`
    : `${Math.round(tempoMs / 1000)}s`;

  return {
    totalProcessados: processed,
    distribuicao,
    mudancasStatus,
    tempoExecucao,
    erros,
  };
}
