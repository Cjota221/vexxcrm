# Mapa do Sistema — Vexx CRM

**Versão:** 2.0 | **Data:** Março 2026

---

## 1. Visão Geral

**VEXX CRM 2.0** é uma plataforma SaaS multi-tenant de gestão de vendas baseada em WhatsApp. Funciona como um Contact Center inteligente com IA autônoma (Anne OS v5.0), automação de campanhas, gestão de e-commerce (FacilZap) e análise comportamental de clientes.

### Tech Stack

| Componente | Tecnologia |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4, TypeScript 5.9 |
| Backend | Next.js API Routes — Netlify Serverless |
| Banco de Dados | Supabase (PostgreSQL) com RLS |
| Estado (client) | Zustand + Supabase Realtime (WebSocket) |
| Integração WhatsApp | Evolution API (SaaS) |
| E-commerce | FacilZap API |
| IA/LLM | OpenAI / Anthropic / Google (configurável por tenant) |
| Deploy | Netlify com scheduled functions |

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                      │
│  React 19 + TailwindCSS | Zustand | Supabase Realtime      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│           NEXT.JS 16 (Netlify Serverless)                   │
│                                                             │
│  API Routes (/api/*)          120+ rotas                    │
│  ├─ Auth                      Login, sessão, avatar         │
│  ├─ CRM                       Clientes, conversas, msgs     │
│  ├─ WhatsApp                  Evolution API                 │
│  ├─ Webhooks                  Evolution, FacilZap, Cart     │
│  ├─ Anne OS v5.0              IA autônoma completa          │
│  ├─ Contact Center            Kanban, filas, transfer       │
│  ├─ Campaigns v2              Dispatcher, batch, scheduling │
│  ├─ Intelligence              RFM, seasonal, trending       │
│  ├─ FacilZap Sync             Produtos, pedidos, clientes   │
│  ├─ Import                    CSV/XLSX                      │
│  └─ Cron Jobs                 Campaign, ghosting, timeout   │
│                                                             │
│  Services (/lib/services/)    23 serviços TypeScript        │
│  Components (/components/)    100+ componentes React        │
│  Hooks (/hooks/)              20+ hooks customizados        │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQL / Realtime
┌──────────────────────────▼──────────────────────────────────┐
│              SUPABASE (PostgreSQL + RLS)                    │
│  57 tabelas | Storage (avatars, criativos, media)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / REST
┌──────────────────────────▼──────────────────────────────────┐
│             INTEGRAÇÕES EXTERNAS                            │
│  Evolution API (WhatsApp) | FacilZap (e-commerce)          │
│  OpenAI / Anthropic / Google (LLM) | n8n (webhooks)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Módulos Principais

| Módulo | Arquivos Principais | Responsabilidade |
|---|---|---|
| **Auth** | `src/app/api/auth/*` | Login, registro, logout, sessão |
| **Clientes (CRM)** | `src/app/api/clients/*` | CRUD, saúde, notas, padrões comportamentais |
| **Conversas/Chat** | `src/app/api/chats/*`, `messages/*` | Mensagens, busca FTS, threading |
| **Produtos** | `src/app/api/products/*` | Catálogo, sync FacilZap |
| **Pedidos** | `src/app/api/orders/*` | Histórico, tracking, stats |
| **Campanhas v2** | `src/app/api/v2/campanhas/*` | CRUD, dispatcher, anti-ban, batch |
| **Webhooks** | `src/app/api/webhooks/*` | Evolution, FacilZap, carrinho abandonado |
| **WhatsApp** | `src/app/api/whatsapp/*` | Connect, send, sync, transcrição de áudio |
| **Anne OS v5.0** | `src/app/api/anne/*`, `v2/anne/*` | Diagnósticos, pipeline inteligente, sugestões |
| **Contact Center** | `src/app/api/contact-center/*` | Queues, pull, transfer, ações rápidas |
| **Kanban/Pipeline** | `src/app/api/kanban/*`, `v2/kanban/*` | Cards, movimentação, state machine |
| **Intelligence** | `src/app/api/intelligence/*` | RFM, seasonal, trending, sales assistant |
| **FacilZap Sync** | `src/app/api/facilzap/*` | Sync de dados, audit, orphan linking |
| **Import** | `src/app/api/import/*` | Preview e processamento de CSV/XLSX |
| **Cron Jobs** | `src/app/api/cron/*` | Campaign dispatcher, ghosting, pending timeout |
| **Sentinela** | `src/app/api/sentinela/*` | Scan automático, diagnósticos de clientes |
| **Manutenção** | `src/app/api/maintenance/*` | Health check, recalc stats |

---

## 4. API Routes — Tabela Completa

### Auth
| Rota | Método | Descrição |
|---|---|---|
| `/api/auth/login` | POST | Login com email/senha |
| `/api/auth/register` | POST | Registro de usuário |
| `/api/auth/logout` | POST | Logout e limpeza de sessão |
| `/api/auth/session` | GET | Verificar sessão ativa |
| `/api/auth/avatar` | POST | Upload de avatar |
| `/api/auth/extension-login` | POST | Login para Chrome Extension |

### CRM — Clientes / Conversas / Mensagens
| Rota | Método | Descrição |
|---|---|---|
| `/api/clients` | GET, POST | Listar/criar clientes |
| `/api/clients/[id]` | GET, PUT | Details e update |
| `/api/clients/[id]/health` | GET | Customer health score |
| `/api/clients/[id]/notes` | GET, POST | Notas do cliente |
| `/api/clients/stats` | GET | Estatísticas de clientes |
| `/api/chats` | GET, POST | Listar/criar conversas |
| `/api/messages/[clientId]` | GET, POST | Mensagens por cliente |
| `/api/messages/search` | GET | Full-text search (`?q=`) |

### Produtos / Pedidos
| Rota | Método | Descrição |
|---|---|---|
| `/api/products` | GET, POST | Catálogo |
| `/api/products/[id]` | GET, PUT | Details, update |
| `/api/orders` | GET, POST | Listar/criar pedidos |
| `/api/orders/[id]` | GET, PUT | Details, update |
| `/api/orders/[id]/tracking` | GET | Tracking |
| `/api/orders/stats` | GET | Estatísticas |

### Campanhas
| Rota | Método | Descrição |
|---|---|---|
| `/api/v2/campanhas` | GET, POST | CRUD |
| `/api/v2/campanhas/[id]/iniciar` | POST | Iniciar |
| `/api/v2/campanhas/[id]/pausar` | POST | Pausar |
| `/api/v2/campanhas/[id]/retomar` | POST | Retomar |
| `/api/v2/campanhas/[id]/cancelar` | POST | Cancelar |
| `/api/v2/campanhas/[id]/duplicar` | POST | Duplicar |
| `/api/v2/campanhas/[id]/dispatch-batch` | POST | Disparar batch |
| `/api/v2/campanhas/[id]/jobs` | GET | Status de jobs |
| `/api/v2/campanhas/estimate` | POST | Estimar volume |

### Webhooks
| Rota | Método | Descrição |
|---|---|---|
| `/api/webhooks/evolution` | POST | Mensagens e status WhatsApp |
| `/api/webhooks/facilzap` | POST | Pedidos e clientes FacilZap |
| `/api/webhooks/abandoned-cart` | POST | Carrinhos abandonados |

### WhatsApp
| Rota | Método | Descrição |
|---|---|---|
| `/api/whatsapp/connect` | POST | Provisionar instância |
| `/api/whatsapp/send` | POST | Enviar mensagem |
| `/api/whatsapp/sync` | POST | Sync de histórico |
| `/api/whatsapp/status` | GET | Status da conexão |
| `/api/whatsapp/bulk-send` | POST | Envio em massa |
| `/api/whatsapp/transcribe-audio` | POST | Transcrever áudio |

### Anne OS v5.0
| Rota | Método | Descrição |
|---|---|---|
| `/api/anne/chat` | POST | Chat direto com Anne |
| `/api/anne/suggestions/[id]` | PATCH | Atualizar status de sugestão |
| `/api/v2/anne/process` | POST | Pipeline Anne OS (entrada principal) |
| `/api/v2/anne/config` | GET, PUT | Config por tenant |
| `/api/v2/anne/logs` | GET | Logs de execução |
| `/api/v2/anne/stats` | GET | Estatísticas |
| `/api/v2/anne/handover` | POST | Handover para humano |
| `/api/v2/anne/recovery-queue/process` | POST | Processar fila de recuperação |
| `/api/v2/anne/sandbox` | POST | Sandbox de testes |

### Contact Center / Kanban
| Rota | Método | Descrição |
|---|---|---|
| `/api/contact-center/pull` | GET | Pull de conversas |
| `/api/contact-center/queues` | GET | Listar filas |
| `/api/contact-center/transfer` | POST | Transferir conversa |
| `/api/contact-center/quick-actions` | GET, POST | Ações rápidas |
| `/api/v2/kanban/cards` | GET, POST | Cards |
| `/api/v2/kanban/move` | POST | Mover card |

### Intelligence
| Rota | Método | Descrição |
|---|---|---|
| `/api/intelligence/rfm` | POST | Calcular RFM |
| `/api/intelligence/rfm/clients` | GET | Clientes por segmento |
| `/api/intelligence/seasonal` | GET | Insights sazonais |
| `/api/intelligence/assistant` | POST | Sales assistant |
| `/api/intelligence/products` | GET | Tendências de produtos |

### Cron / Manutenção
| Rota | Schedule | Descrição |
|---|---|---|
| `/api/cron/campaign-dispatcher` | A cada 1 min | Disparar lotes de campanha |
| `/api/cron/pending-messages-timeout` | A cada 5 min | Marcar mensagens presas como failed |
| `/api/cron/ghosting-check` | Diário | Clientes em ghosting |
| `/api/maintenance/health-check` | Manual | Status geral do sistema |
| `/api/maintenance/recalc-stats` | Manual | Recalcular estatísticas |

---

## 5. Banco de Dados — Tabelas (57 tabelas)

### Multi-Tenant Core
| Tabela | Descrição |
|---|---|
| `tenants` | Organizações (planos, credenciais, limites) |
| `profiles` | Usuários vinculados ao auth.users |
| `tenant_config` | Configurações por tenant (JSONB) |
| `tenant_daily_send_counts` | Rate limiting de envios por dia |

### CRM Base
| Tabela | Descrição |
|---|---|
| `clients` | Contatos WhatsApp (phone, LTV, RFM, flags IA) |
| `conversations` | Conversas (status, assigned_to, suspensão automação) |
| `messages` | Histórico (tipo, conteúdo, mídia, `search_vector` FTS) |

### E-commerce
| Tabela | Descrição |
|---|---|
| `products` | Catálogo (nome, preço, facilzap_id) |
| `orders` | Pedidos (cliente, status, total, canal) |
| `order_items` | Itens de pedido |
| `orphaned_orders` | Pedidos sem cliente mapeado |

### Inteligência Comportamental
| Tabela | Descrição |
|---|---|
| `behavioral_events` | Compras, mensagens, carrinhos, campanhas |
| `rfm_history` | Histórico de cálculos RFM |
| `client_seasonal_profiles` | Perfil sazonal do cliente |
| `product_affinity` | Afinidade cliente-produto |
| `product_trends` | Tendências de produtos |
| `predictions_log` | Predições de churn, LTV, next_purchase |

### Campanhas
| Tabela | Descrição |
|---|---|
| `campaigns` | Campanhas (nome, tipo, status) |
| `campaign_jobs` | Jobs de disparo (contatos, enviados, failed) |
| `campanha_disparos` | Registro por contato |
| `message_templates` | Templates de mensagem |
| `coupons` | Cupons (código, desconto, validade) |

### Anne OS
| Tabela | Descrição |
|---|---|
| `anne_automations` | Automações (tipo, status, config) |
| `anne_recovery_queue` | Fila de recuperação de carrinhos |
| `anne_agents` | Agentes (slug, system_prompt, config) |
| `anne_logs_v2` | Logs completos de execução (chain_of_thought) |
| `anne_suggestions` | Sugestões geradas (pending/sent/dismissed) |
| `anne_handovers` | Handovers para agentes humanos |
| `anne_trigger_log` | Log de triggers |

### Sentinela
| Tabela | Descrição |
|---|---|
| `sentinela_analyses` | Análises (tipo, urgência, recomendação) |
| `sentinela_rules` | Regras (threshold, ação) |
| `sentinela_coupons` | Cupons gerados por diagnóstico |
| `sentinela_learning_log` | Feedback loop (aprovados/rejeitados) |

### Contact Center
| Tabela | Descrição |
|---|---|
| `queues` | Filas de atendimento |
| `agent_queues` | Mapeamento agente-fila |
| `quick_actions` | Ações rápidas (template, script) |
| `scheduled_messages` | Mensagens agendadas |
| `kanban_cards` | Cards do Kanban (cliente, coluna) |
| `kanban_transitions` | Histórico de movimentações |

### Audit / Admin
| Tabela | Descrição |
|---|---|
| `sync_audit_log` | Audit log de sincronizações |
| `sync_executions` | Execuções de sync (status, duração) |
| `sync_divergences` | Divergências encontradas |
| `automation_logs` | Logs de automações genéricas |
| `background_jobs` | Jobs em background |

---

## 6. Serviços (Services)

| Service | Arquivo | Responsabilidade |
|---|---|---|
| **Evolution** | `evolution.service.ts` | Provisioning, send messages, webhooks |
| **FacilZap** | `facilzap.service.ts` | Produtos, pedidos, clientes, cart links |
| **Anne Intelligence** | `anne-intelligence.ts` | Diagnósticos, urgência, recomendações |
| **Anne Service** | `anne.service.ts` | Serviço centralizado Anne |
| **Anne Pipeline** | `anne-pipeline.ts` | Pipeline de processamento Anne OS v5.0 |
| **Anne Auto-Reply** | `anne-auto-reply.ts` | Respostas automáticas fire-and-forget |
| **Agent Executor** | `agent-executor.ts` | Executa agentes específicos |
| **Campaign Dispatcher** | `campaign-dispatcher.ts` | Orquestra disparos (anti-ban, delay) |
| **Cart Recovery** | `cart-recovery.ts` | Recuperação de carrinhos abandonados |
| **RFM Engine** | `rfm-engine.ts` | Segmentação RFM |
| **Sales Assistant** | `sales-assistant.ts` | Insights de clientes, recomendações |
| **Seasonal Analyzer** | `seasonal-analyzer.ts` | Análise de padrões sazonais |
| **Product Intelligence** | `product-intelligence.ts` | Afinidade, tendências, cross-sell |
| **Customer Health** | `customer-health.ts` | Score de saúde, risco de churn |
| **Pipeline Triggers** | `pipeline-triggers.ts` | Triggers RFM → automações |
| **WhatsApp Labels** | `whatsapp-labels.ts` | Labels/tags WhatsApp |
| **Audio Transcription** | `audio-transcription.ts` | Transcrição de áudio via OpenAI/Google |
| **Learning Logger** | `learning-logger.ts` | Feedback loop de IA |
| **Resilient Sync** | `resilient-sync.ts` | Sync robusto com retry |
| **Sync Auditor** | `sync-auditor.ts` | Audit de divergências |
| **Orphan Linker** | `orphan-linker.ts` | Liga pedidos órfãos a clientes |
| **Contact Center** | `contact-center.service.ts` | Filas, transfer, ações rápidas |

---

## 7. Hooks Customizados

| Hook | Responsabilidade |
|---|---|
| `useAuth` | Sessão, tenant, login/logout |
| `useRealtimeMessages` | Subscribe a mensagens via Supabase Realtime |
| `useKanbanRealtime` | Sync de kanban via Realtime |
| `useChats` | CRUD de conversas |
| `useClients` | CRUD de clientes |
| `useOrders` | CRUD de pedidos |
| `useCampaigns` | CRUD de campanhas |
| `useContactCenter` | Gerenciar contact center |
| `useAnne` | Interact com Anne |
| `useAnneSuggestion` | Sugestões Anne via Realtime + polling 10s |
| `useIntelligence` | Dados de inteligência (RFM, seasonal) |
| `useTenantConfig` | Configuração de tenant |
| `useWhatsApp` | Status da conexão WhatsApp |
| `usePresence` | Presença de agente (online/offline) |
| `useDebounce` | Debounce genérico |
| `useKeyboardShortcuts` | Atalhos de teclado |
| `useAutoSync` | Sync automático em background |

---

## 8. Componentes React Principais

### Chat / Contact Center
| Componente | Responsabilidade |
|---|---|
| `ChatArea` | Área de mensagens; integra AnneSuggestionCard |
| `VirtualizedMessageList` | Lista virtualizada (react-window) |
| `MessageBubble` | Renderizar mensagem individual |
| `MessageInput` | Input com upload; prop `fillText` para sugestões |
| `AnneSuggestionCard` | Card de sugestão Anne (verde WhatsApp) |
| `KanbanBoard` | Draggable kanban com state machine |
| `ConversationSidebar` | Listagem de conversas |
| `QueuePanel` | Filas de atendimento |
| `QuickActionsBar` | Ações rápidas por conversa |
| `TransferDialog` | Transferir conversa para agente/fila |

### Intelligence
| Componente | Responsabilidade |
|---|---|
| `RFMOverview` | Resumo de segmentos RFM |
| `RFMChart` | Gráfico de segmentação |
| `SeasonalInsights` | Insights e padrões sazonais |
| `ProductTrends` | Tendências de produtos |
| `SalesAssistantPanel` | Recomendações de vendas |
| `AIAlerts` | Alertas automáticos de IA |

### Anne
| Componente | Responsabilidade |
|---|---|
| `AnneFAB` | Floating action button |
| `AnnePanel` | Panel de diagnósticos e análises |
| `SentinelaAnnePanel` | Sentinela integrado ao contact center |

---

## 9. Fluxos de Dados — 5 Fluxos Críticos

### Fluxo 1: Webhook → Mensagem → UI

```
Evolution API (cliente envia msg)
  → POST /api/webhooks/evolution
  → Autenticar tenant
  → Criar/atualizar client + conversation + message
  → Pipeline Triggers (RFM, TTL, automação)
  → Anne OS v5.0 (/api/v2/anne/process)
      → Crisis detection → Intent classification → Agent routing
      → Gerar resposta | suspender | handover
  → Supabase Realtime → UI atualiza em tempo real
```

### Fluxo 2: Campanha → Dispatcher → Tracking

```
Usuário inicia campanha
  → Criar campaign_jobs (status: pending)
  → Cron: /api/cron/campaign-dispatcher (a cada 1 min)
      → Batching + anti-ban (300–1000ms delay)
      → POST /api/whatsapp/send por contato
      → message.status = 'pending'
  → Webhook Evolution: status callback
      → message.status = 'delivered' | 'failed'
  → Cron: pending-messages-timeout (a cada 5 min)
      → mensagens presas > 5 min → status = 'failed'
```

### Fluxo 3: RFM → Segmentação → Automações

```
Novo pedido via FacilZap webhook
  → Atualizar client.ltv, total_orders
  → POST /api/intelligence/rfm
      → Calcular R/F/M → Segmento (Champions, At Risk, etc)
  → Pipeline Triggers:
      At Risk + >60 dias → flag_churn_risk + anne_automation
      Champions → flag_auto_vip + anne_automation
  → Sentinela: scan → sentinela_analyses com urgência
  → Anne Panel: exibe para operadora aprovar/rejeitar
```

### Fluxo 4: Carrinho Abandonado → Recovery

```
Cliente abre carrinho, não finaliza
  → Webhook FacilZap (abandoned_cart)
  → kanban card criado (coluna: EM_NEGOCIACAO)
  → scheduleCartRecovery() → anne_recovery_queue
  → Cron: recovery-queue/process (due_at expirou?)
      → cliente ainda em EM_NEGOCIACAO? SIM → enviar msg
      → NÃO → mark 'converted' (já pagou)
  → Evolution API: mensagem enviada ao cliente
```

### Fluxo 5: Anne OS v5.0 — Pipeline Inteligente

```
Mensagem inbound
  → isThrottled()? (anne_logs_v2, 30s) → retornar se sim
  → isAutomationSuspended()? (TTL check) → retornar se sim
  → loadTenantConfig() → API key, model, provider, send_mode
  → loadClientProfile() → RFM, LTV, histórico, onboarding
  → detectCrisis() → se crise: handover, sair
  → classifyIntent() → COMERCIAL | LOGISTICA | INSTITUCIONAL | …
  → routeToAgent() → comercial | logistica | faq | onboarding | central
  → runAgent() → resposta + acoes_sistema
  → send_mode = 'auto' → sendTextMessage() + humanDelay()
  → send_mode = 'suggest' → inserir em anne_suggestions
  → qualifyLead() fire-and-forget → hot | warm | cold → tags
  → logExecution() → anne_logs_v2
```

---

## 10. Integrações Externas

### WhatsApp — Evolution API
| Aspecto | Detalhes |
|---|---|
| **Modelo** | SaaS: cada tenant recebe instância `vexx-{tenantId}` |
| **Credenciais** | `EVOLUTION_API_URL` e `EVOLUTION_GLOBAL_KEY` no servidor |
| **Webhook** | POST `/api/webhooks/evolution` — mensagens, status, conexão |
| **Rate Limit** | ~1000 msgs/hora (depende do plano) |

### E-commerce — FacilZap
| Aspecto | Detalhes |
|---|---|
| **Auth** | Bearer token por loja (tenant config) |
| **Sync** | Produtos, pedidos, clientes, cart links |
| **Webhook** | POST `/api/webhooks/facilzap` — novos pedidos, status changes |
| **Retry** | Backoff exponencial automático |

### IA/LLM
| Provedor | Uso |
|---|---|
| **OpenAI** (default) | FAQ Agent, Sales Assistant, qualificação de leads |
| **Anthropic** | Configurável; usa tool calling baseado em texto (`<tool_call>`) |
| **Google Gemini** | Configurável; mesma abordagem text-based |
| **Fallback** | Template responses se LLM indisponível |

---

## 11. Status das Features

| Feature | Status | Notas |
|---|---|---|
| Multi-Tenant SaaS | ✅ Completo | RLS em todas as tabelas |
| WhatsApp Integration | ✅ Completo | Evolution API, provisioning, send/receive |
| Contact Center | ✅ Completo | Kanban, filas, transfer, ações rápidas |
| Anne OS v5.0 | ✅ Completo | Pipeline inteligente, 5 agentes, handover |
| Anne — Modo Suggest | ✅ Completo | `anne_suggestions` + `AnneSuggestionCard` |
| Campaigns v2 | ✅ Completo | Dispatcher, anti-ban, batch, scheduling |
| Cart Recovery | ✅ Completo | Schedule, queue, auto-dispatch |
| RFM Segmentation | ✅ Completo | Cálculo, scoring, triggers |
| Intelligence Dashboard | ✅ Completo | RFM, seasonal, trending, sales assistant |
| Sentinela Diagnósticos | ✅ Completo | Auto-scan, regras, learning feedback |
| FacilZap Sync | ✅ Completo | Produtos, pedidos, clientes, orphan linking |
| Import (CSV/XLSX) | ✅ Completo | Preview, column mapping, bulk insert |
| Full-Text Search (msgs) | ✅ Completo | TSVECTOR + GIN (migration 034) |
| Pending Message Timeout | ✅ Completo | Cron a cada 5 min (migration netlify.toml) |
| Throttle Serverless | ✅ Completo | Via `anne_logs_v2` (sem state em memória) |
| TTL Automação Suspensa | ✅ Completo | `automacao_suspensa_ate` (migration 031) |
| LGPD Opt-out | ✅ Completo | Filtro ativo em busca de clientes |
| Tool Calling Genérico | ✅ Completo | Text-based para Anthropic/Google |
| Audio Transcription | ✅ Completo | OpenAI/Google |
| Chrome Extension | ✅ Completo | Quick reply, client lookup, notes |
| Automation Logs | ✅ Completo | Audit trail completo |
| Health Check | ✅ Completo | VPS, DB, sync divergences |
| Roles & Permissions | ✅ Completo | owner, admin, agent, viewer |
| Dark Mode | ❌ Pendente | Estrutura TailwindCSS pronta, não ativada |
| Mobile App | ❌ Pendente | Apenas web |
| Email Integration | ❌ Pendente | Apenas WhatsApp + FacilZap |
| Telegram / Instagram DM | 🚧 Parcial | Schema existe, não implementado |
| API Pública | ❌ Pendente | Apenas rotas internas |
| SSO / OAuth | ❌ Pendente | Apenas email/senha nativo |
