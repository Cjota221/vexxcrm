# 🔍 VEXX CRM 2.0 — RELATÓRIO DE AUDITORIA COMPLETA

**Data:** Junho 2025  
**Escopo:** Codebase completo (`src/`, `scripts/`, configs)  
**Objetivo:** Identificar erros críticos, desconexões, páginas faltantes e fraquezas de lógica  
**Ação:** ⚠️ SOMENTE DIAGNÓSTICO — nenhuma correção aplicada

---

## 📊 RESUMO EXECUTIVO

| Categoria | Críticos | Médios | Baixos |
|-----------|----------|--------|--------|
| Erros Críticos | **6** | — | — |
| Desconexões | — | **8** | — |
| Páginas Faltantes | — | **5** | — |
| Fraquezas de Lógica | — | **4** | **6** |
| **TOTAL** | **6** | **17** | **6** |

---

## 🔴 1. ERROS CRÍTICOS

### CRIT-01: API Keys expostas ao client-side
- **Arquivo:** `src/app/api/tenants/config/route.ts` (linhas 52-57)
- **Problema:** O endpoint `GET /api/tenants/config` retorna as API keys **em texto plano** para o frontend:
  ```
  api_key: tenant?.evolution_api_key || ''
  api_key: tenant?.openai_api_key || ''
  ```
- **Risco:** Qualquer usuário do tenant (inclusive atendentes) pode inspecionar o Network DevTools e capturar as chaves da Evolution API e OpenAI.
- **Regra violada:** `copilot-instructions.md` → "NUNCA expor tokens de API no client-side"
- **Impacto:** Alto. As chaves podem ser usadas por terceiros para gerar custos na OpenAI ou controlar o WhatsApp do cliente.
- **Recomendação:** Retornar apenas flags booleanas (`has_key: true/false`) e máscaras (`key: "sk-...xxxx"`).

---

### CRIT-02: Rota `/api/campaigns` não filtra por tenant_id
- **Arquivo:** `src/app/api/campaigns/route.ts`
- **Problema:** GET retorna `{ data: [] }` hardcoded (é um stub), mas **POST aceita qualquer body e retorna `201`** sem autenticação, sem validação e sem filtro de tenant.
- **Risco:** Em SaaS multi-tenant, quando implementada, se seguir o mesmo padrão de stub, vazará dados entre tenants.
- **Impacto:** Alto (quando implementada). Atualmente retorna array vazio, então o risco é latente.

---

### CRIT-03: CRON_SECRET com fallback vazio = bypass total
- **Arquivos:** 
  - `src/app/api/cron/sync-orders/route.ts` (linha 30)
  - `src/app/api/cron/sync-full/route.ts` (linha 38)
- **Problema:**
  ```ts
  const CRON_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
  ```
  Se nenhuma env var estiver definida, `CRON_SECRET = ''`. A validação é:
  ```ts
  if (CRON_SECRET && authHeader !== CRON_SECRET && cronKey !== CRON_SECRET)
  ```
  Como `'' && ...` é falsy, **qualquer pessoa pode executar o sync sem autenticação**.
- **Risco:** Qualquer bot/crawler pode disparar syncs infinitos via GET, causando rate-limiting na FacilZap e custos de processamento.
- **Impacto:** Alto. As rotas aceitam tanto GET quanto POST.

---

### CRIT-04: Middleware não protege webhooks
- **Arquivo:** `src/middleware.ts` (linha 26)
- **Problema:**
  ```ts
  const isPublicApiRoute = pathname.startsWith('/api/auth') || 
                           pathname.startsWith('/api/webhooks');
  ```
  **Todas** as rotas `/api/webhooks/*` são públicas, incluindo:
  - `/api/webhooks/evolution` — Processa mensagens WhatsApp e faz upsert em clientes
  - `/api/webhooks/facilzap` — Processa pedidos e clientes
  - `/api/webhooks/abandoned-cart` — Aceita qualquer payload
