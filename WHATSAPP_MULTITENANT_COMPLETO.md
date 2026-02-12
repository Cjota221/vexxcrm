# ✅ WhatsApp Multi-Tenant — Arquitetura Completa Implementada

**Data:** 12 de Fevereiro de 2026  
**Status:** ✅ **PRONTO PARA USO**

---

## 📊 Resumo da Implementação

### 1. **Webhook Evolution Corrigido** ✅

**Arquivo:** `src/app/api/webhooks/evolution/route.ts`

#### Ajustes Realizados:

✅ **Mapeamento correto de colunas:**
- `message_id` → `external_id` (ID da mensagem na Evolution API)
- `from_me` → `direction: 'inbound' | 'outbound'`
- `remote_jid` → não usado (extraído telefone e normalizado)

✅ **PhoneNormalizer integrado:**
```typescript
const phoneNormalized = PhoneNormalizer.canonical(phone);
const phoneDisplay = PhoneNormalizer.normalize(phone);
```

✅ **Criação automática de conversa:**
- Busca ou cria `conversation` para cada cliente
- Vincula mensagem ao `conversation_id` correto

✅ **Tenant identificado corretamente:**
```typescript
const { data: tenant } = await supabase
  .from('tenants')
  .select('id, evolution_instance')
  .eq('evolution_instance', instance)  // Campo correto do schema
  .single();
```

✅ **Campos salvos conforme schema SQL:**
```typescript
{
  tenant_id: tenantId,
  conversation_id: conversationId,
  client_id: client.id,
  external_id: messageId,        // ✅ ID da Evolution
  direction: fromMe ? 'outbound' : 'inbound',  // ✅ enum correto
  sender_name: fromMe ? 'Atendente' : pushName,
  sender_phone: fromMe ? null : phone,
  content: text,
  type,  // text, image, video, audio, document, sticker
  status: fromMe ? 'sent' : 'delivered',
  created_at: new Date(messageTimestamp * 1000).toISOString(),
}
```

---

### 2. **Rota de Conexão** ✅

**Arquivo:** `src/app/api/whatsapp/connect/route.ts`

#### POST `/api/whatsapp/connect` — Conectar WhatsApp

**Fluxo:**
1. Verifica se tenant tem credenciais Evolution API
2. Gera `instanceName` único se não existir: `tenant-{uuid}-{timestamp}`
3. Verifica status atual da instância (se já está conectada)
4. Se `status === 'open'`: retorna sucesso (já conectado)
5. Se não conectada: cria instância na Evolution API
6. Retorna QR Code em base64
7. Salva `evolution_instance` no Supabase

**Resposta:**
```json
{
  "success": true,
  "status": "connecting",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAA...",
  "instanceName": "tenant-abc123-1707782400",
  "message": "Escaneie o QR Code no WhatsApp"
}
```

#### DELETE `/api/whatsapp/connect` — Desconectar WhatsApp

Chama `logoutInstance()` do `evolution.service.ts` para desconectar a instância.

---

### 3. **Rota de Status** ✅

**Arquivo:** `src/app/api/whatsapp/status/route.ts`

#### GET `/api/whatsapp/status` — Verificar Conexão

**Resposta:**
```json
{
  "success": true,
  "status": "open",  // 'open' | 'close' | 'connecting'
  "instanceName": "tenant-abc123-1707782400",
  "message": "WhatsApp conectado"
}
```

**Status possíveis:**
- `open`: WhatsApp conectado e pronto
- `close`: WhatsApp desconectado
- `connecting`: Aguardando escaneamento do QR Code

---

### 4. **Rota de Envio** ✅

**Arquivo:** `src/app/api/whatsapp/send/route.ts`

#### POST `/api/whatsapp/send` — Enviar Mensagem

**Body:**
```json
{
  "to": "62999998888",
  "content": "Olá! Como posso ajudar?",
  "type": "text",  // opcional: text | image | video | audio | document
  "mediaUrl": "https://...",  // se type != text
  "caption": "Legenda da mídia"  // opcional
}
```

**Funcionalidades:**
✅ Normaliza telefone com `PhoneNormalizer.canonical(to)`
✅ Busca ou cria cliente automaticamente
✅ Busca ou cria conversa automaticamente
✅ Envia via Evolution API (`sendTextMessage` ou `sendMediaMessage`)
✅ Salva mensagem no banco com `direction: 'outbound'`
✅ Retorna mensagem salva + `messageId` da Evolution

