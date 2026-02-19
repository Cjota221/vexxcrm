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

      // Normalizar: renomear order_items → items
      return (rawOrders ?? []).map((o: any) => ({
        ...o,
        items: (o.order_items ?? []).map((item: any) => ({
          product_name: item.product_name,
          nome: item.product_name,
          product_sku: item.product_sku,
          quantity: item.quantity,
          price: item.unit_price,
          unit_price: item.unit_price,
          total_price: item.total_price,
          metadata: item.metadata,
        })),
        order_items: undefined,
      }));
    };

    // Se temos um client.id real, buscar pedidos diretamente
    if (client.id) {
      orders = await fetchOrdersWithItems([client.id]);
    }

    // Fallback: Se não encontrou pedidos mas temos phone_canonical,
    // tentar buscar clientes com mesmo telefone que tenham pedidos
    if (orders.length === 0 && client.phone_canonical) {
      const { data: clientsWithSamePhone } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_canonical', client.phone_canonical);

      if (clientsWithSamePhone && clientsWithSamePhone.length > 0) {
        const clientIds = clientsWithSamePhone.map((c: any) => c.id);
        orders = await fetchOrdersWithItems(clientIds);
      }
    }

    return NextResponse.json({
      data: {
        ...client,
        recent_orders: orders,
      },
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