- **Risco:** Sem HMAC signature ou IP validation efetiva (evolution usa `EVOLUTION_ALLOWED_IPS` mas é opcional), qualquer um pode forjar webhooks e injetar dados falsos no sistema.
- **Impacto:** Crítico. Um atacante pode criar clientes/mensagens/pedidos falsos.

---

### CRIT-05: Webhook Evolution ignora mensagens @lid completamente
- **Arquivo:** `src/app/api/webhooks/evolution/route.ts` (linhas 87-90)
- **Problema:**
  ```ts
  if (remoteJid.includes('@lid')) {
    // TODO: Implementar resolução de @lid via Evolution API
    console.warn(`[Webhook] JID @lid detectado: ${remoteJid}`);
    return; // ← DESCARTA A MENSAGEM
  }
  ```
- **Risco:** Mensagens de certos contatos (LinkedIn/business) são silenciosamente descartadas. O atendente nunca saberá que recebeu essas mensagens.
- **Impacto:** Médio-Alto. Perda silenciosa de mensagens de clientes.

---

### CRIT-06: Ausência total de rate-limiting nas APIs
- **Arquivo:** Todos os endpoints em `src/app/api/`
- **Problema:** Nenhuma rota implementa rate-limiting. O middleware valida apenas o token, mas não limita requests por IP/tenant/user.
- **Rotas mais vulneráveis:**
  - `POST /api/anne/chat` — Cada chamada gasta tokens OpenAI
  - `POST /api/facilzap/auto-sync` — Pode ser disparado em loop
  - `POST /api/whatsapp/send` — Pode enviar mensagens em massa
- **Impacto:** Alto. Um script malicioso pode gerar custos enormes na OpenAI ou banir o número WhatsApp por spam.

---

## 🟡 2. DESCONEXÕES

### DESC-01: 6 rotas FacilZap são stubs vazios
| Rota | Retorna | Impacto UI |
|------|---------|------------|
| `GET /api/facilzap/clients` | `{ data: [] }` | Nenhum — não é usado (auto-sync é diferente) |
| `GET /api/facilzap/products` | `{ data: [] }` | Nenhum — não é usado |
| `GET /api/facilzap/orders` | `{ data: [] }` | Nenhum — não é usado |
| `POST /api/facilzap/cart-link` | `{ url: null }` | Botão "Gerar Link" não funciona |
| `POST /api/campaigns/send-sequence` | `{ status: 'queued' }` | Finge que enviou campanha |
| `POST /api/webhooks/abandoned-cart` | `{ success: true }` | Webhook recebido mas nada processado |

**Nota:** As 3 primeiras (`clients`, `products`, `orders`) parecem ser "endpoints de consulta direta à FacilZap" que nunca foram necessários porque o `auto-sync` e o `sync` já fazem a busca. Podem ser removidos sem impacto.

---

### DESC-02: Campanhas — Frontend completo, backend vazio
- **Frontend:** `src/app/(dashboard)/campanhas/page.tsx` (198 linhas) — UI completa com filtros, status badges, listagem
- **Hook:** `src/hooks/useCampaigns.ts` — chama `GET /api/campaigns`
- **Backend:** `src/app/api/campaigns/route.ts` — Retorna `[]` sempre. POST apenas ecoa o body.
- **Backend send:** `src/app/api/campaigns/send-sequence/route.ts` — TODO stub
- **Resultado:** O usuário vê uma página de campanhas vazia sem nenhuma funcionalidade real.

---

### DESC-03: Cupons — Tela com dados mock, sem backend
- **Arquivo:** `src/app/(dashboard)/cupons/page.tsx` (linha 21)
  ```ts
  // TODO: hook useCoupons
  const mockCoupons: Coupon[] = [];
  ```
- **Problema:** A página usa `mockCoupons = []` localmente. Não existe:
  - Nenhuma API route `/api/coupons`
  - Nenhum hook `useCoupons`
  - Nenhuma tabela `coupons` no schema visível