**Resposta:**
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "external_id": "evolution_msg_id",
    "content": "Olá! Como posso ajudar?",
    "direction": "outbound",
    "status": "sent",
    ...
  },
  "messageId": "evolution_msg_id"
}
```

---

### 5. **Hook useWhatsAppConnection** ✅

**Arquivo:** `src/hooks/useWhatsApp.ts`

#### Uso no Componente:

```typescript
import { useWhatsAppConnection } from '@/hooks/useWhatsApp';

function WhatsAppPanel() {
  const {
    status,           // 'connected' | 'disconnected' | 'connecting' | 'unknown'
    qrCode,           // string base64 ou null
    isConnected,      // boolean
    isConnecting,     // boolean
    isDisconnected,   // boolean
    connect,          // () => void - gera QR Code
    disconnect,       // () => void - desconecta
    refetch,          // () => void - revalida status
    error,            // string | undefined
  } = useWhatsAppConnection();

  if (isDisconnected) {
    return (
      <div>
        <button onClick={() => connect()}>
          Conectar WhatsApp
        </button>
      </div>
    );
  }

  if (isConnecting && qrCode) {
    return (
      <div>
        <h3>Escaneie o QR Code</h3>
        <img src={qrCode} alt="QR Code WhatsApp" />
        <p>Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho</p>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div>
        <span className="text-green-600">✓ WhatsApp Conectado</span>
        <button onClick={() => disconnect()}>Desconectar</button>
      </div>
    );
  }

  return <p>Verificando status...</p>;
}
```

**Funcionalidades:**
✅ Query automática a cada 10 segundos (`refetchInterval: 10000`)
✅ Atualiza `connectionStore` automaticamente via `useEffect`
✅ Estado global sincronizado (`useConnectionStore`)
✅ Otimistic updates nos mutations

---

### 6. **Hook useSendMessage** ✅

#### Uso no Componente:

```typescript
import { useSendMessage } from '@/hooks/useWhatsApp';

function ChatInput({ clientPhone }: { clientPhone: string }) {
  const [message, setMessage] = useState('');
  const sendMessage = useSendMessage();

  const handleSend = () => {
    sendMessage.mutate({
      to: clientPhone,
      content: message,
      type: 'text',
    }, {
      onSuccess: () => {
        setMessage(''); // Limpar input
        toast.success('Mensagem enviada!');
      },
      onError: (error) => {
        toast.error(`Erro: ${error.message}`);
      },
    });
  };

  return (
    <div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Digite sua mensagem..."
      />
      <button 
        onClick={handleSend}
        disabled={sendMessage.isPending}
      >
        {sendMessage.isPending ? 'Enviando...' : 'Enviar'}
      </button>
    </div>
  );
}
```

---

### 7. **Store de Conexão** ✅

**Arquivo:** `src/store/connection.ts`

**Estado Global:**
```typescript
{
  whatsappStatus: 'connected' | 'disconnected' | 'connecting' | 'unknown',
  sseStatus: 'connected' | 'disconnected' | 'connecting' | 'unknown',
  qrCode: string | null,  // base64
  instanceName: string | null,
}
```

**Actions:**
- `setWhatsAppStatus(status)`
- `setSSEStatus(status)`
- `setQRCode(qr)`
- `setInstanceName(name)`

---

## 🔄 Fluxo Completo de Mensagens

### 📥 Mensagem Recebida (Webhook)

```
1. Cliente envia mensagem via WhatsApp
2. Evolution API recebe e envia webhook → POST /api/webhooks/evolution
3. Webhook identifica tenant pela instanceName
4. PhoneNormalizer.canonical(phone) normaliza telefone
5. Busca ou cria cliente no Supabase
6. Busca ou cria conversation para o cliente
7. Salva mensagem com:
   - external_id: ID da Evolution
   - direction: 'inbound'
   - sender_phone: telefone normalizado
   - conversation_id: vinculado
8. Emite SSE para frontend (EventBus)
9. Frontend recebe e atualiza UI em tempo real
```

### 📤 Mensagem Enviada (API)

```
1. Atendente digita e clica "Enviar"
2. useSendMessage().mutate({ to, content })
3. POST /api/whatsapp/send
4. PhoneNormalizer.canonical(to) normaliza telefone
5. Busca cliente pelo phone_normalized
6. Busca ou cria conversation
7. Envia via Evolution API (sendTextMessage)
8. Salva mensagem com:
   - external_id: ID retornado pela Evolution
   - direction: 'outbound'
   - sender_name: 'Atendente'
