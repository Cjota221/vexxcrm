# 🔧 GUIA DE CORREÇÃO: Sincronização de Pedidos Não Funciona

## 📋 Resumo dos Problemas Identificados

A sincronização de pedidos **NÃO está funcionando corretamente** porque:

1. ❌ **Pedidos órfãos** (sem `client_id`) não estão sendo vinculados aos clientes
2. ❌ **Campo `total_orders` desatualizado** na tabela `clients`
3. ❌ **Listagem de clientes** mostra 0 pedidos mesmo que existam (porque usa `total_orders` desatualizado)
4. ✅ **Detalhe do cliente** funciona porque faz busca direta de pedidos (fallback)

---

## 🚀 AÇÕES PARA CORRIGIR (Em Ordem)

### **PASSO 1: Diagnosticar o Problema Atual** ⚙️

Primeiro, você precisa saber o estado atual. Rode o script de diagnóstico:

```bash
cd "c:\Users\carol\Downloads\vexx crm"
node scripts/diagnose-sync-orders.js {seu_tenant_id}
```

**Substitua `{seu_tenant_id}` pelo UUID do seu tenant.**

Este script vai mostrar:
- ❌ Quantos pedidos órfãos existem
- ⚠️ Quantas inconsistências há entre `total_orders` e a realidade
- 📊 Dados recentes dos últimos 7 dias

**Exemplo de output:**
```
1️⃣ Verificando pedidos órfãos...
   ⚠️ Encontrados 42 pedidos órfãos
   Exemplos:
   [1] PED-001 - João Silva (11987654321)
   [2] PED-002 - Maria Santos (21987654321)

2️⃣ Verificando inconsistência de total_orders...
   ⚠️ Encontradas 8 inconsistências
   [1] João Silva (11987654321)
       Registrado: 0 | Real: 5
   [2] Maria Santos (21987654321)
       Registrado: 2 | Real: 7
```

---

### **PASSO 2: Vincular Pedidos Órfãos** 🔗

Agora execute o endpoint que vincula os pedidos órfãos aos clientes:

#### **Opção A: Via API (Recomendado)**

```bash
curl -X POST http://localhost:3000/api/facilzap/relink-orphans \
  -H "Authorization: Bearer {seu_token}" \
  -H "Content-Type: application/json"
```

#### **Opção B: Via Script Node**

```bash
node scripts/relink-orders-sync.js {seu_tenant_id}
```

**O que este endpoint faz:**
- Busca TODOS os pedidos sem `client_id`
- Tenta vincular usando múltiplas estratégias (telefone, CPF, email, nome, Facilzap ID)
- Retorna quantos conseguiu vincular + quantos ficaram órfãos

**Exemplo de resposta:**
```json
{
  "success": true,
  "relinked": 38,
  "unmatched": 4,
  "total_orphans": 42,
  "duration_ms": 3421,
  "unmatched_sample": [
    {
      "external_id": "12345",
      "clientName": "Cliente X",
      "clientPhone": "desconhecido"
    }
  ]
}
```

✅ **Se mais de 90% foi vinculado, está bom!**  
⚠️ **Se ficaram órfãos não correspondentes, verifique se o cliente existe no BD**

---

### **PASSO 3: Recalcular Estatísticas** 🔢

Execute o endpoint que recalcula `total_orders`, `ltv`, `avg_ticket` de TODOS os clientes:

#### **Opção A: Via API (Recomendado)**

```bash
curl -X POST http://localhost:3000/api/facilzap/recalc-stats \
  -H "Authorization: Bearer {seu_token}" \
  -H "Content-Type: application/json"
```

#### **Opção B: Via Script Node**

```bash
node scripts/recalc-all-stats.js {seu_tenant_id}
```

**O que este endpoint faz:**
- Busca TODOS os pedidos do tenant
- Agrupa por cliente
- Recalcula: `total_orders`, `ltv`, `avg_ticket`, `last_order_at`
- Reseta para 0 clientes que não têm pedidos

