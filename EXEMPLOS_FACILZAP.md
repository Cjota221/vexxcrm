# 🚀 Exemplo de Uso — FacilZap Service (Corrigido)

**Data:** 12 de Fevereiro de 2026

---

## 📦 Importações

```typescript
import { 
  fetchAllProducts,
  fetchAllClients,
  fetchAllOrders,
  syncStoreData,
  type NormalizedProduct
} from '@/lib/services/facilzap.service';

import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
```

---

## 🎯 Exemplo 1: Sincronização Completa (API Route)

**Arquivo:** `src/app/api/facilzap/sync/route.ts`

```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { syncStoreData } from '@/lib/services/facilzap.service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: Request) {
  try {
    // 1. Autenticação
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);
    
    if (!tenant.facilzap_token) {
      return Response.json(
        { error: 'Token FacilZap não configurado' }, 
        { status: 400 }
      );
    }
    
    // 2. Sincronizar dados da FacilZap
    const data = await syncStoreData(
      { 
        token: tenant.facilzap_token,
        storeUrl: 'https://cjotarasteirinhas.com.br' // URL da loja (opcional)
      },
      true // fullSync = true (busca todas as páginas)
    );
    
    // 3. Salvar produtos no Supabase
    const productsToUpsert = data.products.map((p: any) => ({
      tenant_id: tenantId,
      external_id: p.external_id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      price: p.price,
      compare_at_price: p.compare_at_price,
      cost: p.cost,
      stock: p.stock,
      category: p.category,
      image_url: p.image_url,
      images: p.images,
      is_active: p.is_active,
      custom_fields: p.custom_fields,
      synced_at: new Date().toISOString(),
    }));
    
    await supabase
      .from('products')
      .upsert(productsToUpsert, { 
        onConflict: 'tenant_id,external_id',
        ignoreDuplicates: false 
      });
    
    // 4. Salvar clientes no Supabase
    const clientsToUpsert = data.clients.map((c: any) => {
      const telefone = c.telefone || c.whatsapp || c.celular || '';
      const phoneNormalized = telefone.replace(/\D/g, ''); // Remove não-dígitos
      
      return {
        tenant_id: tenantId,
        phone: telefone,
        phone_normalized: phoneNormalized,
        name: c.nome,
        email: c.email,
        source: 'facilzap',
        custom_fields: {
          cpf_cnpj: c.cpf_cnpj,
          data_nascimento: c.data_nascimento,
          endereco: c.endereco,
          bairro: c.bairro,
          cidade: c.cidade,
          estado: c.estado,
          cep: c.cep,
          origem: c.origem,
        },
      };
    });
    
    await supabase
      .from('clients')
      .upsert(clientsToUpsert, { 
        onConflict: 'tenant_id,phone_normalized',
        ignoreDuplicates: false 
      });
    
    // 5. Salvar pedidos no Supabase
    for (const order of data.orders) {
      const clientPhone = order.cliente?.telefone || '';
      const phoneNormalized = clientPhone.replace(/\D/g, '');
      
      // Buscar cliente no banco
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone_normalized', phoneNormalized)
        .single();
      
      // Inserir pedido
      const { data: insertedOrder } = await supabase
        .from('orders')
        .upsert({
          tenant_id: tenantId,
          client_id: client?.id || null,
          external_id: String(order.id),
          order_number: order.codigo,
          status: order.status === 'entregue' ? 'delivered' : 
                 order.status === 'cancelado' ? 'cancelled' : 'pending',
          payment_status: order.status_pago ? 'paid' : 'pending',
          payment_method: order.forma_pagamento,
          total: order.valor_total || order.total,
          synced_at: new Date().toISOString(),
          created_at: order.data || order.created_at,
        }, { 
          onConflict: 'tenant_id,external_id',
          ignoreDuplicates: false 
        })
        .select('id')
        .single();
      
      // Inserir itens do pedido
      if (insertedOrder && order.itens) {
        const items = order.itens.map((item: any) => ({
          tenant_id: tenantId,
          order_id: insertedOrder.id,
          product_name: item.nome,
          quantity: item.quantidade,
          unit_price: item.preco_unitario || (item.valor / item.quantidade),
          total_price: item.valor,
        }));
        
        await supabase.from('order_items').insert(items);
      }
    }
    
    // 6. Retornar sucesso
    return Response.json({
      success: true,
      synced_at: data.synced_at,
      counts: {
        products: data.products.length,
        clients: data.clients.length,
        orders: data.orders.length,
      },
    });
    
  } catch (error: any) {
    console.error('Erro ao sincronizar FacilZap:', error);
    return Response.json(
      { error: error.message || 'Erro ao sincronizar' }, 
      { status: 500 }
    );
  }
}
```

