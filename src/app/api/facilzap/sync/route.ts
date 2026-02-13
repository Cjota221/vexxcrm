import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchProducts, fetchClients, fetchOrders } from '@/lib/services/facilzap.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

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

    // PRODUTOS - Captura completa de todos os campos da API FacilZap
    if (entity === 'all' || entity === 'products') {
      try {
        const { products, hasMore } = await fetchProducts(facilzapConfig, page, 100);
        results.hasMore.products = hasMore;
        if (products.length > 0) {
          const data = (products as any[]).map((p: any) => {
            // Garantir que stock é um inteiro válido (INTEGER max = 2147483647)
            let stock = parseInt(String(p.stock ?? 0), 10);
            if (isNaN(stock) || stock < -1 || stock > 2147483647) stock = 0;

            // Imagens como array TEXT[]
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
              category: typeof p.category === 'object' ? (p.category?.nome || p.category?.name || JSON.stringify(p.category)) : (p.category || null),
              is_active: p.is_active !== false,
              custom_fields: {
                ...(p.custom_fields || {}),
                // Dados extras do FacilZap
                source: 'facilzap',
              },
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

    // CLIENTES - Captura completa de todos os campos da API FacilZap
    if (entity === 'all' || entity === 'clients') {
      try {
        const { clients, hasMore } = await fetchClients(facilzapConfig, page, 100);
        results.hasMore.clients = hasMore;
        if (clients.length > 0) {
          const mapped = clients.map((c: any) => {
            // Priorizar whatsapp_e164 (com DDI), depois whatsapp, telefone, celular
            const ph = (c.whatsapp_e164 || c.whatsapp || c.telefone || c.celular || '').replace(/\D/g, '');
            if (!ph) return null;

            // Normalizar telefone com PhoneNormalizer para matching confiável
            const phoneCanonical = PhoneNormalizer.canonical(ph);
            const phoneDisplay = PhoneNormalizer.normalize(ph);

            // Status mapeamento
            let clientStatus = 'active';
            if (c.status === 'inativo' || c.status === 'inactive') clientStatus = 'inactive';
            else if (c.status === 'bloqueado' || c.status === 'blocked') clientStatus = 'blocked';
            else if (c.status === 'vip') clientStatus = 'vip';

            return {
              tenant_id: tenantId,
              phone: phoneDisplay,
              phone_normalized: phoneCanonical,
              name: c.nome || 'Sem nome',
              email: c.email || null,
              source: 'facilzap',
              status: clientStatus,
              // Dados de endereço (pode vir em vários campos)
              address_city: c.cidade || c.city || null,
              address_state: c.estado || c.state || c.uf || null,
              address_zip: c.cep || c.zip || c.codigo_postal || null,
              address_neighborhood: c.bairro || c.neighborhood || null,
              address_street: c.endereco || c.logradouro || c.rua || null,
              address_number: c.numero || c.number || null,
              address_complement: c.complemento || null,
              // Notas com dados ricos
              notes: c.observacoes || null,
              // Metadata completa do FacilZap
              custom_fields: {
                facilzap_id: c.id || null,
                tipo_contato: c.tipo_contato || null,
                cpf_cnpj: c.cpf_cnpj || null,
                data_nascimento: c.data_nascimento || null,
                demais_dados: c.demais_dados || null,
                catalogos: c.catalogos || null,
                vendedores_associados: c.vendedores_associados || null,
                grupos: c.grupos || null,
                origem: c.origem || null,
                ultima_compra: c.ultima_compra || null,
                status_facilzap: c.status || null,
                created_at_facilzap: c.created_at || null,
                source: 'facilzap',
              },
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

    // PEDIDOS - Captura completa de todos os campos da API FacilZap
    if (entity === 'all' || entity === 'orders') {
      try {
        const parseNum = (v: any): number => { const n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : n; };
        // Helper: FacilZap retorna status como "0"/"1", true/false, 0/1 ou "true"/"false"
        const isTruthy = (v: any): boolean => v === '1' || v === 1 || v === true || v === 'true' || v === 'sim';
        const df = new Date().toISOString().split('T')[0];
        const di = new Date(); di.setFullYear(di.getFullYear() - 5);
        const dis = di.toISOString().split('T')[0];
        const { orders, hasMore } = await fetchOrders(facilzapConfig, page, 100, { data_inicial: dis, data_final: df });
        results.hasMore.orders = hasMore;
        if (orders.length > 0) {
          const { data: ec } = await supabaseAdmin.from('clients').select('id, phone_normalized, phone, name, email, custom_fields').eq('tenant_id', tenantId);
          // Criar mapa de lookup com TODAS as variações → client_id
          const cm = new Map<string, string>();
          const fzIdMap = new Map<string, string>();
          const emailMap = new Map<string, string>();
          const nameMap = new Map<string, string>();
          for (const c of (ec || [])) {
            // Telefone (todas variações)
            for (const raw of [c.phone_normalized, c.phone]) {
              if (!raw) continue;
              const cleaned = raw.replace(/\D/g, '');
              if (cleaned) {
                cm.set(cleaned, c.id);
                cm.set(PhoneNormalizer.canonical(cleaned), c.id);
                cm.set(PhoneNormalizer.normalize(cleaned), c.id);
              }
            }
            // FacilZap ID
            const fzId = (c.custom_fields as any)?.facilzap_id;
            if (fzId) fzIdMap.set(String(fzId), c.id);
            // Email
            if (c.email) emailMap.set(c.email.toLowerCase().trim(), c.id);
            // Nome
            if (c.name && c.name !== 'Sem nome') nameMap.set(c.name.toLowerCase().trim(), c.id);
          }

          // Buscar produtos do tenant para cross-reference de imagens (SKU -> image_url)
          const { data: existingProducts } = await supabaseAdmin
            .from('products')
            .select('external_id, sku, image_url, name')
            .eq('tenant_id', tenantId);
          
          // Criar mapas de lookup: por SKU e por external_id (FacilZap product id)
          const productImageBySku = new Map<string, string>();
          const productImageByExtId = new Map<string, string>();
          const productImageByName = new Map<string, string>();
          for (const p of (existingProducts || [])) {
            if (p.image_url) {
              if (p.sku) productImageBySku.set(String(p.sku).toLowerCase(), p.image_url);
              if (p.external_id) productImageByExtId.set(String(p.external_id), p.image_url);
              if (p.name) productImageByName.set(p.name.toLowerCase().trim(), p.image_url);
            }
          }

          const data = orders.map((o: any) => {
            // Telefone do cliente: prioriza whatsapp_e164, whatsapp, telefone
            // API FacilZap retorna whatsapp sem DDI (ex: "31998573334")
            // e whatsapp_e164 com DDI (ex: "+5531998573334")
            const rawPhone = o.cliente?.whatsapp_e164 
              || o.cliente?.whatsapp 
              || o.cliente?.telefone 
              || '';
            const ph = rawPhone.replace(/\D/g, '');

            // Tentar encontrar client_id por várias estratégias
            let clientId: string | null = null;
            if (ph && ph.length >= 8) {
              clientId = cm.get(ph)
                || cm.get(PhoneNormalizer.canonical(ph))
                || cm.get(PhoneNormalizer.normalize(ph))
                || null;
            }
            // Fallback: FacilZap ID do cliente
            if (!clientId && o.cliente?.id) {
              clientId = fzIdMap.get(String(o.cliente.id)) || null;
            }
            // Fallback: Email
            if (!clientId && o.cliente?.email) {
              clientId = emailMap.get(o.cliente.email.toLowerCase().trim()) || null;
            }
            // Fallback: Nome (match exato)
            if (!clientId && o.cliente?.nome && o.cliente.nome !== 'Sem nome') {
              clientId = nameMap.get(o.cliente.nome.toLowerCase().trim()) || null;
            }

            // Status do pedido baseado nos campos booleanos (strings "0"/"1")
            let orderStatus = 'pending';
            if (isTruthy(o.status_entregue)) orderStatus = 'delivered';
            else if (isTruthy(o.status_despachado)) orderStatus = 'shipped';
            else if (isTruthy(o.status_separado) || isTruthy(o.status_em_separacao)) orderStatus = 'processing';
            else if (isTruthy(o.status_pago)) orderStatus = 'confirmed';
            else if (o.status === 'cancelado' || o.status_pedido === 'cancelado') orderStatus = 'cancelled';

            // Payment status
            const paymentStatus = isTruthy(o.status_pago) ? 'paid' : 'pending';

            // Método de pagamento (garantir que é string, não objeto)
            let paymentMethod: string | null = null;
            if (typeof o.metodo_pagamento === 'string' && o.metodo_pagamento) {
              paymentMethod = o.metodo_pagamento;
            } else if (typeof o.metodo_pagamento === 'object' && o.metodo_pagamento?.nome) {
              paymentMethod = o.metodo_pagamento.nome;
            } else if (typeof o.forma_pagamento === 'string' && o.forma_pagamento) {
              paymentMethod = o.forma_pagamento;
            } else if (o.pagamentos && o.pagamentos.length > 0) {
              const p = o.pagamentos[0];
              paymentMethod = p.metodo || p.forma || p.nome || (typeof p === 'string' ? p : null);
            }

            // Itens do pedido (pode vir como itens ou produtos)
            const items = o.itens || o.produtos || [];
            const totalItems = items.reduce((sum: number, it: any) => sum + (parseNum(it.quantidade) || 1), 0);

            // Validar data do pedido
            let orderDate: string;
            try {
              const d = o.data ? new Date(o.data) : null;
              orderDate = (d && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString();
            } catch { orderDate = new Date().toISOString(); }

            // Valores financeiros (API retorna strings)
            const subtotal = parseNum(o.subtotal);
            const discount = parseNum(o.desconto_total || o.desconto);
            const shipping = parseNum(o.valor_frete);
            const total = parseNum(o.total || o.valor_total) || (subtotal - discount + shipping);

            // Helper: extrair URL de imagem do item via cross-reference com products table
            // FacilZap NÃO retorna imagens nos itens de pedido!
            const extractItemImage = (it: any): string | null => {
              // 1. Tentar campo direto (caso FacilZap mude no futuro)
              for (const key of ['imagem', 'foto', 'foto_url', 'imagem_url', 'image', 'image_url', 'thumb', 'thumbnail']) {
                if (it[key] && typeof it[key] === 'string') return it[key];
              }
              // 2. Campo pode ser objeto {url, file, path}
              for (const key of ['imagem', 'foto', 'image']) {
                if (it[key] && typeof it[key] === 'object') {
                  if (it[key].url) return it[key].url;
                  if (it[key].path) return it[key].path;
                  if (it[key].file) return `https://arquivos.facilzap.app.br/${it[key].file}`;
                }
              }
              // 3. Cross-reference: buscar na tabela products por SKU
              const itemSku = it.sku || it.codigo || (it.variacao?.sku) || null;
              if (itemSku) {
                // Tentar SKU exato
                const img = productImageBySku.get(String(itemSku).toLowerCase());
                if (img) return img;
                // SKU de variação pode ser "FZ3691503.5", tentar base "FZ3691503"
                const baseSku = String(itemSku).split('.')[0];
                const imgBase = productImageBySku.get(baseSku.toLowerCase());
                if (imgBase) return imgBase;
              }
              // 4. Cross-reference: buscar por produto_id / id como external_id
              const prodId = it.produto_id || it.id;
              if (prodId) {
                const img = productImageByExtId.get(String(prodId));
                if (img) return img;
              }
              // 5. Cross-reference: buscar por nome do produto
              const itemName = it.nome || it.name || it.produto_nome || '';
              if (itemName) {
                const img = productImageByName.get(itemName.toLowerCase().trim());
                if (img) return img;
              }
              return null;
            };

            // Helper: extrair preço unitário do item (vários campos possíveis)
            const extractItemPrice = (it: any): number => {
              // Prioridade: preco_unitario > valor_unitario > preco > valor > price
              for (const key of ['preco_unitario', 'valor_unitario', 'preco', 'valor', 'price']) {
                const v = parseNum(it[key]);
                if (v > 0) return v;
              }
              // Se tem um subtotal do item e quantidade
              const qty = parseNum(it.quantidade) || 1;
              const sub = parseNum(it.subtotal || it.total);
              if (sub > 0) return sub / qty;
              return 0;
            };

            // order_number: usar o.codigo (número legível da FacilZap), limpar
            const orderNumber = (() => {
              const codigo = o.codigo || o.numero || o.number || o.numero_pedido;
              if (codigo) {
                const s = String(codigo).trim();
                return s || String(o.id);
              }
              return String(o.id);
            })();

            return {
              tenant_id: tenantId,
              client_id: clientId,
              external_id: String(o.id),
              order_number: orderNumber,
              status: orderStatus,
              payment_status: paymentStatus,
              payment_method: paymentMethod,
              subtotal,
              discount,
              shipping,
              total,
              notes: o.observacoes || null,
              coupon_code: o.cupom_info?.codigo || null,
              created_at: orderDate,
              metadata: {
                // Cliente completo
                cliente_nome: o.cliente?.nome || null,
                cliente_telefone: rawPhone || null,
                cliente_whatsapp: o.cliente?.whatsapp || null,
                cliente_whatsapp_e164: o.cliente?.whatsapp_e164 || null,
                cliente_whatsapp_ddi: o.cliente?.whatsapp_ddi || null,
                cliente_cpf_cnpj: o.cliente?.cpf_cnpj || null,
                cliente_email: o.cliente?.email || null,
                cliente_id_facilzap: o.cliente?.id || null,
                // Itens detalhados com variação, imagem e preço
                total_items: totalItems,
                itens: items.slice(0, 50).map((it: any) => {
                  const precoUnit = extractItemPrice(it);
                  const imagem = extractItemImage(it);
                  const variacaoRaw = it.variacao || it.variacao_nome || it.opcao || null;
                  const variacao = variacaoRaw && typeof variacaoRaw === 'object'
                    ? (variacaoRaw.nome || variacaoRaw.name || JSON.stringify(variacaoRaw))
                    : variacaoRaw;
                  return {
                    id: it.id || null,
                    produto_id: it.produto_id || null,
                    nome: it.nome || it.name || it.produto_nome || '',
                    quantidade: parseNum(it.quantidade) || 1,
                    valor: precoUnit,
                    preco_unitario: precoUnit,
                    variacao,
                    imagem,
                    sku: it.sku || it.codigo || null,
                  };
                }),
                // Pagamentos
                pagamentos: o.pagamentos || [],
                metodo_pagamento: o.metodo_pagamento || null,
                // Entrega (pode ser objeto {id, nome} ou string)
                forma_entrega: typeof o.forma_entrega === 'object' ? (o.forma_entrega?.nome || JSON.stringify(o.forma_entrega)) : (o.forma_entrega || null),
                // Status detalhados (valores originais da API)
                status_original: o.status || null,
                status_pedido: o.status_pedido || null,
                status_pago: o.status_pago || null,
                status_em_separacao: o.status_em_separacao || null,
                status_separado: o.status_separado || null,
                status_despachado: o.status_despachado || null,
                status_entregue: o.status_entregue || null,
                // Extras (podem ser objetos {id, nome})
                origem: o.origem || null,
                vendedor: typeof o.vendedor === 'object' ? (o.vendedor?.nome || JSON.stringify(o.vendedor)) : (o.vendedor || null),
                catalogo: typeof o.catalogo === 'object' ? (o.catalogo?.nome || JSON.stringify(o.catalogo)) : (o.catalogo || null),
                taxa: parseNum(o.taxa),
                desconto_sistema: parseNum(o.desconto_sistema),
                cupom_info: o.cupom_info || null,
                data_original: o.data || null,
              },
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

    // PÓS-SYNC: Re-vincular pedidos órfãos e atualizar estatísticas
    if ((entity === 'all' || entity === 'orders') && results.orders > 0) {
      try {
        // Re-vincular pedidos sem client_id usando múltiplas estratégias
        const { data: freshClients } = await supabaseAdmin
          .from('clients')
          .select('id, phone, phone_normalized, name, email, custom_fields')
          .eq('tenant_id', tenantId);

        const phoneMap = new Map<string, string>();
        const fzMap = new Map<string, string>();
        const emMap = new Map<string, string>();
        const nmMap = new Map<string, string>();
        for (const c of (freshClients || [])) {
          for (const raw of [c.phone_normalized, c.phone]) {
            if (!raw) continue;
            const cl = raw.replace(/\D/g, '');
            if (cl) {
              phoneMap.set(cl, c.id);
              phoneMap.set(PhoneNormalizer.canonical(cl), c.id);
              phoneMap.set(PhoneNormalizer.normalize(cl), c.id);
            }
          }
          const fzId = (c.custom_fields as any)?.facilzap_id;
          if (fzId) fzMap.set(String(fzId), c.id);
          if (c.email) emMap.set(c.email.toLowerCase().trim(), c.id);
          if (c.name && c.name !== 'Sem nome') nmMap.set(c.name.toLowerCase().trim(), c.id);
        }

        // Buscar pedidos órfãos
        const { data: orphans } = await supabaseAdmin
          .from('orders')
          .select('id, metadata')
          .eq('tenant_id', tenantId)
          .is('client_id', null);

        let relinked = 0;
        for (const order of (orphans || [])) {
          const meta = order.metadata as any;
          if (!meta) continue;
          let cid: string | null = null;
          // 1. Telefone (e164 > whatsapp > telefone)
          const rawPh = (meta.cliente_whatsapp_e164 || meta.cliente_whatsapp || meta.cliente_telefone || '').replace(/\D/g, '');
          if (rawPh && rawPh.length >= 8) {
            cid = phoneMap.get(rawPh) || phoneMap.get(PhoneNormalizer.canonical(rawPh)) || phoneMap.get(PhoneNormalizer.normalize(rawPh)) || null;
          }
          // 2. FacilZap ID
          if (!cid && meta.cliente_id_facilzap) cid = fzMap.get(String(meta.cliente_id_facilzap)) || null;
          // 3. Email
          if (!cid && meta.cliente_email) cid = emMap.get(meta.cliente_email.toLowerCase().trim()) || null;
          // 4. Nome
          if (!cid && meta.cliente_nome && meta.cliente_nome !== 'Sem nome') cid = nmMap.get(meta.cliente_nome.toLowerCase().trim()) || null;

          if (cid) {
            await supabaseAdmin.from('orders').update({ client_id: cid }).eq('id', order.id);
            relinked++;
          }
        }
        if (relinked > 0) console.log(`[SYNC] Re-vinculados ${relinked} pedidos órfãos`);

        // Recalcular stats de todos os clientes
        const { data: allOrders } = await supabaseAdmin
          .from('orders')
          .select('client_id, total, created_at')
          .eq('tenant_id', tenantId)
          .not('client_id', 'is', null);

        if (allOrders && allOrders.length > 0) {
          const clientStats = new Map<string, { total: number; count: number; last: string }>();
          for (const o of allOrders) {
            if (!o.client_id) continue;
            const prev = clientStats.get(o.client_id) || { total: 0, count: 0, last: '' };
            prev.total += Number(o.total) || 0;
            prev.count += 1;
            if (o.created_at > prev.last) prev.last = o.created_at;
            clientStats.set(o.client_id, prev);
          }

          const updates = Array.from(clientStats.entries()).map(([clientId, stats]) => ({
            id: clientId,
            tenant_id: tenantId,
            ltv: Math.round(stats.total * 100) / 100,
            total_orders: stats.count,
            avg_ticket: stats.count > 0 ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
            last_order_at: stats.last || null,
          }));

          for (let i = 0; i < updates.length; i += 100) {
            const batch = updates.slice(i, i + 100);
            await supabaseAdmin.from('clients').upsert(batch, { onConflict: 'id' });
          }
          console.log('[SYNC] Atualizadas stats de ' + clientStats.size + ' clientes');
        }
      } catch (e: any) {
        console.error('[SYNC] Erro ao atualizar stats clientes:', e.message);
      }
    }

    const duration = Date.now() - startTime;
    return NextResponse.json({ success: true, results, duration_ms: duration, page, entity, message: 'Sync p.' + page + ': ' + results.products + ' produtos, ' + results.clients + ' clientes, ' + results.orders + ' pedidos' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao sincronizar', details: error.message, duration_ms: Date.now() - startTime }, { status: 500 });
  }
}
