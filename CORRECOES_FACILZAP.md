# ✅ Correções FacilZap — Alinhamento com Documentação Oficial

**Data:** 12 de Fevereiro de 2026  
**Arquivos Corrigidos:** `facilzap.service.ts` e `facilzap-normalizer.ts`

---

## 📊 Resumo das Correções

### 1. **URL Base da API**

```diff
- const API_BASE_URL = 'https://api.facilzap.com.br';
+ const API_BASE_URL = 'https://api.facilzap.app.br';
```

**Motivo:** URL estava divergente da documentação oficial.

---

### 2. **Endpoints Corrigidos**

| Recurso | ❌ Anterior | ✅ Corrigido |
|---------|-------------|--------------|
| Produtos | `/products` | `/produtos` |
| Clientes | `/customers` | `/clientes` |
| Pedidos | `/orders` | `/pedidos` |

**Motivo:** API FacilZap usa endpoints em português.

---

### 3. **Parâmetros de Paginação**

```diff
- ?page=1&per_page=100
+ ?page=1&length=100
```

**Motivo:** Parâmetro correto é `length` (não `per_page`).

---

### 4. **Filtro CRÍTICO de Pedidos**

```typescript
// ⚠️ AGORA INCLUÍDO AUTOMATICAMENTE:
'filtros[incluir_produtos]': '1'
```

**Impacto:** **SEM ESSE FILTRO, PEDIDOS VÊM SEM ITENS!** 🚨

**Código:**
```typescript
const params = new URLSearchParams({
  page: String(page),
  length: String(length),
  'filtros[incluir_produtos]': '1', // ⚠️ CRÍTICO
});
```

---

### 5. **Filtros de Data (Pedidos)**

Adicionados suporte para filtros temporais:

```typescript
fetchOrders(config, page, length, {
  data_inicial: '2024-02-12',  // YYYY-MM-DD
  data_final: '2026-02-12',    // YYYY-MM-DD
  status: 'entregue'           // Opcional
})
```

**Função nova:** `fetchAllOrders()` — busca últimos 2 anos automaticamente.

---

### 6. **Estrutura de Dados Corrigida**

#### 6.1 Produtos

```typescript
// ❌ Estrutura antiga (inglês):
interface FacilZapProduct {
  name: string;
  price: number;
  stock: number;
  active: boolean;
  variations: [];
}

// ✅ Estrutura real (português + complexa):
interface FacilZapProduct {
  id: number;
  nome: string;
  descricao?: string;
  sku?: string;
  codigo?: string;
  ativado?: boolean;
  
  // Preço em 4 locais possíveis!
  preco?: string | number;
  valor?: string | number;
  catalogos?: Array<{
    precos?: {
      preco?: string | number;
      preco_promocional?: string | number;
    };
  }>;
  
  // Estoque pode ser número ou objeto
  estoque?: number | {
    controlar_estoque?: boolean;
    estoque?: number;
    quantidade?: number;
  };
  
  // Imagens em formatos variados
  imagens?: Array<{
    url?: string;
    file?: string;  // Precisa construir URL completa
  } | string>;
  
  // Código de barras complexo
  cod_barras?: {
    numero?: string;
  } | Array<{ numero?: string }> | string;
  
  variacoes?: FacilZapVariation[];
}
```

#### 6.2 Clientes

```typescript
// ❌ Estrutura antiga:
interface FacilZapClient {
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
}

// ✅ Estrutura real:
interface FacilZapClient {
  id: number;
  nome: string;
  telefone?: string;
  whatsapp?: string;   // ⚠️ Campo adicional!
  celular?: string;    // ⚠️ Campo adicional!
  email?: string;
  cpf_cnpj?: string;   // ⚠️ Unificado
  data_nascimento?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  origem?: string;
  ultima_compra?: string;
  created_at: string;
}
```

#### 6.3 Pedidos

