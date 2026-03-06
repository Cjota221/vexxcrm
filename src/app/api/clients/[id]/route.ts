import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * GET /api/clients/[id]
 * Retorna detalhes de um cliente específico.
 * 
 * O [id] pode ser:
 * - UUID do cliente diretamente
 * - UUID da conversa (conversation_id) — busca pelo telefone da conversa
 * - Número de telefone (com ou sem @s.whatsapp.net)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    let client: any = null;

    // Estratégia 1: Tentar buscar cliente diretamente pelo ID (UUID)
    const { data: directClient } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (directClient) {
      client = directClient;
    }

    // Estratégia 2: Buscar pela conversation_id e pegar o client_id
    if (!client) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, client_id, client:clients!conversations_client_id_fkey(id, name, phone, phone_normalized)')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (conversation?.client) {
        // Buscar cliente completo
        const { data: fullClient } = await supabase
          .from('clients')
          .select('*')
          .eq('id', conversation.client_id)
          .eq('tenant_id', tenantId)
          .single();
        
        if (fullClient) {
          client = fullClient;
        }
      }
    }

    // Estratégia 3: Tentar pelo telefone diretamente
    if (!client && (id.includes('@') || /^\d+$/.test(id))) {
      const phoneCanonical = PhoneNormalizer.canonical(id);
      
      const { data: phoneClient } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone_canonical', phoneCanonical)
        .maybeSingle();

      if (phoneClient) {
        client = phoneClient;
      }
    }

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Buscar pedidos com itens (JOIN order_items) pelo client_id
    let orders: any[] = [];

    // ── Mapa de produtos: sku → { image_url, name } ──────────────────────────
    // Usado para injetar foto nos itens do pedido (quando vem do metadata.itens)
    const { data: productRows } = await supabase
      .from('products')
      .select('id, name, sku, external_id, image_url, images')
      .eq('tenant_id', tenantId);

    const productBySku = new Map<string, any>();
    const productByExtId = new Map<string, any>();
    const productByNameNorm = new Map<string, any>();
    for (const p of productRows ?? []) {
      if (p.sku)         productBySku.set(p.sku.toLowerCase().trim(), p);
      if (p.external_id) productByExtId.set(String(p.external_id), p);
      if (p.name)        productByNameNorm.set(p.name.toLowerCase().trim(), p);
    }

    /** Resolve imagem de um item de pedido (order_items ou metadata.itens) */
    const resolveItemImage = (item: any): string | null => {
      // Já tem imagem no item? usa direto
      if (item.image_url)                            return item.image_url;
      if (item.imagem && item.imagem !== 'null')     return item.imagem;
      if (item.metadata?.image_url)                  return item.metadata.image_url;
      // Tenta cruzar pelo produto_id / sku / nome
      const sku = item.product_sku ?? item.sku ?? '';
      const extId = item.produto_id ? String(item.produto_id) : '';
      const nome = (item.product_name ?? item.nome ?? item.name ?? '').toLowerCase().trim();
      const p =
        (sku  && productBySku.get(sku.toLowerCase().trim()))  ||
        (extId && productByExtId.get(extId))                   ||
        (nome  && productByNameNorm.get(nome))                 ||
        null;
      if (p?.image_url) return p.image_url;
      if (p?.images?.length) return p.images[0];
      return null;
    };

    /** Normaliza um item vindo de order_items (tabela) */
    const normalizeOrderItem = (item: any) => ({
      product_name: item.product_name,
      nome:         item.product_name,
      product_sku:  item.product_sku,
      quantity:     item.quantity,
      quantidade:   item.quantity,
      price:        item.unit_price,
      unit_price:   item.unit_price,
      preco_unitario: item.unit_price,
      total_price:  item.total_price,
      valor:        item.total_price,
      variacao:     item.metadata?.variacao ?? null,
      image_url:    resolveItemImage(item),
      metadata:     item.metadata,
    });

    /** Normaliza um item vindo de metadata.itens (FacilZap JSON) */
    const normalizeMetaItem = (item: any) => {
      const qty  = Math.max(1, Number(item.quantidade ?? item.quantity ?? 1));
      // Tentar extrair preço unitário de vários campos (FacilZap varia por versão da API)
      const parseP = (v: any) => { const n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
      const unit = parseP(item.preco_unitario) || parseP(item.valor_unitario) || parseP(item.preco) || parseP(item.price) || parseP(item.valor) || 0;
      // Total: tenta campo direto, senão calcula (mas se unit=0 e temos total, derivar unitário)
      const tot  = parseP(item.total_price) || parseP(item.subtotal) || parseP(item.preco_total) || (unit * qty);
      const finalUnit = unit > 0 ? unit : (tot > 0 && qty > 0 ? tot / qty : 0);
      const finalTot  = tot > 0 ? tot : finalUnit * qty;
      return {
        product_name:   item.nome ?? item.name ?? item.product_name ?? 'Produto',
        nome:           item.nome ?? item.name ?? item.product_name ?? 'Produto',
        product_sku:    item.sku ?? item.product_sku ?? null,
        quantity:       qty,
        quantidade:     qty,
        price:          finalUnit,
        unit_price:     finalUnit,
        preco_unitario: finalUnit,
        total_price:    finalTot,
        valor:          finalTot,
        variacao:       item.variacao ?? null,
        image_url:      resolveItemImage(item),
        metadata:       null,
      };
    };

    // Helper: busca pedidos + itens para uma lista de client_ids
    const fetchOrdersWithItems = async (clientIds: string[]) => {
      const { data: rawOrders } = await supabase
        .from('orders')
        .select(`
          id,
          external_id,
          order_number,
          status,
          payment_status,
          payment_method,
          subtotal,
          discount,
          shipping,
          total,
          tracking_code,
          tracking_url,
          shipping_address,
          coupon_code,
          notes,
          metadata,
          created_at,
          updated_at,
          confirmed_at,
          shipped_at,
          delivered_at,
          cancelled_at,
          client_id,
          order_items (
            id,
            product_name,
            product_sku,
            quantity,
            unit_price,
            total_price,
            metadata
          )
        `)
        .eq('tenant_id', tenantId)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(50);

      return (rawOrders ?? []).map((o: any) => {
        // Prioridade 1: order_items (tabela)
        const fromTable = (o.order_items ?? []) as any[];
        // Prioridade 2: metadata.itens (FacilZap JSON — fallback quando tabela vazia)
        const fromMeta  = (o.metadata?.itens ?? o.metadata?.items ?? []) as any[];

        const items = fromTable.length > 0
          ? fromTable.map(normalizeOrderItem)
          : fromMeta.map(normalizeMetaItem);

        return { ...o, items, order_items: undefined };
      });
    };

    // Se temos um client.id real, buscar pedidos diretamente
    if (client.id) {
      console.log(`[clients/${id}] Buscando pedidos para client_id: ${client.id}`);
      orders = await fetchOrdersWithItems([client.id]);
      console.log(`[clients/${id}] Pedidos encontrados: ${orders.length}`);
    } else {
      console.warn(`[clients/${id}] ⚠️ client.id está vazio!`);
    }

    // Fallback 1: buscar outros clientes com o mesmo telefone (duplicatas de importação)
    // BUG FIX: antes filtrava o próprio client.id, deixando clientIds vazio quando não há duplicatas
    if (orders.length === 0) {
      const phone = client.phone_normalized || client.phone_canonical;
      if (phone) {
        const { data: clientsWithSamePhone } = await supabase
          .from('clients')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone_normalized', phone);

        if (clientsWithSamePhone && clientsWithSamePhone.length > 0) {
          // Incluir TODOS os ids (incluindo o próprio client.id) — deduplicar com Set
          const allClientIds = [...new Set([client.id, ...clientsWithSamePhone.map((c: any) => c.id)])];
          orders = await fetchOrdersWithItems(allClientIds);
          if (orders.length > 0) {
            console.log(`[clients/${id}] Pedidos via telefone (${phone}): ${orders.length}`);
          }
        }
      }
    }

    // Fallback 2: buscar pedidos órfãos (client_id=null) pelo telefone no metadata
    // Acontece quando o AutoSync salvou o pedido antes do cliente existir no banco
    if (orders.length === 0) {
      const phone = client.phone_canonical || client.phone_normalized || client.phone;
      const fzId = (client.custom_fields as any)?.facilzap_id;

      const orphanOrders: any[] = [];
      const seenIds = new Set<string>();

      // Buscar por telefone no metadata JSONB
      if (phone) {
        const phoneDigits = phone.replace(/\D/g, '');
        const { data: byPhone } = await supabase
          .from('orders')
          .select(`id, external_id, order_number, status, payment_status, payment_method,
            subtotal, discount, shipping, total, tracking_code, tracking_url,
            shipping_address, coupon_code, notes, metadata,
            created_at, updated_at, confirmed_at, shipped_at, delivered_at, cancelled_at, client_id,
            order_items(id, product_name, product_sku, quantity, unit_price, total_price, metadata)`)
          .eq('tenant_id', tenantId)
          .is('client_id', null)
          .or(`metadata->>cliente_telefone.ilike.%${phoneDigits}%,metadata->>cliente_whatsapp.ilike.%${phoneDigits}%,metadata->>cliente_whatsapp_e164.ilike.%${phoneDigits}%`)
          .order('created_at', { ascending: false })
          .limit(50);

        for (const o of (byPhone ?? [])) {
          if (!seenIds.has(o.id)) { seenIds.add(o.id); orphanOrders.push(o); }
        }
      }

      // Buscar por facilzap_id no metadata JSONB
      if (fzId && orphanOrders.length === 0) {
        const { data: byFzId } = await supabase
          .from('orders')
          .select(`id, external_id, order_number, status, payment_status, payment_method,
            subtotal, discount, shipping, total, tracking_code, tracking_url,
            shipping_address, coupon_code, notes, metadata,
            created_at, updated_at, confirmed_at, shipped_at, delivered_at, cancelled_at, client_id,
            order_items(id, product_name, product_sku, quantity, unit_price, total_price, metadata)`)
          .eq('tenant_id', tenantId)
          .is('client_id', null)
          .eq('metadata->>cliente_id_facilzap', String(fzId))
          .order('created_at', { ascending: false })
          .limit(50);

        for (const o of (byFzId ?? [])) {
          if (!seenIds.has(o.id)) { seenIds.add(o.id); orphanOrders.push(o); }
        }
      }

      if (orphanOrders.length > 0) {
        orders = orphanOrders.map((o: any) => {
          const fromTable = (o.order_items ?? []) as any[];
          const fromMeta  = (o.metadata?.itens ?? o.metadata?.items ?? []) as any[];
          const items = fromTable.length > 0
            ? fromTable.map(normalizeOrderItem)
            : fromMeta.map(normalizeMetaItem);
          return { ...o, items, order_items: undefined };
        });
        console.log(`[clients/${id}] Pedidos órfãos via metadata (telefone/fzId): ${orders.length}`);

        // Vincular esses pedidos ao cliente agora (lazy relink)
        try {
          const ids = orphanOrders.map((o: any) => o.id);
          await supabase.from('orders').update({ client_id: client.id }).in('id', ids).eq('tenant_id', tenantId);
          console.log(`[clients/${id}] Revinculados ${ids.length} pedidos órfãos ao client ${client.id}`);
        } catch { /* silencioso */ }
      }
    }

    // Fallback 3: buscar pedidos pelo external_id do cliente (ID da loja)
    if (orders.length === 0 && client.external_id) {
      const { data: ordersExt } = await supabase
        .from('orders')
        .select(`id, external_id, order_number, status, payment_status, payment_method,
          subtotal, discount, shipping, total, tracking_code, metadata,
          created_at, client_id,
          order_items(id, product_name, product_sku, quantity, unit_price, total_price, metadata)`)
        .eq('tenant_id', tenantId)
        .eq('external_client_id', client.external_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (ordersExt && ordersExt.length > 0) {
        orders = ordersExt.map((o: any) => {
          const fromTable = (o.order_items ?? []) as any[];
          const fromMeta  = (o.metadata?.itens ?? o.metadata?.items ?? []) as any[];
          const items = fromTable.length > 0
            ? fromTable.map(normalizeOrderItem)
            : fromMeta.map(normalizeMetaItem);
          return { ...o, items, order_items: undefined };
        });
        console.log(`[clients/${id}] Pedidos via external_client_id (${client.external_id}): ${orders.length}`);
      }
    }

    console.log(`[clients/${id}] Total pedidos retornados: ${orders.length}`);

    const responseData = {
      ...client,
      recent_orders: orders,
    };

    console.log(`[clients/${id}] ✅ Retornando response com recent_orders: ${responseData.recent_orders?.length ?? 0} item(s)`);

    return NextResponse.json({
      data: responseData,
    });
  } catch (error: any) {
    console.error('Erro ao buscar cliente:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/clients/[id]
 *
 * Edição manual de dados do cliente pelo atendente.
 * Campos aceitos: name (obrigatório), email, tags.
 *
 * Ao editar o nome, o campo name_manual é gravado, garantindo que
 * sincronizações futuras não sobrescrevam a escolha do atendente.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const body = await request.json();
    const { name, email, tags } = body as {
      name?: string;
      email?: string;
      tags?: string[];
    };

    if (!name?.trim() && email === undefined && tags === undefined) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar foi fornecido' },
        { status: 400 }
      );
    }

    // Montar apenas os campos que vieram na requisição
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (name?.trim()) {
      updates.name = name.trim();
      // name_manual: gravado apenas se a migration 011 foi aplicada.
      // Se a coluna não existir, o update falhará — capturamos e retentamos sem ela.
      updates.name_manual = name.trim();
    }
    if (email !== undefined) {
      updates.email = email?.trim() || null;
    }
    if (tags !== undefined) {
      updates.tags = tags;
    }

    // Garantir que o cliente pertence ao tenant (segurança RLS)
    let { data: updated, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, name, email, tags, phone, updated_at')
      .single();

    // Fallback: se falhou por causa de name_manual inexistente, tentar sem ela
    if (error && error.message?.includes('name_manual')) {
      const { name_manual: _dropped, ...updatesWithoutManual } = updates as any;
      const retry = await supabase
        .from('clients')
        .update(updatesWithoutManual)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id, name, email, tags, phone, updated_at')
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[PATCH /api/clients] Erro ao atualizar:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    console.error('[PATCH /api/clients] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: error.message },
      { status: 500 }
    );
  }
}
