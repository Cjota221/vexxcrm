import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchAllProducts, fetchAllClients, fetchAllOrders } from '@/lib/services/facilzap.service';

/**
 * POST /api/facilzap/sync
 * Sincroniza produtos, clientes e pedidos do FacilZap para o banco.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Criar cliente do Supabase com service key (bypassa RLS)
    const supabaseAdmin = createServerSupabaseClient();
    
    // Criar cliente com o token do usuário apenas para validação
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.log('❌ Auth error:', authError);
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    console.log('✅ User authenticated:', user.email);

    // Buscar profile e tenant usando admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.log('❌ Profile error:', profileError);
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    console.log('✅ Profile found, tenant_id:', profile.tenant_id);

    // Buscar configurações do FacilZap
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('facilzap_token')
      .eq('id', profile.tenant_id)
      .single();

    console.log('🔍 Tenant data:', { tenant, tenantError, tenant_id: profile.tenant_id });

    if (!tenant?.facilzap_token) {
      console.error('❌ Token não encontrado:', { 
        tenant, 
        tenantError, 
        tenant_id: profile.tenant_id,
        has_tenant: !!tenant,
        facilzap_token: tenant?.facilzap_token ? 'EXISTS' : 'NULL'
      });
      return NextResponse.json({ 
        error: 'Token do FacilZap não configurado',
        debug: { 
          has_tenant: !!tenant,
          tenant_id: profile.tenant_id,
          error: tenantError?.message 
        }
      }, { status: 400 });
    }

    const facilzapConfig = {
      token: tenant.facilzap_token,
      storeUrl: '', // Site URL não é obrigatório
    };

    const results = {
      products: 0,
      clients: 0,
      orders: 0,
      errors: [] as string[],
    };

    // 1. Sincronizar PRODUTOS (em batch para performance)
    try {
      console.log('🔄 Sincronizando produtos do FacilZap...');
      const products = await fetchAllProducts(facilzapConfig);
      
      // Limitar a 20 produtos por vez para evitar timeout
      const productsToSync = products.slice(0, 20);
      
      if (productsToSync.length > 0) {
        const productsData = productsToSync.map(product => ({
          tenant_id: profile.tenant_id,
          external_id: product.external_id,
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          image_url: product.image_url,
          category: product.category,
          is_active: product.is_active,
          synced_at: new Date().toISOString(),
        }));

        const { data, error } = await supabaseAdmin
          .from('products')
          .upsert(productsData, {
            onConflict: 'tenant_id,external_id',
          });

        if (error) {
          console.error('❌ Erro ao inserir produtos:', error);
          results.errors.push(`Produtos batch: ${error.message}`);
        } else {
          results.products = productsToSync.length;
          console.log(`✅ ${results.products} produtos sincronizados`);
        }
      }
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar produtos:', error);
      results.errors.push(`Produtos: ${error.message}`);
    }

    // 2. Sincronizar CLIENTES (em batch para performance)
    try {
      console.log('🔄 Sincronizando clientes do FacilZap...');
      const clients = await fetchAllClients(facilzapConfig);
      
      // Limitar a 20 clientes por vez
      const clientsToSync = clients.slice(0, 20);
      
      const validClients = clientsToSync
        .map(client => {
          const rawPhone = client.whatsapp || client.telefone || client.celular || '';
          const phoneNormalized = rawPhone.replace(/\D/g, '');
          
          if (!phoneNormalized) {
            results.errors.push(`Cliente ${client.nome}: sem telefone válido`);
            return null;
          }
          
          return {
            tenant_id: profile.tenant_id,
            phone: phoneNormalized,
            phone_normalized: phoneNormalized,
            name: client.nome,
            email: client.email || null,
            source: 'facilzap',
            status: 'active',
            notes: JSON.stringify({
              endereco: client.endereco,
              bairro: client.bairro,
              cidade: client.cidade,
              estado: client.estado,
              cep: client.cep,
              cpf_cnpj: client.cpf_cnpj,
              origem: client.origem,
              ultima_compra: client.ultima_compra,
            }),
          };
        })
        .filter(Boolean);

      if (validClients.length > 0) {
        const { error } = await supabaseAdmin
          .from('clients')
          .upsert(validClients as any, {
            onConflict: 'tenant_id,phone_normalized',
          });

        if (error) {
          console.error('❌ Erro ao inserir clientes:', error);
          results.errors.push(`Clientes batch: ${error.message}`);
        } else {
          results.clients = validClients.length;
          console.log(`✅ ${results.clients} clientes sincronizados`);
        }
      }
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar clientes:', error);
      results.errors.push(`Clientes: ${error.message}`);
    }

    // 3. Sincronizar PEDIDOS (limitado para evitar timeout)
    try {
      console.log('🔄 Sincronizando pedidos do FacilZap...');
      const orders = await fetchAllOrders(facilzapConfig);
      
      // Limitar a 10 pedidos por vez (pedidos têm mais complexidade)
      const ordersToSync = orders.slice(0, 10);
      
      for (const order of ordersToSync) {
        // Buscar cliente pelo telefone
        const rawPhone = order.cliente?.telefone || '';
        const phoneNormalized = rawPhone.replace(/\D/g, '');
        
        let clientId = null;
        if (phoneNormalized) {
          const { data: client } = await supabaseAdmin
            .from('clients')
            .select('id')
            .eq('tenant_id', profile.tenant_id)
            .eq('phone_normalized', phoneNormalized)
            .single();
          
          clientId = client?.id;
        }

        // Status de pagamento
        const paymentStatus = order.status_pago ? 'paid' : 'pending';
        
        // Status de entrega
        let orderStatus = 'pending';
        if (order.status_entregue) {
          orderStatus = 'delivered';
        } else if (order.status_pago) {
          orderStatus = 'confirmed';
        }

        const { data: insertedOrder, error } = await supabaseAdmin
          .from('orders')
          .upsert({
            tenant_id: profile.tenant_id,
            client_id: clientId,
            external_id: String(order.id),
            order_number: order.codigo || String(order.id),
            status: orderStatus,
            payment_status: paymentStatus,
            payment_method: order.forma_pagamento || null,
            total: order.total || order.valor_total || 0,
            notes: JSON.stringify({
              status_pedido: order.status_pedido,
              status_pago: order.status_pago,
              status_entregue: order.status_entregue,
              data: order.data,
              cliente_id: order.cliente_id || order.id_cliente,
            }),
            synced_at: new Date().toISOString(),
          }, {
            onConflict: 'tenant_id,external_id',
          })
          .select('id')
          .single();

        if (error) {
          console.error('❌ Erro ao inserir pedido:', error);
          results.errors.push(`Pedido ${order.codigo || order.id}: ${error.message}`);
        } else {
          results.orders++;

          // Inserir itens do pedido em batch
          if (insertedOrder && order.itens && order.itens.length > 0) {
            const orderItems = order.itens.map(item => ({
              tenant_id: profile.tenant_id,
              order_id: insertedOrder.id,
              product_name: item.nome,
              quantity: item.quantidade,
              unit_price: item.preco_unitario || item.valor || 0,
              total_price: item.quantidade * (item.preco_unitario || item.valor || 0),
            }));

            await supabaseAdmin.from('order_items').insert(orderItems);
          }
        }
      }

      console.log(`✅ ${results.orders} pedidos sincronizados`);
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar pedidos:', error);
      results.errors.push(`Pedidos: ${error.message}`);
    }

    // Retornar resultado
    return NextResponse.json({
      success: true,
      results,
      message: `Sincronização concluída: ${results.products} produtos, ${results.clients} clientes, ${results.orders} pedidos`,
    });

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    return NextResponse.json({ 
      error: 'Erro ao sincronizar', 
      details: error.message 
    }, { status: 500 });
  }
}
