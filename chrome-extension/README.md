# VEXX CRM — Extensão Chrome (Central de Atendimento)

Extensão Manifest V3 que integra o WhatsApp Web ao VEXX CRM.

## 🏗️ Arquitetura

```
chrome-extension/
├── manifest.json          # Manifest V3 — permissões, CSP, scripts
├── background.js          # Service Worker — auth, relay de mensagens
├── content.js             # Content Script — injetado no WhatsApp Web
├── content.css            # Estilos do botão flutuante
├── popup/
│   ├── popup.html         # UI do ícone na barra do Chrome
│   └── popup.js           # Lógica do popup
└── sidebar/
    ├── index.html         # HTML da sidebar (carregado no iframe)
    └── sidebar-app.js     # App React (sem bundler, UMD)
```

## ⚙️ Como Funciona

### Fluxo de Mensagens

```
WhatsApp Web DOM
    │
    ▼
content.js (Content Script)
    │  postMessage ↕
    ▼
sidebar/index.html (iframe isolado)
    │  React app
    │  fetch ↕
    ▼
VEXX CRM API (Netlify)
    │  /api/extension/quick-replies
    │  /api/extension/client?phone=...
    │  /api/extension/client/[id]/note
    └──▶ Supabase (PostgreSQL)
```

### Isolamento por tenant

Todos os endpoints exigem `Authorization: Bearer <token>` onde o token é o JWT do Supabase. O `tenant_id` é derivado do `user.id` no banco — nunca vem do cliente.

### Inserção de texto no WhatsApp

O campo de mensagem do WhatsApp é um `div[contenteditable="true"]`. Para inserir texto de forma que o React interno do WA detecte:

```js
// 1. Focar
box.focus();
// 2. Posicionar cursor no final
const range = document.createRange();
range.selectNodeContents(box);
range.collapse(false);
// 3. Inserir via execCommand (mais compatível)
document.execCommand('insertText', false, text);
// 4. Disparar eventos para o React do WA reconhecer
box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
```

## 🚀 Como Instalar (Desenvolvimento)

1. Abra `chrome://extensions/`
2. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `chrome-extension/`

## 🔐 Segurança

| Mecanismo | Descrição |
|---|---|
| `chrome.storage.local` | Token isolado por extensão — outras extensões não acessam |
| CORS | Endpoints só aceitam `chrome-extension://` e domínio do CRM |
| JWT Supabase | Cada request valida o token; `tenant_id` vem do banco, não do cliente |
| CSP no manifest | `script-src 'self'` — sem eval, sem scripts externos no iframe |
| iframe isolado | Content script não polui o DOM do WhatsApp com React |

## 📡 Endpoints do CRM

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/auth/extension-login` | POST | Login com email+senha, retorna JWT |
| `/api/extension/quick-replies` | GET | Lista respostas rápidas do tenant |
| `/api/extension/quick-replies/[id]/use` | POST | Incrementa contador de uso |
| `/api/extension/client?phone=` | GET | Dados do cliente pelo telefone |
| `/api/extension/client/[id]/note` | POST | Salva nota sobre o cliente |

## 🗃️ Migration SQL necessária

Execute no Supabase SQL Editor para adicionar a função de incremento e a coluna `source` em `client_notes`:

```sql
-- Função para incrementar use_count de respostas rápidas
CREATE OR REPLACE FUNCTION increment_quick_reply_use(p_id UUID, p_tenant_id UUID)
RETURNS void AS $$
  UPDATE quick_replies
  SET use_count = use_count + 1,
      updated_at = now()
  WHERE id = p_id AND tenant_id = p_tenant_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Coluna source em client_notes (registra origem: web | extension | import)
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';
```

## 🎨 Design System

Alinhado ao VEXX CRM 2.0:
- Brand: `#1e3a5f` (Azul Royal)
- Sucesso: `#059669`
- Background: `#f7f8fa`
- Cards: `bg-white` com `border border-gray-100` e `rounded-xl`
- Fontes: Inter / Segoe UI

## 📦 Próximos Passos

- [ ] Bundlar com Vite para produção (tree-shaking, minificação)
- [ ] Publicar na Chrome Web Store
- [ ] Adicionar suporte a Firefox (WebExtensions API é compatível)
- [ ] Notificações push quando nova mensagem chegar no CRM
- [ ] Histórico de mensagens do chat atual na sidebar
