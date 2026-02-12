# 🏗️ FASE 0 — FUNDAÇÃO ARQUITETURAL COMPLETA

## ✅ Resumo de Execução

**Data:** 12 de fevereiro de 2026  
**Status:** ✅ CONCLUÍDO (8/8 tarefas)  
**Erros de compilação:** 0  

---

## 📋 Tarefas Executadas

### 1. ✅ Correção `users` → `profiles` no SSE route
**Arquivo:** `src/app/api/sse/route.ts`

**Problema:** Consultava tabela `users` (inexistente) em vez de `profiles`  
**Solução:**
- Linha 32: `.from('users')` → `.from('profiles')`
- Linha 42: `userData.tenant_id` → `profile.tenant_id`

**Status:** Rota SSE agora busca `tenant_id` corretamente do profile autenticado.

---

### 2. ✅ Correção `users` → `profiles` no tenants/config route
**Arquivo:** `src/app/api/tenants/config/route.ts`

**Problema:** GET e PUT consultavam tabela `users` (inexistente)  
**Solução:**
- Linha 28 (GET): `.from('users')` → `.from('profiles')`
- Linha 68 (PUT): `.from('users')` → `.from('profiles')`
- Linha 77 e 88: `userData.tenant_id` → `profile.tenant_id`

**Status:** Ambas as rotas (GET/PUT) agora funcionam corretamente.

---

### 3. ✅ Criação do Middleware de Proteção
**Arquivo:** `src/middleware.ts` (NOVO)

**Recursos implementados:**
- ✅ Validação JWT Supabase via `createServerSupabaseClient()`
- ✅ Busca de `tenant_id` do profile autenticado
- ✅ Proteção de rotas `/dashboard/*` → redireciona para `/login` se não autenticado
- ✅ Proteção de rotas `/api/*` (exceto `/api/auth`, `/api/webhooks`)
- ✅ Injeta header `x-tenant-id` em todas as API routes protegidas
- ✅ Redireciona usuários autenticados que tentam acessar `/login` → `/`
- ✅ Matcher configurado para excluir `_next/static`, `_next/image`, `favicon.ico`, `images/`

**Fluxo:**
```
Request → Middleware
   ↓
   ├── Rota pública (auth, webhooks) → next()
   ├── Dashboard sem auth → redirect(/login?redirect=pathname)
   ├── Dashboard com auth → next()
   ├── API sem auth → 401
   └── API com auth → inject x-tenant-id header → next()
```

**Status:** Sistema agora protege todas as rotas automaticamente.

---

### 4. ✅ Helper getTenantFromRequest()
**Arquivo:** `src/lib/auth-helpers.ts` (NOVO)

**Funções exportadas:**

#### `getTenantFromRequest(request: NextRequest)`
Extrai `userId`, `tenantId` e `profile` completo de uma API route.  
Prioridade:
1. Header `x-tenant-id` (injetado pelo middleware)
2. Token JWT no header `Authorization`
3. Cookie `sb-access-token`

**Exemplo de uso:**
```typescript
export async function GET(request: NextRequest) {
  try {
    const { tenantId, profile } = await getTenantFromRequest(request);
    
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId);
    
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
```

#### `getTenantConfig(tenantId: string)`
Busca configurações do tenant (tokens de integração).  
Retorna: `evolution_api_url`, `evolution_api_key`, `facilzap_token`, `openai_api_key`

#### `hasIntegration(tenantId, integration)`
Valida se uma integração ('facilzap' | 'evolution' | 'openai') está configurada.

**Status:** API routes agora têm acesso fácil ao `tenant_id` sem código repetitivo.

---

### 5. ✅ Correção do Webhook Evolution
**Arquivo:** `src/app/api/webhooks/evolution/route.ts`

**Problemas:**
- Usava colunas que não existem no schema: `remote_jid`, `message_id`, `from_me`
- Não criava/buscava `conversation_id` antes de salvar mensagem

**Correções:**

**5.1. Função `handleNewMessage()`:**
- Adicionado: Buscar ou criar `conversation` antes de salvar mensagem
- Mapeamento de campos:
  - `message_id` → `external_id` (ID da Evolution API)
  - `from_me: boolean` → `direction: 'inbound' | 'outbound'`
  - `remote_jid` → Removido (não existe na tabela)
  - Adicionado: `sender_name`, `sender_phone`
- Adicionado: `conversation_id` obrigatório

**5.2. Função `handleMessageStatus()`:**
- `message_id` → `external_id` nas queries
- Retorna `message.id` (UUID interno) em vez do `external_id` no evento SSE

