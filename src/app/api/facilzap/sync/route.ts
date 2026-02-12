import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchProducts, fetchClients, fetchOrders } from '@/lib/services/facilzap.service';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    let body: { entity?: string; page?: number } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const entity = body.entity || 'all';
    const page = body.page || 1;

    console.log('[SYNC] Iniciando: entity=' + entity + ', page=' + page);

    const supabaseAdmin = createServerSupabaseClient();

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: 'Bearer ' + token },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }

    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('facilzap_token')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenantData?.facilzap_token) {
      return NextResponse.json({
        error: 'Token do FacilZap nao configurado',
        needsConfig: true,
      }, { status: 400 });
    }

    const facilzapConfig = { token: tenantData.facilzap_token, storeUrl: '' };

    const results = {
      products: 0,
      clients: 0,
      orders: 0,
      errors: [] as string[],
      hasMore: { products: false, clients: false, orders: false },
    };

    const tenantId = profile.tenant_id;

    if (entity === 'all' || entity === 'products') {
      try {
        const { products, hasMore } = await fetchProducts(facilzapConfig, page, 100);
        results.hasMore.products = hasMore;
        if (products.length > 0) {
          const productsData = (products as any[]).map((p: any) => ({
            tenant_id: tenantId,
            external_id: p.external_id || String(p.id),
            sku: p.sku || null,
            name: p.name || p.nome || 'Sem nome',
            description: p.description || null,
            price: p.price || 0,
            stock: p.stock ?? 0,
            image_url: p.image_url || null,
            category: p.category || null,
            is_active: p.is_active !== false,
            synced_at: new Date().toISOString(),
          }));
          const { error } = await supabaseAdmin.from('products').upsert(productsData, { onConflict: 'tenant_id,external_id' });
          if (error) {
            if (error.code === '42P10') {
              let count = 0;
              for (const p of productsData) {
                const { data: ex } = await supabaseAdmin.from('products').select('id').eq('tenant_id', p.tenant_id).eq('external_id', p.external_id).maybeSingle();
                if (ex) { await supabaseAdmin.from('products').update(p).eq('id', ex.id); count++; }
                else { const { error: ie } = await supabaseAdmin.from('products').insert(p); if (!ie) count++; }
              }
              results.products = count;
            } else { results.errors.push('Produtos: ' + error.message); }
          } else { results.products = productsData.length; }
        }
      } catch (error: any) { results.errors.push('Produtos: ' + error.message); }
    }

    if (entity === 'all' || entity === 'clients') {
      try {
        const { clients, hasMore } = await fetchClients(facilzapConfig, page, 100);
        results.hasMore.clients = hasMore;
        if (clients.length > 0) {
          const validClients = clients.map((c: any) => {
            const ph = (c.whatsapp || c.telefone || c.celular || '').replace(/\D/g, '');
            if (!ph) return null;
            return {
              tenant_id: tenantId, phone: ph, phone_normalized: ph,
              name: c.nome || 'Sem nome', email: c.email || null,
              source: 'facilzap', status: 'active',
              notes: JSON.stringify({ endereco: c.endereco, bairro: c.bairro, cidade: c.cidade, estado: c.estado, cep: c.cep, cpf_cnpj: c.cpf_cnpj, origem: c.origem, ultima_compra: c.ultima_compra }),
            };
          }).filter(Boolean);
          if (validClients.length > 0) {
            const { error } = await supabaseAdmin.from('clients').upsert(validClients as any, { onConflict: 'tenant_id,phone_normalized' });
            if (error) { results.errors.push('Clientes: ' + error.message); }
            else { results.clients = validClients.length; }
          }
        }
      } catch (error: any) { results.errors.push('Clientes: ' + error.message); }
    }

    if (entity === 'all' || entity === 'orders') {
      try {
        const df = new Date().toISOString().split('T')[0];
        const di = new Date(); di.setFullYear(di.getFullYear() - 2);
        const dis = di.toISOString().split('T')[0];
        const { orders, hasMore } = await fetchOrders(facilzapConfig, page, 100, { data_inicial: dis, data_final: df });
        results.hasMore.orders = hasMore;
        if (orders.length > 0) {
          const { data: ec } = await supabaseAdmin.from('clients').select('id, phone_normalized').eq('tenant_id', tenantId);
          const cm = new Map((ec || []).map((c: any) => [c.phone_normalized, c.id]));
          const ordersData = orders.map((o: any) => {
            const ph = (o.cliente?.telefone || '').replace(/\D/g, '');
            const cid = ph ? cm.get(ph) || null : null;
            const ps = o.status_pago ? 'paid' : 'pending';
            let os = 'pending';
            if (o.status_entregue) os = 'delivered';
            else if (o.status_pago) os = 'confirmed';
            return {
              tenant_id: tenantId, client_id: cid, external_id: String(o.id),
              order_number: o.codigo || String(o.id), status: os,
              payment_status: ps, payment_method: o.forma_pagamento || null,
              total: o.total || o.valor_total || 0,
              notes: JSON.stringify({ status_pedido: o.status_pedido, status_pago: o.status_pago, status_entregue: o.status_entregue, data: o.data, cliente_id: o.cliente_id || o.id_cliente }),
              synced_at: new Date().toISOString(),
            };
          });
          const { error } = await supabaseAdmin.from('orders').upsert(ordersData, { onConflict: 'tenant_id,external_id' });
          if (error) {
            if (error.code === '42P10') {
              let count = 0;
              for (const o of ordersData) {
                const { data: ex } = await supabaseAdmin.from('orders').select('id').eq('tenant_id', o.tenant_id).eq('external_id', o.external_id).maybeSingle();
                if (ex) { await supabaseAdmin.from('orders').update(o).eq('id', ex.id); count++; }
                else { const { error: ie } = await supabaseAdmin.from('orders').insert(o); if (!ie) count++; }
              }
              results.orders = count;
            } else { results.errors.push('Pedidos: ' + error.message); }
          } else { results.orders = ordersData.length; }
        }
      } catch (error: any) { results.errors.push('Pedidos: ' + error.message); }
    }

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true, results, duration_ms: duration, page, entity,
      message: 'Sync p.' + page + ': ' + results.products + ' produtos, ' + results.clients + ' clientes, ' + results.orders + ' pedidos',
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return NextResponse.json({ error: 'Erro ao sincronizar', details: error.message, duration_ms: duration }, { status: 500 });
  }
}