- **Resultado:** Tela vazia sem funcionalidade.

---

### DESC-04: Carrinhos Abandonados — Tela local, sem backend
- **Arquivo:** `src/app/(dashboard)/carrinhos/page.tsx`
- **Problema:** Configurações salvas apenas no `localStorage` do browser (linha 42):
  ```ts
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  ```
- **Sem conexão com:**
  - `/api/webhooks/abandoned-cart` (que é um stub)
  - Nenhuma tabela `abandoned_carts` no banco
  - Nenhum mecanismo de recuperação automática
- **KPIs:** Todos mostram `0` hardcoded.
- **Resultado:** Funcionalidade 100% decorativa.

---

### DESC-05: AnnePanel não está no layout principal
- **Arquivo:** `src/app/(dashboard)/layout.tsx`
- **Problema:** O componente `AnnePanel` (chat com IA) **não é renderizado** no layout do dashboard. Existe apenas:
  - `SentinelaAnnePanel` na página `/central` 
  - O `AnnePanel` standalone não é montado em nenhum lugar globalmente
- **Impacto:** O usuário não tem acesso fácil ao chat com a Anne a partir de qualquer tela. Precisa estar na Central.

---

### DESC-06: Anne analyze + approve + feedback — Backend OK, Frontend parcial
- **Backend:** 4 rotas totalmente implementadas (`/api/anne/chat`, `/analyze`, `/approve`, `/feedback`)
- **Service:** `anne-intelligence.ts` (600 linhas) — Motor completo com análise batch, aprovação, feedback loop
- **Frontend:** Apenas `SentinelaAnnePanel` na `/central` expõe parcialmente as análises
- **Faltando:** 
  - Tela dedicada de "Análises Pendentes" para aprovação
  - Botão de "Rodar Análise Batch" para admins
  - Dashboard de feedback/aprendizado da IA
- **Impacto:** 70% do backend da Anne está "invisível" ao usuário.

---

### DESC-07: SSE (Server-Sent Events) sem conexão WhatsApp real
- **Arquivo:** `src/app/api/sse/route.ts` + `src/lib/event-bus.ts`
- **Problema:** O eventBus emite eventos quando webhooks chegam (`new_message`, `message_status`), mas:
  - Sem Evolution API configurada, nenhum webhook chega
  - O frontend (chat) faz polling + SSE, mas SSE depende de webhook externo
- **Resultado:** Em deploys sem Evolution configurada, o chat real-time é inoperante. Funciona apenas com dados do banco (manual).

---

### DESC-08: Importação CSV — Backend robusto, sem progresso real-time
- **Arquivo:** `src/app/api/import/process/route.ts`
- **Problema:** O processo de importação roda sincronamente na API route. Para arquivos grandes (>1000 linhas), pode exceder o timeout da Netlify/Vercel (10-30s).
- **Faltando:** Job queue, WebSocket/SSE progress, chunked processing.

---

## 🟠 3. PÁGINAS FALTANTES / FUNCIONALIDADES INCOMPLETAS

### PAGE-01: Configurações (`/configuracoes`) — Onde se configura API Keys
- **Existe a tela:** Sim
- **Problema:** Recebe e exibe API keys em texto plano (relacionado ao CRIT-01)
- **Faltando:** Máscara de keys, botão "testar conexão" para FacilZap, validação de OpenAI key

---

### PAGE-02: Tela de Aprovação Anne — Não existe
- **Backend pronto:** `POST /api/anne/approve`, `POST /api/anne/feedback`, `GET /api/anne/analyze`
- **Faltando:** Tela `/anne-analises` ou similar onde o admin:
  - Vê lista de análises pendentes
  - Aprova ou rejeita com um clique
  - Dá feedback pós-execução (1-5 estrelas)

---

