import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { mapClients, upsertClients } from '@/lib/facilzap/mapper';
import { SyncLogger } from '@/lib/facilzap/sync-logger';

/**
 * POST /api/webhooks/facilzap
 *
 * Recebe webhooks da FacilZap (pedidos novos, atualizações, pagamentos).
 * Eventos suportados: order.created, order.updated, order.paid, product.updated
 *
 * A FacilZap envia o payload com dados do pedido/produto diretamente.
 * Identificamos o tenant pelo facilzap_token enviado no header ou body.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const event = body.event || body.tipo || body.type || 'unknown';
    
    console.log(`[Webhook FacilZap] Evento recebido: ${event}`);

    // Identificar tenant pelo token no header ou body
    const token = request.headers.get('x-facilzap-token') 
      || request.headers.get('authorization')?.replace('Bearer ', '')
      || body.token 
      || body.api_token;

    const supabase = createServerSupabaseClient();

    let tenantId: string | null = null;

    if (token) {
      // Buscar tenant pelo facilzap_token
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('facilzap_token', token)
        .single();

      if (tenant) {
        tenantId = tenant.id;
      }
    }

    // SECURITY: Não usar body.tenant_id/body.store_id como fallback
    // Isso permitiria injeção cross-tenant via payload malicioso

    if (!tenantId) {
      console.warn('[Webhook FacilZap] Tenant não identificado');
      // Ainda retornar 200 para não causar retries da FacilZap
      return NextResponse.json({ status: 'ok', warning: 'tenant_not_found' });
    }

    // Processar evento
    switch (event) {
      case 'order.created':
      case 'order.updated':
      case 'order.paid':
      case 'pedido.criado':
      case 'pedido.atualizado':
      case 'pedido.pago':
        await handleOrderEvent(supabase, tenantId, body);
        break;

      case 'product.created':
      case 'product.updated':
      case 'produto.criado':
      case 'produto.atualizado':
        await handleProductEvent(supabase, tenantId, body);
        break;

      case 'client.created':
      case 'client.updated':
      case 'cliente.criado':
      case 'cliente.atualizado':
      case 'cliente_criado':
      case 'cliente_atualizado':
        await handleClientEvent(supabase, tenantId, body);
        break;

      default:
        console.log(`[Webhook FacilZap] Evento não tratado: ${event}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Webhook FacilZap] Processado em ${duration}ms`);
    return NextResponse.json({ status: 'ok', duration_ms: duration });
  } catch (error: any) {
    console.error('[Webhook FacilZap] Erro:', error.message);
    // Retornar 200 mesmo com erro para evitar retries infinitos
    return NextResponse.json({ status: 'error', message: error.message });
  }
}

/**
 * Processa evento de pedido (criação/atualização/pagamento).
 */