**Exemplo de resposta:**
```json
{
  "success": true,
  "updated": 127,
  "errors": 0,
  "total_updates": 127,
  "clients_with_orders": 95,
  "clients_without_orders": 32,
  "duration_ms": 8234
}
```

✅ **Pronto! Agora a listagem de clientes vai mostrar os pedidos correto**

---

### **PASSO 4: Testar a Sincronização** ✅

Volte para a interface e verifique se:

1. **Lista de Clientes**: Agora mostra `total_orders` correto? ✓
2. **Detalhe do Cliente** ("Cérebro"): Mostra os pedidos recentes? ✓
3. **Filtro "Com pedidos"**: Começou a funcionar? ✓

Se tudo OK, **problema resolvido!**

---

## 🔄 Para Evitar o Problema no Futuro

### **Automático (Já Implementado)**

A partir de agora:
- ✅ Cada `auto-sync` (5 em 5 min) vai vincular órfãos automaticamente
- ✅ Se houver muitos órfãos (>5), faz recalculo **COMPLETO** em vez de incremental
- ✅ Garante que `total_orders` fica sempre atualizado

### **Manual (Se Necessário)**

Se em algum momento a sincronização ficar errada novamente:

```bash
# Diagnóstico rápido
node scripts/diagnose-sync-orders.js {tenant_id}

# Se >20 órfãos
curl -X POST http://localhost:3000/api/facilzap/relink-orphans \
  -H "Authorization: Bearer {token}"

# Se inconsistências encontradas
curl -X POST http://localhost:3000/api/facilzap/recalc-stats \
  -H "Authorization: Bearer {token}"
```

---

## 🐛 Se Ainda Não Funcionar

### **Checklist de Debug:**

1. **Pedidos ficaram órfãos mesmo depois do relink?**
   - Verifique se o cliente EXISTE no BD com os dados corretos
   - Query: `SELECT * FROM clients WHERE tenant_id = '{id}' AND phone LIKE '%1198765%'`
   - Se não existir, crie manualmente ou importe via CSV

2. **`total_orders` ainda está 0 após recalc?**
   - Verifique se os pedidos têm `client_id` preenchido
   - Query: `SELECT COUNT(*) FROM orders WHERE tenant_id = '{id}' AND client_id IS NOT NULL`
   - Se contar 0, significa relink falhou totalmente

3. **Auto-sync não está rodando?**
   - Verifique se há token FacilZap configurado
   - Verifique os logs da aplicação para erros

---

## 📊 Monitoramento Contínuo

### **Configurar alertas** (Opcional)

Adicione esta query ao seu cron job (a cada hora):

```sql
-- Detectar pedidos órfãos novamente
SELECT COUNT(*) as orphan_count 
FROM orders 
WHERE tenant_id = '{tenant_id}' 
AND client_id IS NULL 
AND created_at > NOW() - INTERVAL '1 hour';

-- Se > 10, executar relink automaticamente ⚠️
```

---

## ✅ Resumo das Correções Implementadas

| Problema | Solução |
|----------|---------|
| Pedidos órfãos | Novo endpoint `/api/facilzap/relink-orphans` com 5 estratégias |
| Stats desatualizado | Novo endpoint `/api/facilzap/recalc-stats` (completo) |
| Auto-sync fraco | Melhorado auto-sync com recalculo COMPLETO se >5 relinks |
| Sem feedback | Script diagnóstico `diagnose-sync-orders.js` |

---

## 🎯 Próximos Passos

1. ✅ Execute `diagnose-sync-orders.js` para ver estado atual
2. ✅ Execute `/api/facilzap/relink-orphans` para vincular órfãos
3. ✅ Execute `/api/facilzap/recalc-stats` para atualizar stats
4. ✅ Confirme que listagem de clientes e detalhe estão OK
5. ✅ Monitor continuo: rode diagnóstico 1x por semana

**Tempo total para corrigir: ~2-5 minutos** ⏱️