9. Retorna mensagem salva para frontend
10. Frontend atualiza chat instantaneamente
```

---

## 🎯 Vinculação Automática FacilZap ↔ WhatsApp

**Como funciona:**

1. **Cliente compra na loja FacilZap:**
   - FacilZap armazena: `telefone: "62999998888"`
   - Sync salva no Supabase: `phone_normalized: "5562999998888"` (PhoneNormalizer adiciona DDI)

2. **Cliente envia mensagem no WhatsApp:**
   - Evolution envia: `remoteJid: "5562999998888@s.whatsapp.net"`
   - Webhook extrai telefone: `"5562999998888"`
   - PhoneNormalizer.canonical(): `"5562999998888"` (mesmo formato!)

3. **Matching instantâneo:**
   ```sql
   SELECT * FROM clients 
   WHERE tenant_id = 'tenant_id' 
   AND phone_normalized = '5562999998888'
   ```
   ✅ **Cliente encontrado!** Histórico de pedidos + métricas (LTV, ticket médio) disponíveis no chat.

---

## 📋 Checklist de Ativação

### 1. **Executar SQL Schema no Supabase**
```sql
-- Já está em: supabase/migrations/001_initial_schema.sql
-- Copiar e colar no SQL Editor do Supabase
-- Executar
```

### 2. **Configurar Evolution API**

No painel de **Configurações → Integrações**, adicionar:
```
EVOLUTION_API_URL=https://api.evolution.com.br
EVOLUTION_API_KEY=your_api_key_here
```

Essas credenciais são salvas na tabela `tenants` (colunas `evolution_api_url`, `evolution_api_key`).

### 3. **Configurar Webhook na Evolution API**

No painel da Evolution API, configurar webhook:
```
URL: https://seu-dominio.com/api/webhooks/evolution
Events: messages.upsert, messages.update, connection.update
```

### 4. **Testar Conexão**

1. Clicar em "Conectar WhatsApp"
2. Escanear QR Code
3. Verificar status: "✓ WhatsApp Conectado"
4. Enviar mensagem de teste

---

## 🚀 Próximos Passos

### FASE 2: Interface de Conexão

- [ ] Criar componente `WhatsAppConnectionPanel` em `/configuracoes`
- [ ] Exibir QR Code com instruções
- [ ] Mostrar status em tempo real (badge no header)
- [ ] Botão "Reconectar" se desconectar

### FASE 3: Chat em Tempo Real

- [ ] Integrar `useMessages()` no `ChatArea`
- [ ] Conectar SSE para receber mensagens em tempo real
- [ ] Implementar indicador de digitação
- [ ] Status de leitura (ticks do WhatsApp)

### FASE 4: Contexto do Cliente

- [ ] Exibir histórico de pedidos ao lado do chat
- [ ] Mostrar métricas (LTV, ticket médio, última compra)
- [ ] Botão "Enviar Carrinho Abandonado"
- [ ] Sugestão de produtos (Anne IA)

---

## 📚 Documentação Técnica

### Arquivos Criados/Modificados:

1. ✅ `src/app/api/webhooks/evolution/route.ts` — Webhook corrigido
2. ✅ `src/app/api/whatsapp/connect/route.ts` — Conexão + QR Code
3. ✅ `src/app/api/whatsapp/status/route.ts` — Verificar status
4. ✅ `src/app/api/whatsapp/send/route.ts` — Enviar mensagens
5. ✅ `src/hooks/useWhatsApp.ts` — Hook completo
6. ✅ `src/store/connection.ts` — Estado global (já existia)

### Schema SQL:
- ✅ `tenants.evolution_instance` — Nome da instância
- ✅ `tenants.evolution_api_url` — URL da Evolution API
- ✅ `tenants.evolution_api_key` — API Key
- ✅ `messages.external_id` — ID da mensagem na Evolution
- ✅ `messages.direction` — 'inbound' | 'outbound'
- ✅ `clients.phone_normalized` — Telefone canônico para matching

---

**Status Final:** ✅ **ARQUITETURA WHATSAPP MULTI-TENANT COMPLETA**

**Pronto para:**
- ✅ Conectar WhatsApp via QR Code
- ✅ Receber mensagens via webhook
- ✅ Enviar mensagens via API
- ✅ Vinculação automática com clientes FacilZap
- ✅ Estado global sincronizado
- ✅ Hooks prontos para UI

**Próximo:** Implementar interface de usuário (componentes React)
