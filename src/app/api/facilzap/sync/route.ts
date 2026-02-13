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
    try { body = await request.json(); } catch { body = {}; }
    const entity = body.entity || 'all';
    const page = body.page || 1;
    console.log('[SYNC] entity=' + entity + ' page=' + page);
    const supabaseAdmin = createServerSupabaseClient();
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: 'Bearer ' + token } } }
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
    }
    const { data: profile } = await supabaseAdmin.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }
    const { data: tenantData } = await supabaseAdmin.from('tenants').select('facilzap_token').eq('id', profile.tenant_id).single();
    if (!tenantData?.facilzap_token) {
      return NextResponse.json({ error: 'Token FacilZap nao configurado', needsConfig: true }, { status: 400 });
    }
    const facilzapConfig = { token: tenantData.facilzap_token, storeUrl: '' };
    const tenantId = profile.tenant_id;
    const results = { products: 0, clients: 0, orders: 0, errors: [] as string[], hasMore: { products: false, clients: false, orders: false } };

    // PRODUTOS
    if (entity === 'all' || entity === 'products') {
      try {
        const { products, hasMore } = await fetchProducts(facilzapConfig, page, 100);
        results.hasMore.products = hasMore;
        if (products.length > 0) {
          const data = (products as any[]).map((p: any) => {
            // Garantir que stock é um inteiro válido (INTEGER max = 2147483647)
            let stock = parseInt(String(p.stock ?? 0), 10);
            if (isNaN(stock) || stock < -1 || stock > 2147483647) stock = 0;
            return {
              tenant_id: tenantId, external_id: p.external_id || String(p.id),
              sku: p.sku || null, name: p.name || p.nome || 'Sem nome',
              description: p.description || null, price: Number(p.price) || 0,
              stock, image_url: p.image_url || null,
              category: p.category || null, is_active: p.is_active !== false,
              custom_fields: p.custom_fields || {},
              synced_at: new Date().toISOString(),
            };
          });
          const { error } = await supabaseAdmin.from('products').upsert(data, { onConflict: 'tenant_id,external_id' });
          if (error && error.code === '42P10') {
            const ids = data.map((p: any) => p.external_id);
            await supabaseAdmin.from('products').delete().eq('tenant_id', tenantId).in('external_id', ids);
            const { error: ie } = await supabaseAdmin.from('products').insert(data);
            if (ie) results.errors.push('Produtos: ' + ie.message);
            else results.products = data.length;
          } else if (error) {
            results.errors.push('Produtos: ' + error.message);
          } else {
            results.products = data.length;
          }
        }
      } catch (e: any) { results.errors.push('Produtos: ' + e.message); }
    }

    // CLIENTES
    if (entity === 'all' || entity === 'clients') {
      try {
        const { clients, hasMore } = await fetchClients(facilzapConfig, page, 100);
        results.hasMore.clients = hasMore;
        if (clients.length > 0) {
          const mapped = clients.map((c: any) => {
            const ph = (c.whatsapp || c.telefone || c.celular || '').replace(/\D/g, '');
            if (!ph) return null;
            return {
              tenant_id: tenantId, phone: ph, phone_normalized: ph,
              name: c.nome || 'Sem nome', email: c.email || null,
              source: 'facilzap', status: 'active',
              notes: JSON.stringify({ endereco: c.endereco, bairro: c.bairro, cidade: c.cidade, estado: c.estado, cep: c.cep, cpf_cnpj: c.cpf_cnpj, origem: c.origem, ultima_compra: c.ultima_compra }),
            };
          }).filter(Boolean);
          // Deduplicar por phone_normalized (evita "cannot affect row a second time")
          const seen = new Set<string>();
          const valid = mapped.filter((c: any) => {
            const key = c.phone_normalized;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (valid.length > 0) {
            const { error } = await supabaseAdmin.from('clients').upsert(valid as any, { onConflict: 'tenant_id,phone_normalized' });
            if (error) results.errors.push('Clientes: ' + error.message);
            else results.clients = valid.length;
          }
        }
      } catch (e: any) { results.errors.push('Clientes: ' + e.message); }
    }

    // PEDIDOS
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
          const data = orders.map((o: any) => {
            const ph = (o.cliente?.telefone || '').replace(/\D/g, '');
            let os = 'pending';
            if (o.status_entregue) os = 'delivered';
            else if (o.status_pago) os = 'confirmed';
            // Calcular total de itens
            const totalItems = (o.itens || []).reduce((sum: number, it: any) => sum + (it.quantidade || 1), 0);
            // Validar data do pedido
            let orderDate: string;
            try {
              const d = o.data ? new Date(o.data) : null;
              orderDate = (d && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString();
            } catch { orderDate = new Date().toISOString(); }
            // Validar total como número
            const total = Number(o.total || o.valor_total || 0) || 0;
            return {
              tenant_id: tenantId, client_id: ph ? cm.get(ph) || null : null,
              external_id: String(o.id), order_number: o.codigo || String(o.id),
              status: os, payment_status: o.status_pago ? 'paid' : 'pending',
              payment_method: o.forma_pagamento || null,
              total,
              created_at: orderDate,
              metadata: {
                cliente_nome: o.cliente?.nome || null,
                cliente_telefone: o.cliente?.telefone || null,
                total_items: totalItems,
                itens: (o.itens || []).slice(0, 50).map((it: any) => ({
                  nome: it.nome || '', quantidade: it.quantidade || 1,
                  valor: Number(it.valor || it.preco_unitario || 0) || 0,
                })),
              },
              notes: JSON.stringify({ status_pedido: o.status_pedido, status_pago: o.status_pago, status_entregue: o.status_entregue, data: o.data }),
              synced_at: new Date().toISOString(),
            };
          });
          // Deduplicar por external_id
          const seenOrders = new Set<string>();
          const uniqueData = data.filter((o: any) => {
            if (seenOrders.has(o.external_id)) return false;
            seenOrders.add(o.external_id);
            return true;
          });
          const { error } = await supabaseAdmin.from('orders').upsert(uniqueData, { onConflict: 'tenant_id,external_id' });
          if (error && error.code === '42P10') {
            const ids = uniqueData.map((o: any) => o.external_id);
            await supabaseAdmin.from('orders').delete().eq('tenant_id', tenantId).in('external_id', ids);
            const { error: ie } = await supabaseAdmin.from('orders').insert(uniqueData);
            if (ie) results.errors.push('Pedidos: ' + ie.message);
            else results.orders = uniqueData.length;
          } else if (error) {
            results.errors.push('Pedidos: ' + error.message);
          } else {
            results.orders = uniqueData.length;
          }
        }
      } catch (e: any) { results.errors.push('Pedidos: ' + e.message); }
    }

    const duration = Date.now() - startTime;
    return NextResponse.json({ success: true, results, duration_ms: duration, page, entity, message: 'Sync p.' + page + ': ' + results.products + ' produtos, ' + results.clients + ' clientes, ' + results.orders + ' pedidos' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao sincronizar', details: error.message, duration_ms: Date.now() - startTime }, { status: 500 });
  }
}