async function handleOrderEvent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  body: any
) {
  const order = body.data || body.pedido || body.order || body;

  if (!order.id) {
    console.warn('[Webhook FacilZap] Pedido sem ID, ignorando');
    return;
  }

  const parseNum = (v: any): number => {
    const n = parseFloat(String(v || '0').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const isTruthy = (v: any): boolean =>
    v === '1' || v === 1 || v === true || v === 'true' || v === 'sim';

  // Telefone do cliente
  const rawPhone =
    order.cliente?.whatsapp_e164 ||
    order.cliente?.whatsapp ||
    order.cliente?.telefone ||
    '';
  const ph = rawPhone.replace(/\D/g, '');

  // Buscar client_id por telefone
  let clientId: string | null = null;
  if (ph && ph.length >= 8) {
    const canonical = PhoneNormalizer.canonical(ph);
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_normalized', canonical)
      .single();
    if (client) clientId = client.id;
  }

  // Fallback: buscar por email
  if (!clientId && order.cliente?.email) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', order.cliente.email.toLowerCase().trim())
      .single();
    if (client) clientId = client.id;
  }

  // Status do pedido
  let orderStatus = 'pending';
  if (isTruthy(order.status_entregue)) orderStatus = 'delivered';
  else if (isTruthy(order.status_despachado)) orderStatus = 'shipped';
  else if (isTruthy(order.status_separado) || isTruthy(order.status_em_separacao)) orderStatus = 'processing';
  else if (isTruthy(order.status_pago)) orderStatus = 'confirmed';
  else if (order.status === 'cancelado' || order.status_pedido === 'cancelado') orderStatus = 'cancelled';

  const paymentStatus = isTruthy(order.status_pago) ? 'paid' : 'pending';

  // Método de pagamento
  let paymentMethod: string | null = null;
  if (typeof order.metodo_pagamento === 'string') paymentMethod = order.metodo_pagamento;
  else if (typeof order.metodo_pagamento === 'object' && order.metodo_pagamento?.nome) paymentMethod = order.metodo_pagamento.nome;
  else if (typeof order.forma_pagamento === 'string') paymentMethod = order.forma_pagamento;

  // Items
  const items = order.itens || order.produtos || [];
  const totalItems = items.reduce((sum: number, it: any) => sum + (parseNum(it.quantidade) || 1), 0);

  // Data do pedido
  let orderDate: string;
  try {
    const d = order.data ? new Date(order.data) : null;
    orderDate = d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } catch {
    orderDate = new Date().toISOString();
  }

  // Valores
  const subtotal = parseNum(order.subtotal);
  const discount = parseNum(order.desconto_total || order.desconto);
  const shipping = parseNum(order.valor_frete);
  const total = parseNum(order.total || order.valor_total) || (subtotal - discount + shipping);

  const orderNumber = (() => {
    const codigo = order.codigo || order.numero || order.number || order.numero_pedido;
    return codigo ? String(codigo).trim() || String(order.id) : String(order.id);
  })();

  const orderData = {
    tenant_id: tenantId,
    client_id: clientId,
    external_id: String(order.id),
    order_number: orderNumber,
    status: orderStatus,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    subtotal,
    discount,
    shipping,
    total,
    tracking_code: order.codigo_rastreio || null,
    notes: order.observacoes || null,
    coupon_code: order.cupom_info?.codigo || null,
    created_at: orderDate,
    metadata: {
      cliente_nome: order.cliente?.nome || null,
      cliente_telefone: rawPhone || null,
      cliente_whatsapp: order.cliente?.whatsapp || null,
      cliente_whatsapp_e164: order.cliente?.whatsapp_e164 || null,
      cliente_whatsapp_ddi: order.cliente?.whatsapp_ddi || null,
      cliente_cpf_cnpj: order.cliente?.cpf_cnpj || null,
      cliente_email: order.cliente?.email || null,
      cliente_id_facilzap: order.cliente?.id || null,
      total_items: totalItems,
      itens: items.slice(0, 50).map((it: any) => ({
        id: it.id || null,
        produto_id: it.produto_id || null,
        nome: it.nome || it.name || '',
        quantidade: parseNum(it.quantidade) || 1,
        valor: parseNum(it.preco_unitario || it.valor || it.preco),
        variacao: it.variacao || null,
        sku: it.sku || it.codigo || null,
      })),
      webhook_event: body.event || body.tipo || 'unknown',
      webhook_received_at: new Date().toISOString(),
      source: 'webhook',
    },
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('orders')
    .upsert(orderData, { onConflict: 'tenant_id,external_id' });

  if (error) {
    console.error('[Webhook FacilZap] Erro ao salvar pedido:', error.message);
    // Fallback: delete + insert
    await supabase.from('orders').delete().eq('tenant_id', tenantId).eq('external_id', String(order.id));
    const { error: insertError } = await supabase.from('orders').insert(orderData);
    if (insertError) console.error('[Webhook FacilZap] Erro no insert fallback:', insertError.message);
    else console.log(`[Webhook FacilZap] Pedido ${orderNumber} salvo (fallback insert)`);
  } else {
    console.log(`[Webhook FacilZap] Pedido ${orderNumber} salvo com sucesso`);
  }

  // Atualizar stats do cliente
  if (clientId) {
    await updateClientStats(supabase, tenantId, clientId);
  }
}

/**
 * Processa evento de produto (criação/atualização).
 */
async function handleProductEvent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  body: any
) {
  const product = body.data || body.produto || body.product || body;

  if (!product.id) {
    console.warn('[Webhook FacilZap] Produto sem ID, ignorando');
    return;
  }

  let stock = parseInt(String(product.stock ?? product.estoque ?? 0), 10);
  if (isNaN(stock) || stock < -1 || stock > 2147483647) stock = 0;

  const images = Array.isArray(product.images || product.imagens)
    ? (product.images || product.imagens).filter((i: string) => !!i)
    : [];

  const productData = {
    tenant_id: tenantId,
    external_id: product.external_id || String(product.id),
    sku: typeof product.sku === 'object'
      ? (product.sku?.nome || product.sku?.sku || JSON.stringify(product.sku))
      : (product.sku || null),
    name: product.name || product.nome || 'Sem nome',
    description: product.description || product.descricao || null,
    price: Number(product.price || product.preco) || 0,
    compare_at_price: Number(product.compare_at_price || product.preco_comparacao) || null,
    cost: Number(product.cost || product.custo) || null,
    stock,
    image_url: product.image_url || product.imagem || null,
    images,
    category: typeof product.category === 'object'
      ? (product.category?.nome || product.category?.name || JSON.stringify(product.category))
      : (product.category || product.categoria || null),
    is_active: product.is_active !== false && product.ativo !== false,
    custom_fields: {
      ...(product.custom_fields || {}),
      source: 'webhook',
      webhook_received_at: new Date().toISOString(),
    },
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('products')
    .upsert(productData, { onConflict: 'tenant_id,external_id' });

  if (error) {
    console.error('[Webhook FacilZap] Erro ao salvar produto:', error.message);
    await supabase.from('products').delete().eq('tenant_id', tenantId).eq('external_id', productData.external_id);
    const { error: insertError } = await supabase.from('products').insert(productData);
    if (insertError) console.error('[Webhook FacilZap] Erro no insert fallback produto:', insertError.message);
    else console.log(`[Webhook FacilZap] Produto ${product.name || product.nome} salvo (fallback)`);
  } else {
    console.log(`[Webhook FacilZap] Produto ${product.name || product.nome} salvo`);
  }
}

/**
 * Atualiza estatísticas do cliente (LTV, total_orders, etc).
 */
async function updateClientStats(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string
) {
  try {
    const { data: orders } = await supabase
      .from('orders')
      .select('total, created_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId);

    if (orders && orders.length > 0) {
      const totalSpent = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const lastOrder = orders.reduce((latest, o) =>
        o.created_at > latest ? o.created_at : latest, '');

      await supabase.from('clients').update({
        ltv: Math.round(totalSpent * 100) / 100,
        total_orders: orders.length,
        avg_ticket: Math.round((totalSpent / orders.length) * 100) / 100,
        last_order_at: lastOrder || null,
      }).eq('id', clientId);
    }
  } catch (error: any) {
    console.error('[Webhook FacilZap] Erro ao atualizar stats:', error.message);
  }
}

/**
 * Processa evento de cliente (criação/atualização).
 * Usa mapper.ts para normalização rigorosa + PhoneNormalizer.
 * NUNCA duplica: upsert por tenant_id + phone_normalized.
 */
async function handleClientEvent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  body: any
) {
  const clientRaw = body.data || body.cliente || body.client || body;

  if (!clientRaw) {
    console.warn('[Webhook FacilZap] Cliente sem dados, ignorando');
    return;
  }

  // Usar mapper para normalização rigorosa
  const { valid, rejected } = mapClients([clientRaw], tenantId, 'webhook');

  if (rejected.length > 0) {
    console.warn('[Webhook FacilZap] Cliente rejeitado:', rejected[0].reason);
    // Log no sync_audit_log
    const logger = new SyncLogger(supabase, tenantId, 'webhook', 'webhook');
    await logger.start({ event: body.event || body.tipo });
    logger.addError(`Cliente rejeitado: ${rejected[0].reason}`);
    await logger.finish('error');
    return;
  }

  if (valid.length === 0) {
    console.warn('[Webhook FacilZap] Nenhum cliente válido no payload');
    return;
  }

  const result = await upsertClients(supabase, valid);

  if (result.failed > 0) {
    console.error('[Webhook FacilZap] Erros ao salvar cliente:', result.errors);
  } else {
    console.log(`[Webhook FacilZap] Cliente ${valid[0].name} (${valid[0].phone}) salvo via webhook`);
  }
}