**Status:** Webhook agora salva mensagens corretamente no schema SQL.

---

### 6. ✅ Estrutura de Services
**Pasta criada:** `src/lib/services/`

**Arquivos criados:**
- ✅ `evolution.service.ts` — Integração Evolution API (WhatsApp)
- ✅ `anne.service.ts` — Integração OpenAI GPT-4o
- ✅ `facilzap.service.ts` — Integração FacilZap (E-commerce)

**Princípio SaaS:**
Todos os services recebem **tokens/keys como parâmetros** (não leem `.env` globais).

---

### 7. ✅ FacilZap Service Completo
**Arquivo:** `src/lib/services/facilzap.service.ts`

**Funções implementadas:**

#### Produtos
- `fetchProducts(config, page, perPage)` — Busca 1 página
- `fetchAllProducts(config)` — Busca TODAS as páginas em **paralelo** (Promise.all)
- `fetchProductById(config, productId)` — Busca 1 produto

#### Clientes
- `fetchClients(config, page, perPage)` — Lista clientes
- `fetchClientById(config, clientId)` — Busca 1 cliente

#### Pedidos
- `fetchOrders(config, page, perPage, filters)` — Lista pedidos (com filtros)
- `fetchOrderById(config, orderId)` — Busca 1 pedido

#### Carrinho Abandonado
- `generateCartLink(config, items, customerPhone)` — Gera link de carrinho

#### Sincronização
- `syncStoreData(config)` — Busca produtos, clientes e pedidos **em paralelo**

**Status:** Service pronto para uso nas API routes com busca otimizada.

---

### 8. ✅ FacilZap Normalizer
**Arquivo:** `src/lib/facilzap-normalizer.ts`

**Problema resolvido:** Hierarquia de produtos com variações.

**Lógica implementada:**

#### Produto sem variações:
```json
{
  "id": 123,
  "name": "Tênis Nike",
  "price": 299.90,
  "promotional_price": 249.90,
  "stock": 10
}
```
→ Retorna 1 produto normalizado

#### Produto COM variações:
```json
{
  "id": 123,
  "name": "Camiseta",
  "price": 59.90,
  "variations": [
    { "id": 1, "name": "P", "price": 59.90, "stock": 5 },
    { "id": 2, "name": "M", "price": 59.90, "stock": 8 },
    { "id": 3, "name": "G", "price": 64.90, "stock": 3 }
  ]
}
```
→ Retorna **4 produtos normalizados:**
1. Produto pai (sem estoque)
2. "Camiseta - P" (stock: 5)
3. "Camiseta - M" (stock: 8)
4. "Camiseta - G" (stock: 3, preço diferente)

**Regras de preço:**
1. `promotional_price` → `price`
2. `price` original → `compare_at_price`
3. Variação sem preço → herda do pai

**Funções auxiliares:**
- `groupByCategory(products)` — Agrupa por categoria
- `filterInStock(products)` — Apenas com estoque
- `filterActive(products)` — Apenas ativos
- `findBySKU(products, sku)` — Busca por SKU
- `searchByName(products, query)` — Busca fuzzy

**Status:** Normalização de variações/preços/estoque implementada corretamente.

---

## 🎯 Próximos Passos (FASE 1)

### Implementar APIs reais com os services

#### 1. `/api/facilzap/products/route.ts`
```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { fetchAllProducts } from '@/lib/services/facilzap.service';

export async function GET(request: NextRequest) {
  const { tenantId } = await getTenantFromRequest(request);
  const tenant = await getTenantConfig(tenantId);
  
  if (!tenant.facilzap_token) {
    return NextResponse.json({ error: 'FacilZap não configurado' }, { status: 400 });
  }
  
  const products = await fetchAllProducts({ token: tenant.facilzap_token });
  return NextResponse.json({ data: products });
}
```

#### 2. `/api/whatsapp/connect/route.ts`
```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { createInstance } from '@/lib/services/evolution.service';

export async function POST(request: NextRequest) {
  const { tenantId } = await getTenantFromRequest(request);
  const tenant = await getTenantConfig(tenantId);
  
  const qrCode = await createInstance({
    apiUrl: tenant.evolution_api_url!,
    apiKey: tenant.evolution_api_key!,
    instanceName: tenant.evolution_instance || `vexx-${tenantId}`,
  });
  
  return NextResponse.json({ data: { qr_code: qrCode } });
}
```