### PAGE-03: Tela de Métricas WhatsApp — Não existe
- **Dados disponíveis:** A tabela `messages` tem status (sent/delivered/read/failed)
- **Faltando:** Dashboard com:
  - Taxa de entrega / leitura
  - Mensagens por hora/dia
  - Tempo médio de resposta
  - Top atendentes

---

### PAGE-04: Gerenciamento de Usuários/Atendentes — Não existe  
- **Backend:** Profiles com `role` (owner/admin/agent) existem
- **Faltando:** Tela de CRUD de usuários por tenant:
  - Convidar novos atendentes
  - Definir limites de atendimento
  - Ativar/desativar agentes

---

### PAGE-05: Logs de Sync / Audit Trail — Não visível
- **Backend:** `sync_audit_log` é usado por `SyncLogger`
- **Parcial:** Existe `Eng. Dados` com `SyncDashboard`
- **Faltando:** Histórico completo de syncs com erros, registros afetados, tempo de execução acessível sem ser "engenharia de dados"

---

## 🔵 4. FRAQUEZAS DE LÓGICA

### LOGIC-01: auto-sync a cada 5 min pode gerar race condition
- **Arquivo:** `src/components/layout/AutoSyncProvider.tsx` + `src/app/api/facilzap/auto-sync/route.ts`
- **Problema:** Cada aba/janela do browser de cada usuário dispara um sync a cada 5 minutos. Com 5 usuários em 3 abas = **15 syncs simultâneos** a cada 5 min.
- **Mitigação parcial:** `isSyncRunning()` no cron, mas o `auto-sync` **não tem essa proteção**.
- **Risco:** Duplicação de dados, rate-limit na FacilZap, overhead no Supabase.

---

### LOGIC-02: Chats limitados a 100 sem paginação
- **Arquivo:** `src/app/api/chats/route.ts` (linha 106)
  ```ts
  query = query.limit(100);
  ```
- **Problema:** Fixo em 100 conversas. Sem paginação, sem scroll infinito. Tenants com >100 conversas nunca verão as mais antigas.
- **Regra violada:** `copilot-instructions.md` → "Virtualizar listas com +100 itens"

---

### LOGIC-03: total_orders pode dessincronisar novamente
- **Contexto:** Corrigido na sessão anterior com auto-recalculation no auto-sync.
- **Problema residual:** O webhook FacilZap (`/api/webhooks/facilzap`) cria pedidos mas **não recalcula** `total_orders` do cliente. Se pedidos chegarem via webhook (e não via auto-sync), os contadores ficarão desatualizados novamente.
- **Arquivo:** `src/app/api/webhooks/facilzap/route.ts`

---

### LOGIC-04: Modelo da Anne fixo em `gpt-4o-mini`
- **Arquivo:** `src/app/api/anne/chat/route.ts` (linha 155)
  ```ts
  model: 'gpt-4o-mini',
  ```
- **Problema:** Hardcoded. A tela de configurações tem campo `model` mas nunca é lido do banco.
- **Impacto:** Baixo. Funciona, mas impede uso de modelos mais potentes quando necessário.

---

### LOGIC-05: PhoneNormalizer.canonical() — Potencial falha em DDDs de fixo
- **Arquivo:** `src/lib/phone-normalizer.ts`
- **Cenário:** A função canonical() remove o 9º dígito. Para telefones fixos (8 dígitos sem 9), pode gerar números com 7 dígitos que não batem no matching.
- **Impacto:** Baixo. A maioria dos clientes WhatsApp usa celular.
- **Status:** O normalizer TEM validação de DDDs e regex correto, mas a lógica de "remover 9" pode falhar em edge cases de portabilidade fixo→celular.

---

### LOGIC-06: Sentinela scan sem agendamento automático
- **Arquivo:** `src/app/api/sentinela/scan/route.ts`
- **Problema:** O scan precisa ser disparado manualmente. Não existe cron job para rodar periodicamente.
- **Impacto:** O health score dos clientes fica desatualizado até alguém clicar "Escanear" na Central.