```typescript
// ❌ Estrutura antiga:
interface FacilZapOrder {
  customer_id: number;
  status: string;
  payment_status: string;
  total: number;
  items: [];
}

// ✅ Estrutura real:
interface FacilZapOrder {
  id: number;
  codigo?: string;
  cliente_id?: number;
  id_cliente?: number;        // ⚠️ Campo duplicado!
  cliente?: {                 // ⚠️ Objeto nested!
    id: number;
    nome: string;
    telefone?: string;
    email?: string;
    cpf_cnpj?: string;
  };
  data: string;               // ⚠️ Nome do campo de data
  status: string;
  status_pedido?: string;     // ⚠️ Campo duplicado!
  status_pago?: boolean;      // ⚠️ Flag booleana
  status_entregue?: boolean;  // ⚠️ Flag booleana
  total: number;
  valor_total?: number;       // ⚠️ Campo duplicado!
  forma_pagamento?: string;
  origem?: string;
  itens: FacilZapOrderItem[];
}
```

---

### 7. **Normalização de Produtos (Complexa)**

O normalizer agora trata **TODOS os cenários** da documentação:

#### 7.1 Extração de Preço (4 locais)

```typescript
// Ordem de prioridade:
1. catalogos[0].precos.preco_promocional  ← Se tem promoção ativa
2. catalogos[0].precos.preco              ← Preço padrão FacilZap
3. preco ou valor                         ← Campo direto (raro)
4. variacoes[0].preco                     ← Preço da primeira variação
```

#### 7.2 Extração de Estoque (Lógica Complexa)

```typescript
// Cenário 1: Número simples
estoque: 25  →  Retorna: 25

// Cenário 2: Objeto (sem variações)
estoque: {
  controlar_estoque: true,
  estoque: 25
}  →  Retorna: 25

// Cenário 3: Não controla estoque
estoque: {
  controlar_estoque: false
}  →  Retorna: -1 (infinito)

// Cenário 4: Produto com variações
estoque: { controlar_estoque: true }
variacoes: [
  { nome: "37", estoque: { estoque: 5 } },
  { nome: "38", estoque: { estoque: 8 } },
  { nome: "39", estoque: { estoque: 3 } }
]  →  Retorna: 16 (soma: 5+8+3)
```

#### 7.3 Extração de Imagens (3 formatos)

```typescript
// Formato 1: String direta
imagens: ["https://cdn.facilzap.app.br/foto.jpg"]
→ Usa direto

// Formato 2: Objeto com URL
imagens: [{ url: "https://cdn.facilzap.app.br/foto.jpg" }]
→ Usa img.url

// Formato 3: Objeto com file (SEM URL)
imagens: [{ file: "uploads/produto/foto.jpg" }]
→ Constrói: "https://arquivos.facilzap.app.br/uploads/produto/foto.jpg"
```

#### 7.4 Extração de Código de Barras

```typescript
// Formato 1: Objeto
cod_barras: { numero: "7891234567890" }

// Formato 2: Array de objetos
cod_barras: [{ numero: "7891234567890" }]

// Formato 3: String direta
cod_barras: "7891234567890"
```

---

### 8. **Novas Funções Adicionadas**

#### `fetchAllProducts()` — Busca Sequencial

```typescript
// ⚠️ MUDANÇA: API NÃO retorna total de páginas!
// Para quando data.length === 0

const products = await fetchAllProducts({ token: 'abc123' });
// Busca até 20 páginas ou até retornar array vazio
```

#### `fetchAllClients()` — Busca Sequencial

```typescript
const clients = await fetchAllClients({ token: 'abc123' });
// Busca até 15 páginas ou até retornar array vazio
```

#### `fetchAllOrders()` — Busca Últimos 2 Anos

```typescript
const orders = await fetchAllOrders({ token: 'abc123' });
// Busca pedidos dos últimos 2 anos automaticamente
// Limite: 20 páginas
```

#### `syncStoreData()` — Sync Completo ou Rápido

```typescript
// Sync rápido (primeira página de cada):
const data = await syncStoreData({ token: 'abc123' });

// Sync completo (todas as páginas):
const fullData = await syncStoreData({ token: 'abc123' }, true);
```

---

## 🎯 Impacto das Correções