#### 3. `/api/anne/chat/route.ts`
```typescript
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { chat } from '@/lib/services/anne.service';
import { fetchAllProducts } from '@/lib/services/facilzap.service';

export async function POST(request: NextRequest) {
  const { tenantId } = await getTenantFromRequest(request);
  const tenant = await getTenantConfig(tenantId);
  const { message } = await request.json();
  
  // Buscar produtos para contexto
  const products = await fetchAllProducts({ token: tenant.facilzap_token! });
  
  const response = await chat(
    { apiKey: tenant.openai_api_key! },
    message,
    [],
    { products }
  );
  
  return NextResponse.json({ data: response });
}
```

---

## 📊 Métricas de Arquitetura

### Antes (Estado Inicial)
- ❌ 2 rotas com tabela `users` inexistente
- ❌ 0 proteção de rotas (dashboard acessível sem login)
- ❌ 0 helpers reutilizáveis de autenticação
- ❌ 0 services parametrizados (dependiam de `.env` global)
- ❌ Webhook Evolution incompatível com schema SQL
- ❌ 0 normalização de dados FacilZap

### Depois (Fundação Completa)
- ✅ Todas as rotas usando `profiles` corretamente
- ✅ Middleware protegendo `/dashboard` e `/api/*`
- ✅ Helper `getTenantFromRequest()` reutilizável
- ✅ 3 services SaaS (Evolution, Anne, FacilZap)
- ✅ Webhook Evolution alinhado com schema SQL
- ✅ Normalizer FacilZap tratando variações/preços/estoque
- ✅ 0 erros de compilação TypeScript

---

## 🎨 Padrão de API Route (Template)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { someService } from '@/lib/services/some.service';

export async function GET(request: NextRequest) {
  try {
    // 1. Autenticar e obter tenant_id
    const { tenantId, profile } = await getTenantFromRequest(request);
    
    // 2. Buscar configurações do tenant (tokens)
    const tenant = await getTenantConfig(tenantId);
    
    // 3. Validar se integração está configurada
    if (!tenant.some_api_token) {
      return NextResponse.json(
        { error: 'Configure a integração em Configurações' },
        { status: 400 }
      );
    }
    
    // 4. Usar service parametrizado
    const data = await someService({
      token: tenant.some_api_token,
      // ... outros parâmetros do banco
    });
    
    // 5. Retornar
    return NextResponse.json({ data });
    
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes('autorizado') ? 401 : 500 }
    );
  }
}
```

---

## 📝 Checklist de Ativação

Antes de ativar as integrações, o lojista precisa:

### FacilZap
1. [ ] Acessar `/configuracoes`
2. [ ] Clicar na aba "FacilZap"
3. [ ] Colar o token da API FacilZap
4. [ ] Salvar
5. [ ] Clicar em "Sincronizar Produtos"

### WhatsApp (Evolution)
1. [ ] Acessar `/configuracoes`
2. [ ] Clicar na aba "WhatsApp"
3. [ ] Clicar em "Conectar WhatsApp"
4. [ ] Escanear QR Code com o celular
5. [ ] Aguardar confirmação de conexão

### Anne IA
1. [ ] Acessar `/configuracoes`
2. [ ] Clicar na aba "Anne (IA)"
3. [ ] Colar a API Key da OpenAI
4. [ ] Personalizar prompt do sistema (opcional)
5. [ ] Ativar Anne

---

## 🚀 Conclusão

A **FASE 0 — FUNDAÇÃO ARQUITETURAL** está 100% completa.

O sistema agora possui:
- ✅ Autenticação e proteção de rotas funcionando
- ✅ Isolamento multi-tenant garantido (middleware + helpers)
- ✅ Camada de services parametrizada (SaaS-ready)
- ✅ Webhook Evolution alinhado com banco de dados
- ✅ Normalização de dados FacilZap implementada

**Próxima etapa:** Implementar as API routes reais usando os services criados (FASE 1).

---

**Arquivos criados/modificados nesta FASE:**
```
src/middleware.ts                          (NOVO)
src/lib/auth-helpers.ts                    (NOVO)
src/lib/services/evolution.service.ts      (NOVO)
src/lib/services/anne.service.ts           (NOVO)
src/lib/services/facilzap.service.ts       (NOVO)
src/lib/facilzap-normalizer.ts             (NOVO)
src/app/api/sse/route.ts                   (CORRIGIDO)
src/app/api/tenants/config/route.ts        (CORRIGIDO)
src/app/api/webhooks/evolution/route.ts    (CORRIGIDO)
```

**Total:** 6 arquivos novos + 3 corrigidos = **9 arquivos modificados**
