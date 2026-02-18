import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchProducts, fetchOrders, fetchClients } from '@/lib/services/facilzap.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * POST /api/facilzap/auto-sync
 *
 * Sincronização automática leve — busca apenas a primeira página de cada entidade
 * (pedidos + produtos + clientes recentes) da FacilZap e faz upsert no banco.
 *
 * Chamado automaticamente pelo hook useAutoSync a cada 5 minutos.
 * Não faz sync completo — apenas novos dados para manter atualizado.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[AutoSync] 🔄 v2.1 - CPF+Nome matching enabled');
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil nao encontrado' }, { status: 404 });
    }

    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('facilzap_token')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenantData?.facilzap_token) {
      return NextResponse.json({ error: 'Token FacilZap nao configurado' }, { status: 400 });
    }

    // ── Rate limiting: evitar syncs simultâneos ──
    const rl = checkRateLimit(`auto-sync:${profile.tenant_id}`, RATE_LIMITS.AUTO_SYNC);
    if (!rl.allowed) {
      return NextResponse.json({ 
        message: 'Sync já em andamento, aguarde', 
        skipped: true 
      });
    }

    const facilzapConfig = { token: tenantData.facilzap_token };
    const tenantId = profile.tenant_id;
    const results = { 
      products: 0, 
      clients: 0, 
      orders: 0, 
      relinked: 0, 
      stats_updated: 0,
      errors: [] as string[] 
    };

    // ─── SYNC RÁPIDO: apenas página 1 de cada (dados mais recentes) ───

    // 1. PRODUTOS (página 1)
    try {
      const { products } = await fetchProducts(facilzapConfig, 1, 50);
      if (products.length > 0) {
        const data = (products as any[]).map((p: any) => {
          let stock = parseInt(String(p.stock ?? 0), 10);
          if (isNaN(stock) || stock < -1 || stock > 2147483647) stock = 0;
          const images = Array.isArray(p.images) ? p.images.filter((i: string) => !!i) : [];
          return {
            tenant_id: tenantId,
            external_id: p.external_id || String(p.id),
            sku: typeof p.sku === 'object' ? (p.sku?.nome || p.sku?.sku || JSON.stringify(p.sku)) : (p.sku || null),
            name: p.name || p.nome || 'Sem nome',
            description: p.description || null,
            price: Number(p.price) || 0,
            compare_at_price: Number(p.compare_at_price) || null,
            cost: Number(p.cost) || null,
            stock,
            image_url: p.image_url || null,
            images,
            category: typeof p.category === 'object' ? (p.category?.nome || JSON.stringify(p.category)) : (p.category || null),
            is_active: p.is_active !== false,
            custom_fields: { source: 'auto-sync' },
            synced_at: new Date().toISOString(),
          };
        });
        const { error } = await supabaseAdmin.from('products').upsert(data, { onConflict: 'tenant_id,external_id' });
        if (error) {
          // Fallback: delete + insert
          const ids = data.map((p: any) => p.external_id);
          await supabaseAdmin.from('products').delete().eq('tenant_id', tenantId).in('external_id', ids);
          const { error: ie } = await supabaseAdmin.from('products').insert(data);
          if (ie) results.errors.push('Produtos: ' + ie.message);
          else results.products = data.length;
        } else {
          results.products = data.length;
        }
      }
    } catch (e: any) {
      results.errors.push('Produtos: ' + e.message);
    }

    // 2. CLIENTES (página 1)
    try {
      const { clients } = await fetchClients(facilzapConfig, 1, 50);
      if (clients.length > 0) {
        const mapped = clients.map((c: any) => {
          const ph = (c.whatsapp_e164 || c.whatsapp || c.telefone || c.celular || '').replace(/\D/g, '');
          if (!ph) return null;
          const phoneCanonical = PhoneNormalizer.canonical(ph);
          const phoneDisplay = PhoneNormalizer.normalize(ph);
          let clientStatus = 'active';
          if (c.status === 'inativo' || c.status === 'inactive') clientStatus = 'inactive';
          return {
            tenant_id: tenantId,
            phone: phoneDisplay,
            phone_normalized: phoneCanonical,
            name: c.nome || 'Sem nome',
            email: c.email || null,
            source: 'facilzap',
            status: clientStatus,
            address_city: c.cidade || null,
            address_state: c.estado || c.uf || null,
            custom_fields: { 
              facilzap_id: c.id || null, 
              cpf_cnpj: c.cpf_cnpj || null,
              source: 'auto-sync' 
            },
          };
        }).filter(Boolean);

        const seen = new Set<string>();
        const valid = mapped.filter((c: any) => {
          if (seen.has(c.phone_normalized)) return false;
          seen.add(c.phone_normalized);
          return true;
        });
        if (valid.length > 0) {
          const { error } = await supabaseAdmin.from('clients').upsert(valid as any, { onConflict: 'tenant_id,phone_normalized' });
          if (error) results.errors.push('Clientes: ' + error.message);
          else results.clients = valid.length;
        }
      }
    } catch (e: any) {
      results.errors.push('Clientes: ' + e.message);
    }

    // 3. PEDIDOS (últimos 30 dias, página 1)
    try {
      const parseNum = (v: any): number => { const n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
      const isTruthy = (v: any): boolean => v === '1' || v === 1 || v === true || v === 'true' || v === 'sim';

      const df = new Date().toISOString().split('T')[0];
      const di = new Date();
      di.setDate(di.getDate() - 30); // Apenas últimos 30 dias para auto-sync
      const dis = di.toISOString().split('T')[0];

      console.log(`[AutoSync] Buscando pedidos de ${dis} até ${df}...`);
      const { orders } = await fetchOrders(facilzapConfig, 1, 100, { data_inicial: dis, data_final: df });
      console.log(`[AutoSync] Recebidos ${orders.length} pedidos da API`);
      if (orders.length > 0) {
        // Buscar clientes existentes para linkagem
        const { data: ec } = await supabaseAdmin.from('clients').select('id, phone_normalized, phone, name, email, custom_fields').eq('tenant_id', tenantId);
        const cm = new Map<string, string>();
        const fzIdMap = new Map<string, string>();
        const cpfMap = new Map<string, string>();
        const emailMap = new Map<string, string>();
        const nameMap = new Map<string, string>();
        
        for (const c of (ec || [])) {
          for (const raw of [c.phone_normalized, c.phone]) {
            if (!raw) continue;
            const cleaned = raw.replace(/\D/g, '');
            if (cleaned) {
              cm.set(cleaned, c.id);
              cm.set(PhoneNormalizer.canonical(cleaned), c.id);
            }
          }
          const fzId = (c.custom_fields as any)?.facilzap_id;
          if (fzId) fzIdMap.set(String(fzId), c.id);
          const cpf = (c.custom_fields as any)?.cpf || (c.custom_fields as any)?.cpf_cnpj;
          if (cpf) {
            const cleanCpf = String(cpf).replace(/\D/g, '');
            if (cleanCpf) cpfMap.set(cleanCpf, c.id);
          }
          if (c.email) emailMap.set(c.email.toLowerCase().trim(), c.id);
          if (c.name && c.name !== 'Sem nome') nameMap.set(c.name.toLowerCase().trim(), c.id);
        }
        
        console.log(`[AutoSync] Maps: ${cm.size} phones, ${fzIdMap.size} fz_ids, ${cpfMap.size} cpfs, ${emailMap.size} emails, ${nameMap.size} names`);

        console.log(`[AutoSync] Mapeando pedidos para inserção...`);
        const data = orders.map((o: any) => {
          const rawPhone = o.cliente?.whatsapp_e164 || o.cliente?.whatsapp || o.cliente?.telefone || '';
          const ph = rawPhone.replace(/\D/g, '');

          let clientId: string | null = null;
          // 1. Telefone
          if (ph && ph.length >= 8) {
            clientId = cm.get(ph) || cm.get(PhoneNormalizer.canonical(ph)) || null;
          }
          // 2. FacilZap ID
          if (!clientId && o.cliente?.id) {
            clientId = fzIdMap.get(String(o.cliente.id)) || null;
          }
          // 3. CPF/CNPJ
          if (!clientId && o.cliente?.cpf_cnpj) {
            const cleanCpf = String(o.cliente.cpf_cnpj).replace(/\D/g, '');
            if (cleanCpf) clientId = cpfMap.get(cleanCpf) || null;
          }
          // 4. Email
          if (!clientId && o.cliente?.email) {
            clientId = emailMap.get(o.cliente.email.toLowerCase().trim()) || null;
          }
          // 5. Nome
          if (!clientId && o.cliente?.nome && o.cliente.nome !== 'Sem nome') {
            clientId = nameMap.get(o.cliente.nome.toLowerCase().trim()) || null;
          }

          let orderStatus = 'pending';
          if (isTruthy(o.status_entregue)) orderStatus = 'delivered';
          else if (isTruthy(o.status_despachado)) orderStatus = 'shipped';
          else if (isTruthy(o.status_separado) || isTruthy(o.status_em_separacao)) orderStatus = 'processing';
          else if (isTruthy(o.status_pago)) orderStatus = 'confirmed';
          else if (o.status === 'cancelado') orderStatus = 'cancelled';

          const paymentStatus = isTruthy(o.status_pago) ? 'paid' : 'pending';

          let paymentMethod: string | null = null;
          if (typeof o.metodo_pagamento === 'string') paymentMethod = o.metodo_pagamento;
          else if (typeof o.metodo_pagamento === 'object' && o.metodo_pagamento?.nome) paymentMethod = o.metodo_pagamento.nome;

          const items = o.itens || o.produtos || [];
          const totalItems = items.reduce((sum: number, it: any) => sum + (parseNum(it.quantidade) || 1), 0);

          let orderDate: string;
          try {
            const d = o.data ? new Date(o.data) : null;
            orderDate = d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
          } catch { orderDate = new Date().toISOString(); }

          const subtotal = parseNum(o.subtotal);
          const discount = parseNum(o.desconto_total || o.desconto);
          const shipping = parseNum(o.valor_frete);
          const total = parseNum(o.total || o.valor_total) || (subtotal - discount + shipping);

          const orderNumber = (() => {
            const codigo = o.codigo || o.numero;
            return codigo ? String(codigo).trim() || String(o.id) : String(o.id);
          })();

          return {
            tenant_id: tenantId,
            client_id: clientId,
            external_id: String(o.id),
            order_number: orderNumber,
            status: orderStatus,
            payment_status: paymentStatus,
            payment_method: paymentMethod,
            subtotal, discount, shipping, total,
            tracking_code: o.codigo_rastreio || null,
            notes: o.observacoes || null,
            coupon_code: o.cupom_info?.codigo || null,
            created_at: orderDate,
            metadata: {
              cliente_nome: o.cliente?.nome || null,
              cliente_telefone: rawPhone || null,
              cliente_whatsapp: o.cliente?.whatsapp || null,
              cliente_whatsapp_e164: o.cliente?.whatsapp_e164 || null,
              cliente_cpf_cnpj: o.cliente?.cpf_cnpj || null,
              cliente_email: o.cliente?.email || null,
              cliente_id_facilzap: o.cliente?.id || null,
              total_items: totalItems,
              itens: items.slice(0, 50).map((it: any) => ({
                id: it.id || null,
                produto_id: it.produto_id || null,
                nome: it.nome || it.name || '',
                quantidade: parseNum(it.quantidade) || 1,
                valor: parseNum(it.preco_unitario || it.valor),
                variacao: it.variacao || null,
                sku: it.sku || null,
              })),
              source: 'auto-sync',
            },
            synced_at: new Date().toISOString(),
          };
        });

        // Deduplicar
        const seenOrders = new Set<string>();
        const uniqueData = data.filter((o: any) => {
          if (seenOrders.has(o.external_id)) return false;
          seenOrders.add(o.external_id);
          return true;
        });
        
        // Contar órfãos
        const orphanCount = uniqueData.filter((o: any) => !o.client_id).length;
        console.log(`[AutoSync] ${uniqueData.length} pedidos únicos: ${uniqueData.length - orphanCount} vinculados, ${orphanCount} órfãos (${Math.round(orphanCount/uniqueData.length*100)}%)`);

        console.log(`[AutoSync] Inserindo ${uniqueData.length} pedidos únicos no banco...`);
        const { error } = await supabaseAdmin.from('orders').upsert(uniqueData, { onConflict: 'tenant_id,external_id' });
        if (error) {
          console.error(`[AutoSync] Erro no upsert de pedidos:`, error);
          const ids = uniqueData.map((o: any) => o.external_id);
          await supabaseAdmin.from('orders').delete().eq('tenant_id', tenantId).in('external_id', ids);
          const { error: ie } = await supabaseAdmin.from('orders').insert(uniqueData);
          if (ie) {
            console.error(`[AutoSync] Erro no insert de pedidos (fallback):`, ie);
            results.errors.push(`Pedidos: ${ie.message} — Code: ${ie.code}, Details: ${ie.details}, Hint: ${ie.hint}`);
          } else {
            results.orders = uniqueData.length;
          }
        } else {
          console.log(`[AutoSync] ${uniqueData.length} pedidos salvos com sucesso`);
          results.orders = uniqueData.length;
        }

        // Re-vincular pedidos órfãos recentes
        if (results.orders > 0) {
          try {
            const { data: orphans } = await supabaseAdmin
              .from('orders')
              .select('id, metadata')
              .eq('tenant_id', tenantId)
              .is('client_id', null)
              .order('created_at', { ascending: false })
              .limit(50);

            let relinked = 0;
            for (const order of (orphans || [])) {
              const meta = order.metadata as any;
              if (!meta) continue;
              const rawPh = (meta.cliente_whatsapp_e164 || meta.cliente_whatsapp || meta.cliente_telefone || '').replace(/\D/g, '');
              let cid: string | null = null;
              if (rawPh && rawPh.length >= 8) {
                cid = cm.get(rawPh) || cm.get(PhoneNormalizer.canonical(rawPh)) || null;
              }
              if (!cid && meta.cliente_id_facilzap) cid = fzIdMap.get(String(meta.cliente_id_facilzap)) || null;
              if (!cid && meta.cliente_email) cid = emailMap.get(meta.cliente_email.toLowerCase().trim()) || null;
              if (cid) {
                await supabaseAdmin.from('orders').update({ client_id: cid }).eq('id', order.id);
                relinked++;
              }
            }
            results.relinked = relinked;
          } catch (e: any) {
            console.error('[Auto-Sync] Erro ao re-vincular:', e.message);
          }
        }
      }
    } catch (e: any) {
      console.error('[AutoSync] Erro no processamento de pedidos:', e);
      const errorDetails = `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? ` — ${e.details}` : ''}`;
      results.errors.push('Pedidos: ' + errorDetails);
    }

    // ========================================
    // RECALCULAR STATS (após pedidos)
    // ========================================
    if (results.orders > 0 || results.relinked > 0) {
      try {
        console.log('[Auto-Sync] 🔄 Recalculando stats dos clientes...');
        
        const { data: orders } = await supabaseAdmin
          .from('orders')
          .select('client_id, total, created_at')
          .eq('tenant_id', tenantId)
          .not('client_id', 'is', null);

        const clientStats = new Map<string, { total: number; count: number; last: string }>();
        
        for (const order of orders || []) {
          if (!order.client_id) continue;
          const existing = clientStats.get(order.client_id) || { total: 0, count: 0, last: '' };
          existing.total += Number(order.total) || 0;
          existing.count += 1;
          if (!existing.last || order.created_at > existing.last) {
            existing.last = order.created_at;
          }
          clientStats.set(order.client_id, existing);
        }

        const updates = Array.from(clientStats.entries()).map(([clientId, stats]) => ({
          id: clientId,
          tenant_id: tenantId,
          total_orders: stats.count,
          ltv: Math.round(stats.total * 100) / 100,
          avg_ticket: stats.count > 0 ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
          last_order_at: stats.last || null,
        }));

        let statsUpdated = 0;
        for (let i = 0; i < updates.length; i += 100) {
          const batch = updates.slice(i, i + 100);
          await supabaseAdmin.from('clients').upsert(batch, { onConflict: 'id' });
          statsUpdated += batch.length;
        }

        console.log(`[Auto-Sync] ✅ Stats recalculadas: ${statsUpdated} clientes`);
        results.stats_updated = statsUpdated;
      } catch (e: any) {
        console.error('[Auto-Sync] Erro ao recalcular stats:', e.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Auto-Sync] Concluído em ${duration}ms: ${results.products}P ${results.clients}C ${results.orders}O (${results.relinked} revinculados, ${results.stats_updated || 0} stats atualizadas)`);

    return NextResponse.json({
      success: true,
      results,
      duration_ms: duration,
      synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro no auto-sync', details: error.message },
      { status: 500 }
    );
  }
}
