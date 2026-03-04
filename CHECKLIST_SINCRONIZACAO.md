# ✅ CHECKLIST RÁPIDO: Corrigir Sincronização em 5 Minutos

## 🎯 Objective
Sincronizar pedidos corretamente com o "cérebro do cliente"

## ⏱️ Tempo Total: ~5 minutos

---

## PASSO 1️⃣: Preparar
- [ ] Abra um terminal PowerShell
- [ ] Navegue para: `cd c:\Users\carol\Downloads\vexx crm`
- [ ] Tenha seu `tenant_id` à mão (copie da URL do dashboard)

**Exemplos de tenant_id:**
```
550e8400-e29b-41d4-a716-446655440000  ← Procure por este padrão em SETTINGS → TENANT ID
```

---

## PASSO 2️⃣: Diagnosticar (1 min) 🔍
**Execute:**
```bash
node scripts/diagnose-sync-orders.js {seu_tenant_id}
```

**Copie a resposta:**
```
1️⃣ Pedidos órfãos: _____
2️⃣ Inconsistências: _____
3️⃣ Clientes com 0 registrado mas com pedidos: _____
```

**Se tudo = 0, pode pular para PASSO 5 ✓**

---

## PASSO 3️⃣: Vincular Órfãos (2 min) 🔗

### Opção A (Recomendado): Terminal
```bash
node scripts/relink-orders-sync.js {seu_tenant_id}
```

### Opção B: cURL (Se tiver token)
```bash
curl -X POST http://localhost:3000/api/facilzap/relink-orphans \
  -H "Authorization: Bearer seu_token_aqui" \
  -H "Content-Type: application/json"
```

**Aguarde a resposta:**
```json
{
  "relinked": 38 ← Quantos foram vinculados
  "unmatched": 4 ← Quantos não conseguiu
}
```

✅ **Se >90% foi vinculado, está bom!**

---

## PASSO 4️⃣: Recalcular Stats (1-2 min) 🔢

### Opção A: Terminal
```bash
node scripts/recalc-all-stats.js {seu_tenant_id}
```

### Opção B: cURL
```bash
curl -X POST http://localhost:3000/api/facilzap/recalc-stats \
  -H "Authorization: Bearer seu_token_aqui" \
  -H "Content-Type: application/json"
```

**Aguarde:**
```json
{
  "updated": 127 ← Clientes atualizados
  "clients_with_orders": 95
  "clients_without_orders": 32
}
```

---

## PASSO 5️⃣: Validar (1 min) ✅

```bash
node scripts/validate-sync.js {seu_tenant_id}
```

### Sucesso se mostrar:
```
Pedidos órfãos: 0 ✓
Inconsistências: 0 ✓
Clientes com 0 registrado mas com pedidos: 0 ✓
Health Score: ~100% ✓
```

---

## 🧪 Testar na Interface

1. Abra o dashboard do VEXX
2. Vá para **Clientes**
3. Procure um cliente que tinha 0 pedidos antes
4. Verifique se agora mostra o número correto
5. Clique no cliente para abrir "Cérebro"
6. Verifique se os pedidos aparecem

**Se tudo OK = ✅ PRONTO!**

---

## ⚠️ Se Não Funcionar

### **Cenário 1: Ainda tem órfãos**
```bash
# Ver detalhes
node scripts/diagnose-sync-orders.js {tenant_id}

# Se ainda > 20 órfãos, entram em contato com suporte
# Possível que cliente não exista no BD
```

### **Cenário 2: Recalc falhou**
```bash
# Verifique se há pedidos para este cliente
SELECT COUNT(*) FROM orders WHERE client_id = '{cliente_id}';

# Se = 0, significa relink não funcionou.
# Volte ao Passo 3 e verifique erros
```

### **Cenário 3: Terminal não reconhece tenant_id**
```bash
# Verifique se é válido (formato UUID)
# 550e8400-e29b-41d4-a716-446655440000 ← Correto
# abc123 ← Errado
```

---

## 📊 Resumo Rápido

| Etapa | Comando | Tempo | Status |
|-------|---------|-------|--------|
| 1. Diagnosticar | `node scripts/diagnose-sync-orders.js {id}` | 1 min | 🔍 |
| 2. Vincular | `node scripts/relink-orders-sync.js {id}` | 1 min | 🔗 |
| 3. Recalcular | `node scripts/recalc-all-stats.js {id}` | 2 min | 🔢 |
| 4. Validar | `node scripts/validate-sync.js {id}` | 1 min | ✅ |
| **Total** | | **5 min** | **✅** |

---

## 🆘 Suporte

Se não conseguir:

1. Verifique se rodou TODOS os passos na ordem
2. Verifique o `tenant_id` (deve ser UUID válido)
3. Se tiver erro, salve a mensagem e compartilhe
4. Veja arquivo: [SINCRONIZACAO_PEDIDOS_CORRECAO.md](./SINCRONIZACAO_PEDIDOS_CORRECAO.md)

---

**🎉 Sucesso! A sincronização agora está funcionando corretamente!**