---

## 🎯 Exemplo 2: Listar Produtos (API Route)

**Arquivo:** `src/app/api/facilzap/products/route.ts`

```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { fetchAllProducts } from '@/lib/services/facilzap.service';

export async function GET(request: Request) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);
    
    if (!tenant.facilzap_token) {
      return Response.json(
        { error: 'Token FacilZap não configurado' }, 
        { status: 400 }
      );
    }
    
    const products = await fetchAllProducts({ 
      token: tenant.facilzap_token 
    });
    
    return Response.json({
      products,
      total: products.length,
      synced_at: new Date().toISOString(),
    });
    
  } catch (error: any) {
    return Response.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}
```

---

## 🎯 Exemplo 3: Buscar Pedidos Recentes (API Route)

**Arquivo:** `src/app/api/facilzap/orders/route.ts`

```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { fetchOrders } from '@/lib/services/facilzap.service';

export async function GET(request: Request) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);
    
    if (!tenant.facilzap_token) {
      return Response.json(
        { error: 'Token FacilZap não configurado' }, 
        { status: 400 }
      );
    }
    
    // Buscar pedidos dos últimos 30 dias
    const dataFinal = new Date().toISOString().split('T')[0];
    const dataInicial = new Date();
    dataInicial.setDate(dataInicial.getDate() - 30);
    const dataInicialStr = dataInicial.toISOString().split('T')[0];
    
    const result = await fetchOrders(
      { token: tenant.facilzap_token },
      1,
      100,
      {
        data_inicial: dataInicialStr,
        data_final: dataFinal,
      }
    );
    
    return Response.json({
      orders: result.orders,
      total: result.orders.length,
      hasMore: result.hasMore,
    });
    
  } catch (error: any) {
    return Response.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}
```

---

## 🎯 Exemplo 4: Buscar Cliente por Telefone

```typescript
import { fetchAllClients } from '@/lib/services/facilzap.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

async function findClientByPhone(config: { token: string }, phone: string) {
  const clients = await fetchAllClients(config);
  
  // Normalizar telefone para matching
  const normalized = PhoneNormalizer.canonical(phone);
  
  // Buscar cliente (telefone || whatsapp || celular)
  const client = clients.find((c) => {
    const clientPhone = PhoneNormalizer.canonical(
      c.telefone || c.whatsapp || c.celular || ''
    );
    return clientPhone === normalized;
  });
  
  return client;
}

// Uso:
const client = await findClientByPhone(
  { token: 'abc123' }, 
  '62999998888'
);

console.log(client?.nome); // "Maria Silva"
```

---

## 🎯 Exemplo 5: Obter Produto Mais Vendido

```typescript
import { fetchAllOrders, fetchAllProducts } from '@/lib/services/facilzap.service';

async function getMostSoldProduct(config: { token: string }) {
  const orders = await fetchAllOrders(config);
  const products = await fetchAllProducts(config);
  
  // Contar vendas por produto
  const sales: Record<string, number> = {};
  
  orders.forEach((order) => {
    order.itens.forEach((item) => {
      const prodId = String(item.produto_id);
      sales[prodId] = (sales[prodId] || 0) + item.quantidade;
    });
  });
  
  // Encontrar produto mais vendido
  const [topProductId, qtySold] = Object.entries(sales)
    .sort(([, a], [, b]) => b - a)[0];
  
  const product = products.find((p) => 
    p.external_id === topProductId || 
    p.external_id.startsWith(`${topProductId}-`)
  );
  
  return {
    product,
    quantity_sold: qtySold,
  };
}

// Uso:
const result = await getMostSoldProduct({ token: 'abc123' });
console.log(`Produto: ${result.product?.name}`);
console.log(`Vendidos: ${result.quantity_sold} unidades`);
```

