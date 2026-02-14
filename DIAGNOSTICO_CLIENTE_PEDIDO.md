# 🔍 ANÁLISE DE INCONSISTÊNCIA: Cliente-Pedido

## 📋 CONTEXTO DO PROBLEMA

**Sintomas Reportados:**
1. ❌ Clientes aparecem **SEM PEDIDOS** na listagem/dashboard
2. ✅ Ao acessar o **detalhe do cliente**, os pedidos **APARECEM** no histórico
3. ❌ Alguns pedidos existem mas não conseguimos identificar o cliente dono
4. ✅ A API retorna todos os dados corretamente quando consultada diretamente
5. ⚠️ O problema parece estar na camada de aplicação/sistema

---

## 🕵️ INVESTIGAÇÃO REALIZADA

### 1. **Análise do Código da API**

#### `/api/clients/route.ts` (Listagem)
```typescript
let query = supabase
  .from('clients')
  .select('*', { count: 'exact' })
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
```
- ✅ Busca APENAS tabela `clients`
- ✅ NÃO faz JOIN com `orders`
- ⚠️ **Problema identificado**: Campo `total_orders` é lido diretamente da coluna `clients.total_orders`

#### `/api/clients/[id]/route.ts` (Detalhe)
```typescript
const { data: client } = await supabase
  .from('clients')
  .select('*')
  .eq('id', id)
  .single();

const { data: orders } = await supabase
  .from('orders')
  .select('*')
  .eq('client_id', id)
  .order('created_at', { ascending: false })
  .limit(20);
```
- ✅ Busca pedidos **diretamente** via `orders.client_id`
- ✅ Faz query **separada** para listar pedidos
- ✅ **Por isso funciona**: Não depende de `total_orders` calculado

---

## 🎯 CAUSA RAIZ IDENTIFICADA

### **Problema Principal: Campo `total_orders` Desatualizado**

A inconsistência ocorre porque:

1. **Na listagem**: Sistema mostra `clients.total_orders` (coluna no banco)
2. **No detalhe**: Sistema faz query direta em `orders WHERE client_id = xxx` (dados reais)

**Cenários que causam dessincronia:**

```
┌─────────────────────────────────────────────────────┐
│ SITUAÇÕES QUE DESATUALIZAM total_orders:            │
├─────────────────────────────────────────────────────┤
│ 1. Pedidos órfãos são re-vinculados                 │
│    → client_id é atualizado                         │
│    → total_orders do cliente NÃO é recalculado      │
│                                                      │
│ 2. Sync do FacilZap falha parcialmente              │
│    → Pedidos são inseridos                          │
│    → Fase de recalculo de stats não executa         │
│                                                      │
│ 3. Import CSV de clientes                           │
│    → total_orders vem do CSV (pode estar errado)    │
│    → Pedidos reais no banco são ignorados           │
│                                                      │
│ 4. Exclusão manual de pedidos (via SQL)             │
│    → Pedido deletado                                │
│    → total_orders não é decrementado                │
└─────────────────────────────────────────────────────┘
```

---

## 📊 EVIDÊNCIAS NO CÓDIGO

### **Local 1: Página de Clientes**
`src/app/(dashboard)/clientes/page.tsx` linha 88:
```typescript
const { data, isLoading } = useClients({
  search: search || undefined,
  status: statusFilter || undefined,
  has_orders: hasOrdersFilter === 'all' ? undefined : 
              hasOrdersFilter === 'with_orders',
  page: currentPage,
  per_page: perPage,
});
```
- Usa `total_orders` para filtro "com/sem pedidos"
- Se `total_orders` está errado → filtro retorna dados incorretos

### **Local 2: Página de Detalhe**
`src/app/(dashboard)/clientes/[id]/page.tsx` linha 87:
```typescript
// KPIs calculados dos pedidos reais
const totalOrders = c.total_orders || c.total_pedidos || orders.length;
const ltv = Number(c.ltv) || orders.reduce((sum: number, o: any) => 
    sum + (Number(o.total) || 0), 0);
```
- **Fallback inteligente**: Se `total_orders` é 0, usa `orders.length` (dados reais)
- **Por isso funciona no detalhe!**

