# 🛍️ Configuração do FacilZap no VEXX CRM

## 📋 Resumo

O VEXX CRM 2.0 integra-se com o **FacilZap** para sincronizar:
- ✅ **Produtos** do catálogo
- ✅ **Clientes** que fazem pedidos
- ✅ **Pedidos** realizados
- ✅ **Carrinho** (gerar links de pagamento)

---

## 🔧 Como Configurar

### 1️⃣ **No Painel do FacilZap**

Acesse sua conta no FacilZap e obtenha:

1. **Token de API**
   - Vá em: **Configurações** → **API / Integrações**
   - Gere um novo token (ou copie o existente)
   - Exemplo: `fz_123abc456def789ghi`

2. **URL do Site**
   - Seu domínio personalizado ou subdomínio FacilZap
   - Exemplos:
     - `https://loja.facilzap.app.br` (subdomínio padrão)
     - `https://www.suaempresa.com.br` (domínio próprio)

3. **Configure Webhook (Opcional)**
   - Se você quiser receber pedidos automaticamente no VEXX CRM
   - URL do Webhook: `https://vexxcrm.netlify.app/api/webhooks/facilzap`
   - Eventos: `order.created`, `order.updated`, `order.paid`

---

### 2️⃣ **No VEXX CRM**

1. **Faça login** no VEXX CRM: https://vexxcrm.netlify.app
2. **Vá em**: Menu → **Configurações** (⚙️)
3. **Clique na aba**: **FacilZap**
4. **Preencha os campos**:
   - **Token**: Cole o token copiado do FacilZap
   - **URL do Site**: Cole a URL da sua loja
5. **Clique em**: **Salvar** ✅

---

## 🔄 Funcionalidades Disponíveis

### 📦 **Produtos**

**Página**: `/produtos`

- **Sincronizar Catálogo**:
  - Clique em **"Sincronizar FacilZap"**
  - Importa todos os produtos com:
    - Nome, descrição, preço
    - Imagens
    - Estoque
    - Categorias

- **Link de Produto**:
  - Cada produto mostra um botão para copiar link do WhatsApp
  - Formato: `https://wa.me/5511999999999?text=Olá! Vi o produto X`

### 👥 **Clientes**

**Página**: `/clientes`

- Clientes são **importados automaticamente** quando:
  - Fazem um pedido no FacilZap
  - Interagem via WhatsApp

- Dados sincronizados:
  - Nome completo
  - Telefone (normalizado)
  - E-mail
  - Endereço de entrega

### 🛒 **Pedidos**

**Página**: `/pedidos`

- Pedidos são **importados automaticamente** do FacilZap
- Informações:
  - Número do pedido
  - Produtos
  - Valor total
  - Status (Pendente, Pago, Enviado, Entregue)
  - Cliente
  - Data

### 💳 **Carrinho (Link de Pagamento)**

**API**: `/api/facilzap/cart-link`

- Gera link de carrinho personalizado
- Usado na conversa do WhatsApp
- Exemplo: `https://loja.facilzap.app.br/carrinho?items=123,456`

---

## 🌐 URLs Configuradas

### **Produção (Netlify)**
- **CRM**: `https://vexxcrm.netlify.app`
- **Webhook FacilZap**: `https://vexxcrm.netlify.app/api/webhooks/facilzap` *(quando implementado)*
- **API Base**: `https://vexxcrm.netlify.app/api`

### **Local (Desenvolvimento)**
- **CRM**: `http://localhost:3000`
- **Webhook FacilZap**: `http://localhost:3000/api/webhooks/facilzap`
- **API Base**: `http://localhost:3000/api`

---

## 📱 Exemplo de Uso no WhatsApp

### Cenário: Cliente pede informações sobre produto

1. **Cliente envia**: "Quero saber sobre a Camiseta Azul"
2. **Anne (IA)** responde:
   ```
   Camiseta Azul - Tamanho P, M, G
   R$ 79,90

   🛒 Adicionar ao carrinho:
   https://loja.facilzap.app.br/produto/123
   ```
3. **Cliente clica** no link → **Vai direto para o produto** no FacilZap
4. **Cliente finaliza compra** → **Pedido aparece automaticamente** no VEXX CRM

---

## 🔐 Segurança

- ✅ **Token nunca é exposto** no client-side
- ✅ **Requisições autenticadas** via Bearer Token
- ✅ **Multi-tenant**: Cada loja tem seu próprio token isolado
- ✅ **Webhook com validação** de origem (quando implementado)

---

## 🚨 Solução de Problemas

### ❌ **Erro: "Token inválido"**
- Verifique se o token foi copiado corretamente
- Certifique-se de que o token está ativo no FacilZap
- Gere um novo token se necessário

### ❌ **Erro: "URL do site inválida"**
- A URL deve começar com `https://`
- Exemplo correto: `https://loja.facilzap.app.br`
- Exemplo errado: `loja.facilzap.app.br` (sem https)

### ❌ **Produtos não aparecem**
- Clique em **"Sincronizar FacilZap"** novamente
- Verifique se há produtos cadastrados no FacilZap
- Abra o Console do navegador (F12) e veja se há erros

### ❌ **Pedidos não sincronizam**
- Verifique se o webhook está configurado corretamente no FacilZap
- Teste a URL do webhook manualmente
- Verifique os logs do servidor

---

## 📚 Documentação da API FacilZap

**Base URL**: `https://api.facilzap.app.br`

### Principais Endpoints Usados:

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/products` | GET | Lista todos os produtos |
| `/products/:id` | GET | Detalhes de um produto |
| `/orders` | GET | Lista todos os pedidos |
| `/orders/:id` | GET | Detalhes de um pedido |
| `/customers` | GET | Lista todos os clientes |
| `/cart/link` | POST | Gera link de carrinho |

**Headers obrigatórios**:
```
Authorization: Bearer SEU_TOKEN_AQUI
Content-Type: application/json
```

---

## 📞 Suporte

- **GitHub**: https://github.com/Cjota221/vexxcrm
- **Issues**: https://github.com/Cjota221/vexxcrm/issues
- **Documentação**: Este arquivo 😊

---

## ✅ Checklist de Configuração

- [ ] Obtive o token no painel do FacilZap
- [ ] Copiei a URL do meu site FacilZap
- [ ] Configurei no VEXX CRM (Configurações → FacilZap)
- [ ] Testei a sincronização de produtos
- [ ] Configurei webhook (opcional)
- [ ] Testei criar um pedido de teste

---

**Data de Criação**: 12/02/2026  
**Última Atualização**: 12/02/2026  
**Versão do VEXX CRM**: 2.0