---

### LOGIC-07: Webhook FacilZap — Fallback por store_id pode causar cross-tenant
- **Arquivo:** `src/app/api/webhooks/facilzap/route.ts` (linha 48)
  ```ts
  if (!tenantId && (body.tenant_id || body.store_id)) {
  ```
- **Problema:** Se o token não bater, tenta usar `body.tenant_id` diretamente. Um atacante pode enviar `{ tenant_id: "uuid-vitima" }` para injetar dados em qualquer tenant.
- **Risco:** Cross-tenant data injection.

---

### LOGIC-08: Dashboard (`/api/dashboard/route.ts`) — Queries N+1
- **Potencial:** Múltiplas queries sequenciais (total_clients, total_orders, etc.) sem `Promise.all()` ou view materializada.
- **Impacto:** Lentidão perceptível em tenants com muitos dados.

---

### LOGIC-09: Sem tratamento de expiração de token FacilZap
- **Arquivo:** `src/lib/services/facilzap.service.ts`
- **Problema:** Se o `facilzap_token` expirar ou for revogado, o sistema continua tentando sync a cada 5 min, gerando erros silenciosos nos logs.
- **Faltando:** Notificação ao admin quando o token falha repetidamente.

---

### LOGIC-10: localStorage para config de carrinhos = perde entre dispositivos
- **Arquivo:** `src/app/(dashboard)/carrinhos/page.tsx`
- **Problema:** Já coberto em DESC-04, mas a implicação lógica é que se o admin configurar a recuperação de carrinhos em um PC, nada muda em outro PC/celular. Deveria ser persistido no banco por tenant.

---

## 📋 INVENTÁRIO DE ROTAS API

### ✅ Funcionais (com tenant_id e lógica real)
| Rota | Método | Status |
|------|--------|--------|
| `/api/auth/session` | GET | ✅ OK |
| `/api/clients` | GET/POST | ✅ OK |
| `/api/clients/[id]` | GET/PUT/DELETE | ✅ OK |
| `/api/clients/[id]/health` | GET | ✅ OK |
| `/api/orders` | GET | ✅ OK |
| `/api/orders/[id]` | GET | ✅ OK |
| `/api/orders/stats` | GET | ✅ OK |
| `/api/products` | GET | ✅ OK |
| `/api/products/[id]` | GET | ✅ OK |
| `/api/dashboard` | GET | ✅ OK |
| `/api/chats` | GET | ✅ OK (limite 100) |
| `/api/tenants/config` | GET/PUT | ⚠️ Expõe keys |
| `/api/facilzap/auto-sync` | POST | ✅ OK (v2.1) |
| `/api/facilzap/sync` | POST | ✅ OK |
| `/api/facilzap/relink` | POST | ✅ OK |
| `/api/anne/chat` | POST | ✅ OK |
| `/api/anne/analyze` | GET/POST | ✅ OK |
| `/api/anne/approve` | POST | ✅ OK |
| `/api/anne/feedback` | POST | ✅ OK |
| `/api/sentinela/scan` | POST | ✅ OK |
| `/api/intelligence/*` | GET | ✅ OK (6 sub-rotas) |
| `/api/contact-center/*` | GET/POST | ✅ OK (5 sub-rotas) |
| `/api/whatsapp/send` | POST | ✅ OK |
| `/api/whatsapp/status` | GET | ✅ OK |
| `/api/whatsapp/connect` | POST | ✅ OK |
| `/api/webhooks/evolution` | POST | ⚠️ @lid descartado |
| `/api/webhooks/facilzap` | POST | ⚠️ Fallback inseguro |
| `/api/maintenance/health-check` | GET | ✅ OK |
| `/api/maintenance/recalc-stats` | POST | ✅ OK |
| `/api/import/process` | POST | ✅ OK (sem progresso) |
| `/api/cron/sync-orders` | GET/POST | ⚠️ Auth bypassável |
| `/api/cron/sync-full` | GET/POST | ⚠️ Auth bypassável |
| `/api/sse` | GET | ✅ OK (depende webhook) |