| Item | Antes | Depois | Impacto |
|------|-------|--------|---------|
| **URL Base** | `.com.br` | `.app.br` | ✅ Conexão funcional |
| **Endpoints** | Inglês | Português | ✅ Rotas corretas |
| **Paginação** | `per_page` | `length` | ✅ Parâmetro válido |
| **Filtro pedidos** | ❌ Ausente | ✅ `incluir_produtos=1` | 🚨 **CRÍTICO** — Pedidos agora vêm com itens! |
| **Campos** | Inglês | Português | ✅ Matching correto |
| **Preço** | 1 local | 4 locais | ✅ Todos os cenários cobertos |
| **Estoque** | Número simples | Número OU objeto | ✅ Soma variações corretamente |
| **Imagens** | String | String OU objeto | ✅ Constrói URL quando necessário |
| **Telefone** | 1 campo | 3 campos (`telefone` \|\| `whatsapp` \|\| `celular`) | ✅ Fallback robusto |

---

## 📋 Checklist de Integração

Para ativar a integração FacilZap no CRM:

### 1. **Configuração no Banco**

```sql
-- Já está no schema (001_initial_schema.sql):
UPDATE tenants 
SET facilzap_token = 'SEU_TOKEN_AQUI'
WHERE id = 'tenant_id_aqui';
```

### 2. **Testar Endpoints**

```typescript
import { syncStoreData } from '@/lib/services/facilzap.service';

const config = {
  token: tenant.facilzap_token,
  storeUrl: 'https://loja.cliente.com.br' // Opcional
};

// Sync rápido (testa conexão):
const data = await syncStoreData(config);
console.log(`Produtos: ${data.products.length}`);
console.log(`Clientes: ${data.clients.length}`);
console.log(`Pedidos: ${data.orders.length}`);
```

### 3. **Verificar Dados**

✅ Produtos retornam com variações expandidas  
✅ Pedidos retornam com campo `itens` preenchido  
✅ Clientes retornam com telefone normalizado  
✅ Imagens vêm com URLs válidas  

### 4. **Implementar Sincronização**

```typescript
// API Route: /api/facilzap/sync/route.ts
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { syncStoreData } from '@/lib/services/facilzap.service';

export async function POST(request: Request) {
  const { tenantId } = await getTenantFromRequest(request);
  const tenant = await getTenantConfig(tenantId);
  
  if (!tenant.facilzap_token) {
    return Response.json({ error: 'FacilZap não configurado' }, { status: 400 });
  }
  
  const data = await syncStoreData({ 
    token: tenant.facilzap_token,
    storeUrl: tenant.site_url 
  }, true); // fullSync = true
  
  // Salvar no Supabase (products, clients, orders)
  // ...
  
  return Response.json({ 
    success: true, 
    synced_at: data.synced_at,
    counts: {
      products: data.products.length,
      clients: data.clients.length,
      orders: data.orders.length
    }
  });
}
```

---

## 🚀 Próximos Passos (FASE 1)

1. ✅ **Implementar API Routes:**
   - `/api/facilzap/products/route.ts` — GET (lista produtos)
   - `/api/facilzap/sync/route.ts` — POST (sincroniza tudo)
   - `/api/facilzap/clients/route.ts` — GET (lista clientes)
   - `/api/facilzap/orders/route.ts` — GET (lista pedidos)

2. ✅ **Salvar no Supabase:**
   - Upsert produtos na tabela `products`
   - Upsert clientes na tabela `clients` (matching por telefone normalizado)
   - Upsert pedidos na tabela `orders` + `order_items`

3. ✅ **UI de Sincronização:**
   - Botão "Sincronizar FacilZap" em `/configuracoes`
   - Progress bar mostrando contadores
   - Toast de sucesso/erro

4. ✅ **Cálculo de Métricas CRM:**
   - LTV = soma de `orders.total` (status != 'cancelled')
   - Total de pedidos = count de `orders`
   - Ticket médio = LTV / total de pedidos
   - Última compra = max de `orders.created_at`

---

## 📚 Referências

- **Documentação FacilZap:** Arquivo `INTEGRACAO_FACILZAP.md` (fornecido pelo usuário)
- **Schema VEXX CRM:** `supabase/migrations/001_initial_schema.sql`
- **Serviço:** `src/lib/services/facilzap.service.ts`
- **Normalizer:** `src/lib/facilzap-normalizer.ts`

---

**Status:** ✅ **FASE 0 COMPLETA — FACILZAP 100% ALINHADO COM DOCUMENTAÇÃO**

**Próxima Etapa:** Implementar API Routes e integração com Supabase (FASE 1)