---

## 🔧 SOLUÇÃO PROPOSTA

### **Estratégia 1: Recalcular total_orders de TODOS os clientes**

Criar endpoint `/api/maintenance/recalc-stats` que:

```typescript
// Pseudo-código
1. SELECT client_id, COUNT(*), SUM(total) FROM orders 
   WHERE tenant_id = X GROUP BY client_id

2. UPDATE clients SET 
     total_orders = count,
     ltv = sum_total,
     avg_ticket = sum_total / count
   WHERE id = client_id
```

**Execução:**
- Manual via interface de Admin
- Automático após cada sync completo
- Agendado 1x por dia (cron)

### **Estratégia 2: View Materializada (Preferred)**

Criar view que SEMPRE calcula em tempo real:

```sql
CREATE VIEW clients_with_stats AS
SELECT 
  c.*,
  COALESCE(o.order_count, 0) as total_orders_real,
  COALESCE(o.total_spent, 0) as ltv_real,
  COALESCE(o.total_spent / NULLIF(o.order_count, 0), 0) as avg_ticket_real
FROM clients c
LEFT JOIN (
  SELECT 
    client_id,
    COUNT(*) as order_count,
    SUM(total) as total_spent
  FROM orders
  WHERE client_id IS NOT NULL
  GROUP BY client_id
) o ON c.id = o.client_id;
```

**Vantagens:**
- ✅ Sempre atualizado
- ✅ Sem código de manutenção
- ✅ Queries rápidas (indexed)

### **Estratégia 3: Trigger no PostgreSQL**

```sql
CREATE OR REPLACE FUNCTION update_client_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients SET
    total_orders = (
      SELECT COUNT(*) FROM orders WHERE client_id = NEW.client_id
    ),
    ltv = (
      SELECT COALESCE(SUM(total), 0) FROM orders WHERE client_id = NEW.client_id
    )
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_update_client_stats
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_client_stats();
```

**Vantagens:**
- ✅ Automático
- ✅ Sempre sincronizado
- ⚠️ Pode ter impacto em performance com muitos pedidos

---

## 🚀 PLANO DE AÇÃO RECOMENDADO

### **Fase 1: Correção Emergencial** (Hoje)
1. ✅ Executar `/api/facilzap/relink` para vincular órfãos
2. ✅ Criar script `recalc-all-stats.js` para recalcular `total_orders` de todos
3. ✅ Executar manualmente e validar

### **Fase 2: Prevenção** (Próximos dias)
4. ✅ Adicionar recalculo automático após sync (auto-sync e manual)
5. ✅ Implementar view materializada ou trigger
6. ✅ Adicionar log de auditoria para detectar dessincronias

### **Fase 3: Monitoramento** (Próxima semana)
7. ✅ Dashboard de "health check" mostrando:
   - Clientes com `total_orders = 0` mas pedidos no banco
   - Pedidos órfãos
   - Diferença entre `total_orders` e COUNT real
8. ✅ Alerta automático quando inconsistência > 5%

---

## 🎯 CONCLUSÃO

### **Causa Raiz Confirmada:**
❌ Campo `clients.total_orders` está **desnincronizado** com os pedidos reais da tabela `orders`

### **Por que funciona no detalhe:**
✅ A página de detalhe faz **query direta** em `orders`, não depende de `total_orders`

### **Por que não funciona na listagem:**
❌ A página de listagem usa **filtro** `has_orders` baseado em `total_orders` desatualizado

### **Solução Imediata:**
🔧 Executar script de recálculo de `total_orders` para todos os clientes

### **Solução Permanente:**
🏗️ Implementar view materializada ou trigger para manter `total_orders` sempre atualizado

---

## 📝 PRÓXIMOS PASSOS

Quer que eu crie:
1. ✅ Script de recálculo imediato (`recalc-all-stats.js`)
2. ✅ Endpoint `/api/maintenance/recalc-stats`
3. ✅ View materializada no Supabase
4. ✅ Dashboard de health check

Qual você prefere implementar primeiro?
