import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
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
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    // Verificar token e obter tenant_id
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;
    const tenantId = profile.tenant_id;

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

    // Estratégia 2: Buscar pela conversation_id e pegar o telefone
    if (!client) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, contact_phone, contact_name')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (conversation?.contact_phone) {
        const phoneCanonical = PhoneNormalizer.canonical(conversation.contact_phone);
        
        // Buscar cliente pelo telefone canônico
        const { data: phoneClient } = await supabase
          .from('clients')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('phone_canonical', phoneCanonical)
          .maybeSingle();

        if (phoneClient) {
          client = phoneClient;
        } else {
          // Cliente não existe na base, criar um "virtual" com dados da conversa
          client = {
            id: null,
            name: conversation.contact_name || 'Visitante',
            phone: conversation.contact_phone,
            phone_canonical: phoneCanonical,
            status: 'novo',
            is_virtual: true, // Flag para indicar que não está na base
          };
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

    // Buscar pedidos pelo client_id
    let orders: any[] = [];
    
    // Se temos um client.id real, buscar pedidos diretamente
    if (client.id) {
      const { data: ordersById } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(50);

      orders = ordersById || [];
    }
    
    // Fallback: Se não encontrou pedidos mas temos phone_canonical,
    // tentar buscar cliente com mesmo telefone que tenha pedidos
    if (orders.length === 0 && client.phone_canonical) {
      const { data: clientsWithSamePhone } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_canonical', client.phone_canonical);
      
      if (clientsWithSamePhone && clientsWithSamePhone.length > 0) {
        const clientIds = clientsWithSamePhone.map(c => c.id);
        
        const { data: ordersByPhoneClients } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('client_id', clientIds)
          .order('created_at', { ascending: false })
          .limit(50);
        
        orders = ordersByPhoneClients || [];
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
