# 📦 Troubleshooting: Pedidos não sincronizam

## Diagnóstico Rápido

### 1️⃣ Verificar os logs do servidor
Ao abrir o Cérebro de um cliente, procure no console do servidor por:
```
[clients/{clientId}] Buscando pedidos para client_id: {uuid}
[clients/{clientId}] Pedidos encontrados: N
[clients/{clientId}] Total pedidos retornados: N
[clients/{clientId}] ✅ Retornando response com recent_orders: N item(s)
```

**Se ver `Pedidos encontrados: 0`** → Nenhum pedido vinculado a este cliente no banco

### 2️⃣ Testar a API localmente
```bash
cd "c:\Users\carol\Downloads\vexx crm"
npm install  # se não tiver
node scripts/test-client-orders.js {clientId}
```

Exemplo:
```bash
node scripts/test-client-orders.js 550e8400-e29b-41d4-a716-446655440000
```

### 3️⃣ Verificar banco de dados

**Query: Contar pedidos totais**
```sql
SELECT COUNT(*) FROM orders WHERE tenant_id = '{tenantId}';
```

**Query: Contar pedidos por cliente**
```sql
SELECT client_id, COUNT(*) FROM orders 
WHERE tenant_id = '{tenantId}' 
GROUP BY client_id 
ORDER BY COUNT(*) DESC 
LIMIT 10;
```

**Query: Ver pedidos órfãos (sem cliente)**
```sql
SELECT id, external_id, metadata->>'cliente_telefone' 
FROM orders 
WHERE tenant_id = '{tenantId}' AND client_id IS NULL 
LIMIT 10;
```

**Query: Ver se há pedidos com o telefone deste cliente**
```sql
SELECT id, external_id, client_id FROM orders 
WHERE tenant_id = '{tenantId}' 
  AND (metadata->>'cliente_telefone' ILIKE '%{PHONE}%' OR metadata->>'cliente_whatsapp' ILIKE '%{PHONE}%')
LIMIT 10;
```

## Possíveis Causas

### ❌ Pedidos estão órfãos (client_id = NULL)
**Solução:** A API deveria revinculá-los automaticamente via fallback 2. Se isso não funciona:
```sql
-- Atualizar manualmente
UPDATE orders 
SET client_id = '{clientId}' 
WHERE tenant_id = '{tenantId}' 
  AND client_id IS NULL 
  AND metadata->>'cliente_telefone' ILIKE '%{phone_digits}%'
  AND client_id != '{clientId}';
```

### ❌ Pedidos com external_id diferente
A API tenta 3 estratégias:
1. `client_id = {clientId}` direto
2. Mesma phone (duplicatas)
3. Órfãos por phone no metadata
4. external_client_id

Se nenhuma funciona, o cliente pode estar com dados separados

### ❌ API retorna vazio mas há pedidos
Pode ser problema de:
- Tenant_id não bate
- RLS (Row Level Security) filtrando os dados
- Query timeout (muitos dados)

**Debug:** Ver logs da API — se não vê `"Buscando pedidos"`, é problema anterior (cliente não encontrado)

## Fluxo Completo do Debug

1. **Abrir DevTools** → Network tab
2. **Selecionar cliente** no chat
3. **Procurar request** para `/api/clients/{id}`
   - Status 200?
   - Response tem `recent_orders`?
   - `recent_orders` array vazio ou com dados?

4. **Se vazio:**
   - Copiar clientId
   - Ver logs do servidor (item 1️⃣ acima)
   - Se `Pedidos encontrados: 0`, executar queries do item 3️⃣

5. **Se com dados:**
   - Checar se OrdersTab renderiza
   - Procurar erros no console do browser
   - Verificar se activeTab é 'orders'

## Ação Rápida para Relinkar Pedidos

Se descobrir que há pedidos órfãos com o telefone correto:

```sql
-- 1. Ver órfãos
SELECT COUNT(*) FROM orders 
WHERE client_id IS NULL 
  AND metadata->>'cliente_telefone' ILIKE '%{phone_digits}%';

-- 2. Relinkar (CUIDADO: pode vincular ao cliente errado!)
UPDATE orders 
SET client_id = '{clientId}' 
WHERE client_id IS NULL 
  AND metadata->>'cliente_telefone' ILIKE '%{phone_digits}%'
  AND client_id IS DISTINCT FROM '{clientId}';

-- 3. Confirmar
SELECT COUNT(*) FROM orders 
WHERE client_id = '{clientId}';
```

## Checklist Final

- [ ] Servidor está rodando com logs visíveis?
- [ ] Há pedidos no banco (query item 3)?
- [ ] Pedidos têm o telefone correto no metadata?
- [ ] Cliente existe com phone_normalized correto?
- [ ] API retorna recent_orders na resposta?
- [ ] OrdersTab recebe os dados e renderiza?