---

## 🎯 Exemplo 6: Filtrar Produtos em Estoque

```typescript
import { fetchAllProducts } from '@/lib/services/facilzap.service';
import { filterInStock, filterActive } from '@/lib/facilzap-normalizer';

async function getAvailableProducts(config: { token: string }) {
  const allProducts = await fetchAllProducts(config);
  
  // Filtrar apenas produtos ativos e com estoque
  const activeProducts = filterActive(allProducts);
  const inStockProducts = filterInStock(activeProducts);
  
  // Agrupar por categoria
  const byCategory = inStockProducts.reduce((acc, product) => {
    const cat = product.category || 'Sem categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {} as Record<string, typeof allProducts>);
  
  return byCategory;
}

// Uso:
const products = await getAvailableProducts({ token: 'abc123' });
console.log(products['Rasteirinhas']); // Array de rasteirinhas disponíveis
```

---

## 🎯 Exemplo 7: Calcular LTV de Cliente

```typescript
import { fetchAllOrders } from '@/lib/services/facilzap.service';

async function calculateClientLTV(
  config: { token: string }, 
  clientId: number
) {
  const orders = await fetchAllOrders(config);
  
  // Filtrar pedidos do cliente (não cancelados)
  const clientOrders = orders.filter((o) => 
    (o.cliente_id === clientId || o.id_cliente === clientId) &&
    o.status !== 'cancelado'
  );
  
  // Calcular métricas
  const ltv = clientOrders.reduce((sum, o) => sum + (o.valor_total || o.total), 0);
  const avgTicket = ltv / clientOrders.length;
  const lastOrder = clientOrders.sort((a, b) => 
    new Date(b.data).getTime() - new Date(a.data).getTime()
  )[0];
  
  return {
    ltv,
    total_orders: clientOrders.length,
    avg_ticket: avgTicket,
    last_order_at: lastOrder?.data,
  };
}

// Uso:
const metrics = await calculateClientLTV({ token: 'abc123' }, 12345);
console.log(`LTV: R$ ${metrics.ltv.toFixed(2)}`);
console.log(`Ticket Médio: R$ ${metrics.avg_ticket.toFixed(2)}`);
console.log(`Última Compra: ${metrics.last_order_at}`);
```

---

## 📚 Tipos Disponíveis

```typescript
import type { 
  NormalizedProduct,
  FacilZapClient,
  FacilZapOrder,
  FacilZapOrderItem 
} from '@/lib/services/facilzap.service';

// NormalizedProduct (produto normalizado)
interface NormalizedProduct {
  external_id: string;      // ID FacilZap
  sku: string;              // Código SKU
  name: string;             // Nome do produto
  description: string;      // Descrição
  price: number;            // Preço final
  compare_at_price: number | null;  // Preço "de" (riscado)
  cost: number | null;      // Custo (não exposto pela API)
  stock: number;            // Estoque (-1 = infinito)
  category: string;         // Categoria
  image_url: string;        // Imagem principal
  images: string[];         // Todas as imagens
  is_active: boolean;       // Ativo/inativo
  custom_fields: {
    is_variation: boolean;  // É uma variação?
    variation_id?: number;  // ID da variação
    variation_name?: string;  // Nome da variação (ex: "37")
    parent_product_id?: number;  // ID do produto pai
    has_variations?: boolean;  // Produto pai tem variações?
    barcode?: string | null;  // Código de barras
  };
}
```

---

## ✅ Checklist de Testes

Antes de usar em produção, testar:

- [ ] Buscar produtos: `fetchAllProducts()`
- [ ] Verificar se variações são expandidas corretamente
- [ ] Buscar clientes: `fetchAllClients()`
- [ ] Verificar normalização de telefone (3 campos possíveis)
- [ ] Buscar pedidos: `fetchAllOrders()`
- [ ] **CRÍTICO:** Verificar se campo `itens` está preenchido
- [ ] Sync completo: `syncStoreData(config, true)`
- [ ] Verificar se dados são salvos no Supabase
- [ ] Testar cache/fallback em caso de erro

---

**Fim do Documento** 🎯