### ❌ Stubs / Não implementados
| Rota | Retorna |
|------|---------|
| `GET /api/facilzap/clients` | `[]` sempre |
| `GET /api/facilzap/products` | `[]` sempre |
| `GET /api/facilzap/orders` | `[]` sempre |
| `POST /api/facilzap/cart-link` | `null` |
| `GET /api/campaigns` | `[]` sempre |
| `POST /api/campaigns` | Ecoa body |
| `POST /api/campaigns/send-sequence` | Finge enviar |
| `POST /api/webhooks/abandoned-cart` | Log + noop |

---

## 🗺️ INVENTÁRIO DE PÁGINAS

| Página | Rota | Backend | Status |
|--------|------|---------|--------|
| Dashboard | `/` | `/api/dashboard` | ✅ Funcional |
| Central | `/central` | contact-center + sentinela | ✅ Funcional |
| Atendimento | `/atendimento` | `/api/chats` + WhatsApp | ✅ Funcional (com limitações) |
| Clientes | `/clientes` | `/api/clients` | ✅ Funcional |
| Pedidos | `/pedidos` | `/api/orders` | ✅ Funcional |
| Produtos | `/produtos` | `/api/products` | ✅ Funcional |
| Inteligência | `/intelligence` | `/api/intelligence/*` | ✅ Funcional |
| Importação | `/importacao` | `/api/import/process` | ✅ Funcional |
| Eng. Dados | `/engenharia-dados` | sync-admin | ✅ Funcional |
| Manutenção | `/manutencao` | `/api/maintenance/*` | ✅ Funcional |
| Configurações | `/configuracoes` | `/api/tenants/config` | ⚠️ Keys expostas |
| **Campanhas** | `/campanhas` | **Stub** | 🔴 UI sem backend |
| **Carrinhos** | `/carrinhos` | **localStorage** | 🔴 Sem backend |
| **Cupons** | `/cupons` | **Mock** | 🔴 Sem backend |

---

## 🎯 PRIORIZAÇÃO RECOMENDADA

### Sprint Urgente (Segurança)
1. **CRIT-01** — Mascarar API keys no `/api/tenants/config`
2. **CRIT-03** — Remover fallback vazio do `CRON_SECRET`
3. **CRIT-04** — Validar webhooks com HMAC ou token
4. **LOGIC-07** — Remover fallback por `body.tenant_id` no webhook FacilZap
5. **CRIT-06** — Implementar rate-limiting básico (pelo menos nas rotas de AI e WhatsApp)

### Sprint Funcional (Completar features)
1. **DESC-02** — Implementar backend de Campanhas
2. **LOGIC-01** — Proteção de sync concorrente no auto-sync
3. **LOGIC-03** — Recalcular stats no webhook FacilZap
4. **CRIT-05** — Resolver @lid no webhook Evolution
5. **DESC-05** — Montar AnnePanel no layout global

### Sprint UX (Melhorias)
1. **DESC-06** — Tela de aprovação de análises Anne
2. **PAGE-04** — Gerenciamento de usuários
3. **LOGIC-02** — Paginação infinita nos chats
4. **DESC-03/04** — Decidir: implementar ou remover Cupons/Carrinhos

---

## 📁 ARQUIVOS DE SUPORTE

```
scripts/diagnose-client-order-sync.js  — Diagnóstico de dessincronia
scripts/recalc-all-stats.js            — Recalculação manual de stats
DIAGNOSTICO_CLIENTE_PEDIDO.md          — Root cause analysis (sessão anterior)
SOLUCAO_COMPLETA.md                    — Manual da solução implementada
```

---

*Relatório gerado via auditoria automatizada do codebase VEXX CRM 2.0*
