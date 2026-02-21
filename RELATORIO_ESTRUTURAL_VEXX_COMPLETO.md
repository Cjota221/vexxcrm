# RELATÓRIO DE ENGENHARIA DE CICLO COMPLETO — VEXX CRM 2.0

> **Auditor:** Arquiteto de Software Sênior  
> **Data:** Julho 2025  
> **Versão do Projeto:** VEXX CRM 2.0 (Next.js 16.1.6 · Commit `a48e2cd`)  
> **Escopo:** Varredura integral do repositório — frontend, backend, banco de dados, IA, mensageria e infraestrutura

---

## SUMÁRIO EXECUTIVO

O VEXX CRM 2.0 é um sistema **SaaS Multi-Tenant** de gestão de vendas via WhatsApp para e-commerces. A arquitetura é madura, bem estruturada e evolui de forma consistente ao longo de 40+ fases de desenvolvimento documentadas. O sistema integra três núcleos estratégicos: um motor de mensageria em tempo real (Evolution API + Supabase Realtime), uma IA especialista em vendas (Anne OS v5.0 com pipeline de 7 estágios), e um motor de tração comercial (Campanhas com Anti-Ban + RFM Engine).

**Score de Maturidade:** `8.2 / 10`

| Dimensão | Score | Observação |
|---|---|---|
| Fundação Técnica | 9/10 | Next.js 14+ App Router, TypeScript strict, Tailwind — setup exemplar |
| Camada de Dados | 8/10 | 22 migrations, RLS completo, Realtime configurado |
| Cérebro (IA) | 8/10 | Pipeline L0-L6 robusto; memória ainda in-DB (sem vetor) |
| Mensageria | 8/10 | Multi-tenant SaaS sólido; SSE limitado por CDN Netlify |
| Motor de Tração | 9/10 | REGRA DA CAROL + RFM + Kanban — diferencial competitivo real |
| Infraestrutura | 7/10 | Netlify free tier limita SSE (26s) e paralelismo |

---

## SEÇÃO 1 — FUNDAÇÃO TÉCNICA

### 1.1 Stack Principal

```
Framework:    Next.js 16.1.6 (App Router + Turbopack)
Linguagem:    TypeScript 5.3+ (strict mode)
Estilo:       Tailwind CSS 3.4+
State:        Zustand 4.5+ (client) + React Query 5.17+ (server state)
Database:     Supabase (PostgreSQL 15 + Auth + Storage + Realtime)
Runtime:      Node.js 20 (Netlify Functions)
```

### 1.2 Estrutura de Diretórios

```
vexx-crm/
├── src/
│   ├── app/                          ← Next.js App Router
│   │   ├── (auth)/                   ← login, register (route group)
│   │   ├── (dashboard)/              ← módulos autenticados
│   │   ├── api/                      ← 24 grupos de API Routes
│   │   │   ├── anne/                 ← IA: chat, config, memory
│   │   │   ├── auth/                 ← autenticação
│   │   │   ├── campaigns/            ← CRUD campanhas + blasting
│   │   │   ├── chats/                ← conversas WhatsApp
│   │   │   ├── clients/              ← CRM de contatos
│   │   │   ├── contact-center/       ← central de atendimento
│   │   │   ├── cron/                 ← campaign-dispatcher (minutely)
│   │   │   ├── dashboard/            ← métricas e analytics
│   │   │   ├── facilzap/             ← integração Facilzap (e-commerce)
│   │   │   ├── import/               ← importação de contatos/pedidos
│   │   │   ├── intelligence/         ← RFM + inteligência preditiva
│   │   │   ├── kanban/               ← Kanban de pipeline de vendas
│   │   │   ├── maintenance/          ← endpoints de manutenção
│   │   │   ├── media/                ← download/proxy de mídia
│   │   │   ├── messages/             ← envio de mensagens
│   │   │   ├── migrate/              ← scripts de migração on-demand
│   │   │   ├── orders/               ← pedidos
│   │   │   ├── products/             ← catálogo de produtos
│   │   │   ├── sentinela/            ← monitor autônomo de alertas
│   │   │   ├── sse/                  ← Server-Sent Events (Realtime)
│   │   │   ├── templates/            ← templates de mensagem
│   │   │   ├── tenants/              ← configurações do tenant
│   │   │   ├── upload/               ← upload de arquivos
│   │   │   ├── v2/                   ← rotas versionadas (nova arquitetura)
│   │   │   ├── webhooks/             ← Evolution API webhooks
│   │   │   └── whatsapp/             ← actions WhatsApp (stories, etc.)
│   │   ├── atendimento/              ← página de atendimento individual
│   │   └── central/                  ← Central de Mensagens (chat principal)
│   ├── components/
│   │   ├── anne/                     ← UI da Anne (chat IA, config)
│   │   ├── campaigns/                ← Builder de campanhas
│   │   ├── chat/                     ← Componentes do chat
│   │   │   ├── AudioMessage.tsx      ← Player de áudio customizado
│   │   │   ├── ChatArea.tsx          ← Área principal do chat
│   │   │   ├── MediaMessage.tsx      ← Imagens/vídeos + lightbox
│   │   │   ├── MessageBubble.tsx     ← Bolha de mensagem unificada
│   │   │   ├── MessageInput.tsx      ← Input de envio
│   │   │   └── VirtualizedMessageList.tsx ← Lista virtualizada (10k msgs)
│   │   ├── contact-center/           ← Central de atendimento
│   │   ├── crm/                      ← Cards de cliente, perfil CRM
│   │   ├── import/                   ← Wizard de importação
│   │   ├── intelligence/             ← Dashboard RFM + insights
│   │   ├── layout/                   ← Sidebar, navbar, shell
│   │   ├── settings/                 ← Configurações do tenant
│   │   └── ui/                       ← Design System (atoms/molecules)
│   ├── hooks/                        ← 15+ custom hooks React
│   │   ├── useAnne.ts                ← Anne chat hook
│   │   ├── useAuth.ts                ← Autenticação
│   │   ├── useAutoSync.ts            ← Sync automático
│   │   ├── useCampaigns.ts           ← Campanhas
│   │   ├── useChats.ts               ← Lista de conversas
│   │   ├── useClients.ts             ← CRM hook
│   │   └── ...
│   ├── lib/
│   │   ├── services/                 ← 19 serviços de negócio
│   │   ├── anne-pipeline.ts          ← Orchestrador Anne OS v5
│   │   ├── anne-prompt.ts            ← DNA do prompt Anne
│   │   ├── anne-triggers.ts          ← Gatilhos de automação
│   │   ├── kanban-state-machine.ts   ← FSM do Kanban
│   │   ├── message-parser.tsx        ← Parser de conteúdo WhatsApp
│   │   ├── phone-normalizer.ts       ← Normalização de telefones
│   │   ├── rate-limiter.ts           ← Rate limiting in-memory
│   │   ├── event-bus.ts              ← Event bus global
│   │   └── rfm-segments.ts           ← Dicionário de segmentos RFM
│   ├── store/                        ← Zustand stores globais
│   ├── types/                        ← Interfaces TypeScript centralizadas
│   └── utils/                        ← Utilitários (message-sorting, etc.)
├── supabase/
│   └── migrations/                   ← 22 arquivos SQL (000–021 + logs)
├── scripts/                          ← 40+ scripts de diagnóstico/manutenção
├── n8n/                              ← Workflow de processamento de mídia
└── netlify.toml                      ← Configuração de deploy
```

### 1.3 Componentes de UI Notáveis

| Componente | Propósito | Tecnologia |
|---|---|---|
| `VirtualizedMessageList` | Lista de msgs com 10k+ sem lag | `@tanstack/react-virtual` |
| `AudioMessage` | Player de áudio customizado | HTML5 + waveform bars CSS |
| `MediaMessage` | Imagens 280×380px + zoom | `yet-another-react-lightbox` |
| `MessageBubble` | Bolha de mensagem unificada | Tailwind CSS |
| `MessageInput` | Envio com suporte a arquivos | FormData + React Query mutation |

### 1.4 Convenções de Código

- **Arquivos:** `kebab-case.tsx` (ex: `chat-list.tsx`)
- **Componentes:** `PascalCase` (ex: `ChatList`)
- **Funções/variáveis:** `camelCase` (ex: `handleSendMessage`)
- **Constantes:** `UPPER_SNAKE_CASE` (ex: `API_BASE_URL`)
- **Tipos:** `PascalCase` (ex: `TenantConfig`)
- **Imports:** external → internal libs → components → types → styles

### 1.5 Design System

| Token | Valor |
|---|---|
| Background principal | `#f7f8fa` (light) / `#111b21` (dark WhatsApp) |
| Primária (brand) | `#1e3a5f` — Azul Royal |
| Sucesso | `#059669` |
| Border-radius cards | `12–16px` |
| Ícones | Lucide React (outline/thin) |
| Fontes | Inter / Poppins sans-serif |

---

## SEÇÃO 2 — CAMADA DE DADOS

### 2.1 Modelo Relacional Central

O schema segue o padrão **Multi-Tenant com isolamento por `tenant_id`** em todas as tabelas. Nenhuma query chega ao banco sem filtrar pela organização. Extensões PostgreSQL habilitadas: `uuid-ossp` (UUIDs) e `pg_trgm` (busca fuzzy).

#### Tabelas Núcleo (Migration 001)

```sql
tenants           → organizações/lojas (planos: free/starter/pro/enterprise)
  ├── profiles    → usuários (roles: owner/admin/agent/viewer)
  ├── clients     → contatos WhatsApp com métricas CRM (ltv, total_orders, avg_ticket)
  │   ├── conversations → chats (status: open/waiting/closed/archived)
  │   │   └── messages  → mensagens (tipos: text/image/video/audio/document/sticker...)
  │   └── orders    → pedidos (status: pending→confirmed→processing→shipped→delivered)
  │       └── order_items → itens do pedido
  ├── products     → catálogo (com stock tracking)
  ├── campaigns    → campanhas de mensagem em massa
  └── coupons      → sistema de cupons de desconto
```

#### Tabelas Especializadas (Migrations 005–021)

| Tabela | Migration | Propósito |
|---|---|---|
| `rfm_history` | 005 | Histórico de scores RFM por cliente |
| `anne_config` | 007 | Configuração da IA por tenant |
| `anne_logs` | 007 | Log de todas as interações da Anne |
| `kanban_cards` | 013 | Cards do pipeline de vendas |
| `anne_automations` | 015 | Regras de automação de disparo |
| `campaign_jobs` | 017 | Fila de envios de campanha |
| `campaign_contacts` | 017 | Contatos por campanha com status individual |
| `campaign_blocos` | 017 | Blocos de mídia da campanha |
| `tenant_daily_send_counts` | 020 | Contador anti-ban por tenant/dia |
| `automation_logs` | 020250120 | Log de automações executadas |

### 2.2 Segurança: Row Level Security (RLS)

Cada tabela possui políticas RLS que exigem a variável de sessão `app.current_tenant_id`. Isso garante isolamento completo de dados entre tenants — mesmo que uma query SQL não filtre por `tenant_id`, o RLS do Postgres bloqueia o acesso.

```sql
-- Padrão aplicado em todas as tabelas
CREATE POLICY "tenant_isolation" ON clients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### 2.3 Engine de Realtime

O Supabase Realtime é utilizado como **canal primário** para notificações de novas mensagens, usando `postgres_changes` na tabela `messages`:

```typescript
// useMessages hook — subscription por conversation_id
supabase
  .channel(`messages:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, handleNewMessage)
  .subscribe()
```

**Deduplicação:** A migration 021 adiciona `UNIQUE CONSTRAINT` na tabela `messages` para evitar duplicatas em upserts concorrentes.

### 2.4 RPCs PostgreSQL Críticas

| Função RPC | Propósito |
|---|---|
| `increment_daily_send_count(tenant_id, date, n)` | Contador atômico anti-ban (migration 020) |
| `get_daily_send_count(tenant_id, date)` | Consulta contagem diária de envios |

### 2.5 Índices e Performance

- `UNIQUE(tenant_id, phone_normalized)` — garante 1 contato por número por tenant
- `UNIQUE(tenant_id, code)` — garante 1 cupom por código por tenant
- `pg_trgm` — índices de busca fuzzy para pesquisa de clientes por nome
- Dados desnormalizados em `conversations` (`last_message_text`, `last_message_at`) para evitar JOINs na listagem

### 2.6 Histórico de Migrations

| # | Nome | Status |
|---|---|---|
| 000 | `verify_tables` | ✅ |
| 001 | `initial_schema` — 10 tabelas núcleo | ✅ |
| 002 | `fix_policies` — correções de RLS | ✅ |
| 003 | `add_unique_constraints` | ✅ |
| 004 | `add_orders_unique` | ✅ |
| 005 | `behavioral_intelligence` — rfm_history | ✅ |
| 006 | `intelligence_v2` — analytics aprimorado | ✅ |
| 007 | `contact_center_anne_v3` — anne_config, anne_logs | ✅ |
| 008 | `sync_audit_infrastructure` | ✅ |
| 009 | `messages_external_unique` | ✅ |
| 010 | `cleanup_duplicates` | ✅ |
| 011 | `client_identity` — normalização de telefone | ✅ |
| 012 | `anne_config_columns` | ✅ |
| 013 | `kanban_triggers` — triggers automáticos | ✅ |
| 014 | `kanban_enum` — estados despachado/cancelado | ✅ |
| 015 | `anne_automations` | ✅ |
| 016 | `anne_os` — tabelas Anne OS v5 | ✅ |
| 017 | `campaigns_v2` — blocos, jobs, anti-ban | ✅ |
| 018 | `storage_criativos` — bucket mídia campanhas | ✅ |
| 019 | `campaign_rpc_counters` | ✅ |
| 020 | `daily_send_counter` — RPC atômico anti-ban | ✅ |
| 021 | `messages_upsert_constraint` — dedup | ✅ |
| auto | `automation_logs` (20250120) | ✅ |

---

## SEÇÃO 3 — CÉREBRO (IA): ANNE OS v5.0

### 3.1 Visão Geral

A **Anne** é uma IA especialista em vendas via WhatsApp, operando como um sistema multi-agente com pipeline de 7 estágios. Ela não é um chatbot simples — é um orquestrador que decide qual agente especialista deve responder, gerencia crise e mantém memória de clientes.

### 3.2 Provedores LLM Suportados

```typescript
// src/lib/services/anne.service.ts
const PROVIDERS = {
  openai:    { url: 'https://api.openai.com/v1',        model: 'gpt-4o-mini'           },
  anthropic: { url: 'https://api.anthropic.com/v1',     model: 'claude-3-5-haiku-20241022' },
  google:    { url: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-flash' },
  groq:      { url: 'https://api.groq.com/openai/v1',   model: 'llama-3.3-70b-versatile' },
  deepseek:  { url: 'https://api.deepseek.com/v1',      model: 'deepseek-chat'         },
  custom:    { url: configurável pelo tenant,            model: configurável            },
}
```

**Padrão de abstração:** Todos os provedores OpenAI-compatíveis são tratados por `callOpenAICompatible()`. Anthropic e Google possuem callers próprios, adaptados para seus formatos de API. O tenant escolhe o provedor via `anne_config.provider`.

### 3.3 Pipeline L0–L6 (Anne OS v5.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ANNE OS v5.0 — PIPELINE                      │
├────────┬────────────────────────────────────────────────────────┤
│ L0     │ NORMALIZAÇÃO — limpa texto, extrai telefone/pedido     │
│ L1     │ MEMÓRIA — busca perfil + histórico do cliente no DB    │
│ L2     │ CRISE — detecta 18 keywords (reclame aqui, procon...)  │
│ L3     │ INTENÇÃO — classifica: COMERCIAL/LOGISTICA/FAQ/etc     │
│ L4     │ ROTEAMENTO — escolhe agente especialista               │
│ L5     │ ACTIONS — executa agente, retorna resposta estruturada │
│ L6     │ LOG — persiste em anne_logs, atualiza métricas         │
└────────┴────────────────────────────────────────────────────────┘
```

#### Categorias de Intenção

| Categoria | Descrição |
|---|---|
| `COMERCIAL` | Preços, tabelas, grades, MOQ, pagamento |
| `LOGISTICA` | Rastreamento, frete, prazos de entrega |
| `INSTITUCIONAL` | Sobre a empresa, políticas, FAQ |
| `ONBOARDING` | Primeiro contato, cadastro |
| `SISTEMA` | Comandos internos, escalação |
| `AMBIGUO` | Não classificável → Anne Central |

#### Detecção de Crise (L2)

```typescript
const CRISIS_KEYWORDS = [
  'defeito', 'quebrado', 'reembolso', 'estorno', 'chargeback',
  'procon', 'reclame aqui', 'advogado', 'processo', 'denúncia',
  'cancelar', 'cancelamento', 'fraude', 'golpe', 'enganado',
  'vergonha', 'péssimo', 'horrível', 'absurdo'
];
```
Ao detectar crise, o pipeline pula os agentes especialistas e escalona diretamente para atendimento humano.

### 3.4 Perfil de Cliente (ClientProfile)

```typescript
interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  tier: 'lead' | 'ativo' | 'vip' | 'key_account';
  rfm_segment?: string;           // Champions, At Risk, etc.
  ltv?: number;                   // Lifetime Value
  total_orders?: number;
  last_order_at?: string;
  pending_orders?: OrderSummary[];
  shipped_orders?: OrderSummary[];
  recent_messages?: MessageSummary[];
}
```

### 3.5 Agentes Especialistas (agent-executor.ts)

Cada agente é independente, recebe contexto isolado e **nunca responde diretamente ao cliente** — retorna `AgentResponse` para a Anne Central processar.

| Agente | Slug | Responsabilidade |
|---|---|---|
| Comercial Atacado | `comercial` | Preços, tabela, grades, MOQ, condições de pagamento |
| Logística & Rastreamento | `logistica` | Código de rastreio, prazo, status de entrega |
| FAQ / Institucional | `faq` | Políticas, informações da empresa |
| Anne Central | `anne_central` | Orchestração, resposta genérica, fallback |

**Detecção de condições especiais** (Agente Comercial):
```typescript
const requiresApproval = /\b(fora da tabela|condição especial|desconto extra|abrir exceção)\b/i.test(message);
// → tipo: 'incapaz', requer_aprovacao: true → escalona para humano
```

### 3.6 DNA do Prompt (anne-prompt.ts)

A Anne possui um **"Prompt de Fábrica"** (`DEFAULT_ANNE_PROMPT`) que garante alta performance mesmo sem nenhuma configuração pelo lojista. O prompt é rico em:
- Missão e tom de voz (proxima, ágil, sem formalidade)
- Instruções de foco em pedidos (recuperar pagamentos pendentes)
- Inteligência de venda por segmento RFM (Champions → atenção especial, At Risk → reconquista)
- Restrições absolutas (nunca inventar cupons, nunca expor dados sensíveis)
- Suporte a variáveis dinâmicas: `{{nome_loja}}`, `{{nome_atendente}}`, `{{link_catalogo}}`, `{{segmento_rfm}}`

**Hierarquia de prompt:**
1. `openai_system_prompt` configurado pelo lojista (personalizado)
2. `DEFAULT_ANNE_PROMPT` (prompt de fábrica — fallback robusto)

### 3.7 Rate Limiting da Anne

```typescript
// rate-limiter.ts
RATE_LIMITS = {
  ANNE_CHAT:     { maxRequests: 30,  windowSeconds: 60 },  // 30 req/min por tenant
  WHATSAPP_SEND: { maxRequests: 60,  windowSeconds: 60 },  // 60 msgs/min por tenant
  AUTO_SYNC:     { maxRequests: 2,   windowSeconds: 60 },  // evita race condition
}
```

> ⚠️ **Nota Técnica:** O rate limiter é **in-memory por instância**. Em ambiente serverless multi-instância (Netlify), cada cold start tem seu próprio estado. Para precisão total em produção, migrar para Redis/Upstash.

---

## SEÇÃO 4 — INTEGRAÇÃO DE MENSAGERIA

### 4.1 Arquitetura WhatsApp (Evolution API SaaS)

```
Cliente WhatsApp
      │
      ▼
Evolution API (https://evolution-api.cjota.site)
      │
      ├── Webhook → /api/webhooks/evolution?tenant_id=XXX
      │                    │
      │                    ▼
      │             Salva mensagem no Supabase
      │             Aciona Anne pipeline (se configurado)
      │             Atualiza conversation.last_message_*
      │
      └── REST API ← sendTextMessage / sendMediaMessage / sendStatus
                              │
                              ▼
                    src/lib/services/evolution.service.ts
```

### 4.2 Modelo Multi-Tenant de Instâncias

Cada tenant possui sua própria instância WhatsApp com nome derivado do `tenant_id`:

```typescript
function getInstanceName(tenantId: string): string {
  return `vexx-${tenantId.replace(/-/g, '').substring(0, 12)}`;
  // ex: tenant "abc-def-ghi" → "vexx-abcdefghi"
}
```

**Segurança:** `EVOLUTION_API_URL` e `EVOLUTION_GLOBAL_KEY` são variáveis de ambiente server-only — nunca expostas ao cliente.

### 4.3 Ciclo de Vida de Instâncias

```
provisionInstance(tenantId, webhookBaseUrl)
  │
  ├── [status = 'open'] → retorna { status: 'exists' }
  ├── [existe mas desconectada] → reconnectInstance() → QR Code
  │     └── [falha] → deleteInstance() → createInstance() → QR Code
  └── [não existe] → createInstance() → setInstanceWebhook() → QR Code
```

### 4.4 Tipos de Mensagem Suportados

| Método | Evolution API Endpoint | Descrição |
|---|---|---|
| `sendTextMessage()` | `/message/sendText/{instance}` | Texto puro |
| `sendMediaMessage()` | `/message/sendMedia/{instance}` | Imagem, vídeo, áudio, documento |
| `sendStatus()` | `/message/sendStatus/{instance}` | Stories (texto/imagem/vídeo) |
| `sendReaction()` | `/message/sendReaction/{instance}` | Reação com emoji |
| `sendAudio()` | `/message/sendWhatsAppAudio/{instance}` | Áudio como mensagem de voz (PTT) |

### 4.5 Tratamento de Erros de Rede

```typescript
// safeJson() — trata respostas HTML do Cloudflare (502 Bad Gateway)
async function safeJson<T>(response: Response, context: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Evolution API às vezes retorna HTML de erro do Cloudflare
    const text = await response.text();
    throw new Error(`${context} retornou não-JSON (HTTP ${response.status}): ${text.substring(0, 150)}`);
  }
  return response.json();
}
```

### 4.6 Sistema SSE (Server-Sent Events)

SSE é usado como canal secundário para notificações em tempo real na Central de Mensagens.

**Configuração Netlify:**
```toml
[functions."api/sse"]
  timeout = 26              # máx permitido no plano free

[[headers]]
  for = "/api/sse"
  [headers.values]
    Cache-Control = "no-cache, no-transform"
    X-Accel-Buffering = "no"
    Content-Type = "text/event-stream"
```

**Tratamento de bloqueio CDN:**
```typescript
// useWhatsApp.ts — evita loop infinito de reconexão quando CDN bloqueia SSE
const sseBlockedRef = useRef(false);

// Se SSE retorna 403 ou falha em < 2s, marca como bloqueado
// e usa exclusivamente Supabase Realtime como fallback
if (sseBlockedRef.current) return; // para novas tentativas
```

**Fluxo de Realtime:**
1. **Primário:** Supabase Realtime (`postgres_changes` na tabela `messages`)
2. **Secundário:** SSE em `/api/sse` — 1 tentativa, CDN-block flag para loop infinito
3. **Fallback:** Polling manual via React Query `refetchInterval`

### 4.7 Parser de Mensagens WhatsApp

```typescript
// message-parser.tsx
parseMessageContent(text: string): React.ReactNode
// Suporta:
//   \n           → quebras de linha reais
//   *bold*       → <strong>
//   _italic_     → <em>
//   ~strikethrough~ → <del>
//   `code`       → <code>
```

---

## SEÇÃO 5 — MOTOR DE TRAÇÃO COMERCIAL

### 5.1 Sistema de Campanhas

#### Arquitetura da Fila de Envio

```
campaign_jobs (Supabase)
      │
      ▼ (minutely via Netlify Scheduled Function)
campaign-dispatcher.ts
      │
      ├── L1: Verificar janela horária (8h–20h REGRA DA CAROL)
      ├── L2: Verificar cota diária (MAX_ENVIOS_24H)
      ├── L3: Para cada contato:
      │    ├── resolverVariaveis() — injeta {{nome}}, {{cidade}}, etc.
      │    ├── gerarDelayHumanizado() — delay estatístico (Box-Muller)
      │    ├── enviarBloco() — texto/imagem/vídeo/áudio/CTA
      │    ├── Cooloff a cada 10 envios (60s obrigatório)
      │    └── increment_daily_send_count() — RPC atômico
      └── L4: Atualizar status do job no banco
```

#### REGRA DA CAROL — Anti-Ban Protocol

```typescript
// campaign-dispatcher.ts — valores HARDCODED, não negociáveis
const REGRA_CAROL_FLOOR = {
  DELAY_MIN_MS:        15_000,   // 15s mínimo entre contatos
  COOLOFF_A_CADA:      10,       // pausa obrigatória a cada 10 envios
  COOLOFF_DURACAO_MS:  60_000,   // 60s de pausa
  MAX_ENVIOS_24H:      200,      // teto diário de envios
  JANELA_INICIO:       8,        // início da janela de envio (8h)
  JANELA_FIM:          20,       // fim da janela (20h)
};

function aplicarRegraCarol(config: AntibanConfig): AntibanConfig {
  // O usuário pode AUMENTAR os valores, nunca diminuir abaixo do floor
  return {
    delayMin: Math.max(config.delayMin, REGRA_CAROL_FLOOR.DELAY_MIN_MS),
    cooloffACada: Math.min(config.cooloffACada, REGRA_CAROL_FLOOR.COOLOFF_A_CADA),
    maxEnvios24h: Math.min(config.maxEnvios24h, REGRA_CAROL_FLOOR.MAX_ENVIOS_24H),
    // ...
  };
}
```

**Propósito:** Proteger o número WhatsApp do tenant de banimento pelo Meta. A "Regra da Carol" é o diferencial de segurança do produto — nenhum usuário pode configurar valores mais agressivos que o floor.

#### Delays Humanizados (Box-Muller)

```typescript
function gerarDelayHumanizado(base: number, variacao: number): number {
  // Box-Muller simplificado: gera distribuição gaussiana
  // Simula comportamento humano real ao invés de delay fixo previsível
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(base, base + z * variacao);
}
```

#### Tipos de Bloco de Campanha

| Tipo | Descrição |
|---|---|
| `texto` | Mensagem de texto com variáveis |
| `imagem` | Imagem com caption opcional |
| `video` | Vídeo com caption |
| `audio` | Áudio (mensagem de voz PTT) |
| `cta` | Call-to-Action com botão de link |

#### Personalização por Variáveis

```typescript
resolverVariaveis(texto, contato) // {{nome}}, {{cidade}}, {{estado}},
                                   // {{ultimo_pedido}}, {{valor_ltv}}
```

### 5.2 Engine RFM (Recency-Frequency-Monetary)

#### Modelo de Scoring

Scores de 1 a 5 para cada dimensão:

| Dimensão | Score 5 | Score 4 | Score 3 | Score 2 | Score 1 |
|---|---|---|---|---|---|
| **Recência** | ≤30 dias | 31-60 dias | 61-90 dias | 91-180 dias | >180 dias |
| **Frequência** | ≥10 pedidos | 5-9 pedidos | 3-4 pedidos | 2 pedidos | 1 pedido |
| **Monetário** | Top 20% | 60-80% | 40-60% | 20-40% | Bottom 20% |

#### 11 Segmentos RFM

| Segmento | Perfil | Prioridade | Cor |
|---|---|---|---|
| Champions | Comprou recente, muitas vezes, alto valor | 1 | 🥇 Ouro |
| Loyal Customers | Compra regularmente | 2 | 🌟 Azul |
| Potential Loyalist | Cliente recente com potencial | 3 | 💚 Verde |
| New Customers | Comprou recentemente pela 1ª vez | 4 | |
| Promising | Recente, baixa frequência | 5 | |
| Need Attention | Acima da média, em risco | 6 | ⚠️ Laranja |
| About To Sleep | Inatividade iminente | 7 | |
| At Risk | Bom histórico, sem comprar recente | 8 | 🔴 Vermelho |
| Can't Lose Them | Alto valor histórico, sumiu | 9 | 🆘 Crítico |
| Hibernating | Baixo engajamento por muito tempo | 10 | |
| Lost | Perdidos — sem atividade recente | 11 | |

#### Predições Geradas pelo RFM Engine

```typescript
interface RFMResult {
  scores: { r: number; f: number; m: number; total: number };
  segment: RFMSegmentName;
  predictions: {
    ltv_projected_12m: number;      // LTV projetado para 12 meses
    churn_probability: number;       // 0.0 a 1.0
    purchase_prob_30d: number;       // probabilidade de comprar em 30 dias
  };
  flags: {
    auto_vip: boolean;               // promover automaticamente a VIP
    churn_risk: boolean;             // em risco de churn
    needs_attention: boolean;        // requer atenção imediata
    upsell_ready: boolean;           // pronto para upsell
  };
}
```

### 5.3 Kanban de Pipeline de Vendas

#### Máquina de Estados Finitos (kanban-state-machine.ts)

O Kanban possui **8 colunas** com transições controladas por uma FSM. Estado terminal `CONCLUIDO` bloqueia movimentação automática (requer ação manual com motivo).

```
PRIMEIRO_CONTATO → EM_NEGOCIACAO → AGUARDANDO_PAGAMENTO → PAGO → DESPACHADO → CONCLUIDO
                                                                  ↓
                                                             CANCELADO ↔ REATIVAR
```

| Coluna | Ícone | Terminal? |
|---|---|---|
| `PRIMEIRO_CONTATO` | 👋 | Não |
| `EM_NEGOCIACAO` | 💬 | Não |
| `AGUARDANDO_PAGAMENTO` | 💳 | Não |
| `PAGO` | ✅ | Não |
| `DESPACHADO` | 🚚 | Não |
| `CANCELADO` | 🙁 | Não |
| `REATIVAR` | 🔄 | Não |
| `CONCLUIDO` | 🏁 | **Sim** |

```typescript
// Toda transição é validada e logada
validateTransition(de: KanbanColumn | null, para: KanbanColumn): TransitionResult
// → { allowed: boolean, anomaly_code?: string, message?: string }
// Card novo: só pode ir para PRIMEIRO_CONTATO
// CONCLUIDO: não aceita transições (estado terminal)
```

### 5.4 Sistema Sentinela

O módulo `sentinela` é um monitor autônomo que analisa o estado do CRM e gera alertas proativos:

- Pedidos parados há mais de X dias
- Clientes VIP sem resposta
- Campanhas com taxa de falha elevada
- Alertas de churn por segmento RFM

Executado via endpoint `/api/sentinela/scan` com timeout de 26s (Netlify).

### 5.5 Integração Facilzap (E-commerce)

O sistema possui integração bidirecional com a plataforma **Facilzap** para sincronização de:
- Clientes (`/api/facilzap/clients`)
- Pedidos (`/api/facilzap/orders`)
- Produtos (`/api/facilzap/products`)

O sync é executado automaticamente via `useAutoSync` hook e pode ser acionado manualmente.

---

## SEÇÃO 6 — INFRAESTRUTURA DE ESCALA

### 6.1 Plataforma de Deploy: Netlify

```toml
# netlify.toml
[build]
  command   = "npm run build"
  publish   = ".next"
  NODE_VERSION = "20"
  NPM_FLAGS = "--legacy-peer-deps"

[[plugins]]
  package = "@netlify/plugin-nextjs"   # plugin oficial Next.js
```

### 6.2 Funções Serverless com Timeouts Customizados

| Função | Timeout | Justificativa |
|---|---|---|
| `api/sentinela/scan` | 26s | Scan completo do CRM |
| `api/sync` | 26s | Sincronização Facilzap |
| `api/cron/campaign-dispatcher` | 26s | Processamento da fila |
| `api/sse` | 26s | Stream SSE (máx free tier) |

> **Limite do plano free:** 26 segundos. O plano pago Netlify permite até 10 minutos por função.

### 6.3 Cron Automático

```toml
[scheduled-functions."campaign-dispatcher-cron"]
  schedule = "* * * * *"               # Executa TODA MINUTO
  function = "api/cron/campaign-dispatcher"
```

A cada minuto, o motor de campanhas é acordado, processa a fila de envios pendentes, aplica a REGRA DA CAROL e dorme novamente.

### 6.4 Headers de Segurança

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options            = "DENY"
    X-Content-Type-Options     = "nosniff"
    Referrer-Policy            = "strict-origin-when-cross-origin"
    Permissions-Policy         = "camera=(), microphone=(), geolocation=()"
```

### 6.5 Análise de Capacidade

| Recurso | Capacidade Atual | Gargalo |
|---|---|---|
| Mensagens/min por tenant | 60 (rate limit) | Rate limiter in-memory |
| Envios campanha/dia por tenant | 200 (REGRA DA CAROL) | Hardcoded safety floor |
| Histórico de mensagens exibido | 10.000+ (virtualizado) | `@tanstack/react-virtual` |
| Múltiplos tenants | Isolamento por RLS | Sem gargalo técnico |
| Supabase Realtime | N conexões simultâneas | Limite do plano Supabase |
| SSE | 26s/conexão | Netlify CDN bloqueia streaming |

### 6.6 Pontos de Melhoria de Escala

| Item | Risco | Solução Recomendada |
|---|---|---|
| Rate limiter in-memory | Em multi-instância, cada instância tem seu próprio contador | Migrar para Redis/Upstash |
| SSE bloqueado pelo CDN | Realtime funciona, mas SSE não | Mover deploy para Vercel ou plano Netlify pago |
| Campaign dispatcher 26s | Jobs grandes podem ser cortados | Quebrar em micro-jobs com state no DB |
| Timeout sentinela 26s | Scans em bases grandes são cortados | Paginação + execução incremental |
| Memória Anne sem vetor | Busca semântica de histórico é O(n) | Supabase pgvector + embeddings |

### 6.7 Workflow N8N (Processamento de Mídia)

```
n8n/vexx-media-processing-workflow.json
```

Workflow para processamento assíncrono de mídias recebidas via WhatsApp (transcrição de áudio, extração de texto de imagens, etc.), integrado via webhook com o sistema principal.

---

## SEÇÃO 7 — INVENTÁRIO DE ARQUIVOS CRÍTICOS

### 7.1 Serviços de Negócio (`src/lib/services/`)

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `anne.service.ts` | ~280 | Abstração multi-LLM (6 provedores) |
| `anne-pipeline.ts` | ~400+ | Orchestrador do pipeline L0-L6 |
| `agent-executor.ts` | 402 | 4 agentes especialistas |
| `evolution.service.ts` | 709 | WhatsApp SaaS multi-tenant |
| `campaign-dispatcher.ts` | 456 | Motor de campanhas + REGRA DA CAROL |
| `rfm-engine.ts` | 581 | Engine RFM completa com predições |

### 7.2 Bibliotecas Core (`src/lib/`)

| Arquivo | Responsabilidade |
|---|---|
| `kanban-state-machine.ts` | FSM do Kanban (8 colunas, validação de transições) |
| `rfm-segments.ts` | Dicionário de 11 segmentos RFM + thresholds |
| `anne-prompt.ts` | DNA do prompt Anne + variáveis dinâmicas |
| `anne-triggers.ts` | Gatilhos de automação |
| `message-parser.tsx` | Parser WhatsApp (*bold*, _italic_, quebras de linha) |
| `phone-normalizer.ts` | `PhoneNormalizer.canonical()` — padrão `55DDNNNNNNNNN` |
| `rate-limiter.ts` | Rate limiting in-memory (janela deslizante) |
| `event-bus.ts` | Event bus global para comunicação entre módulos |

### 7.3 Hooks Principais

| Hook | Responsabilidade |
|---|---|
| `useAnne.ts` | Chat com Anne IA |
| `useAuth.ts` | Autenticação Supabase |
| `useAutoSync.ts` | Sync automático de dados |
| `useCampaigns.ts` | CRUD e execução de campanhas |
| `useChats.ts` | Lista de conversas com Realtime |
| `useClients.ts` | CRM: busca, filtros, segmentos |

---

## SEÇÃO 8 — ANÁLISE DE RISCOS E RECOMENDAÇÕES

### 8.1 Riscos Críticos

| # | Risco | Severidade | Recomendação |
|---|---|---|---|
| R1 | Rate limiter in-memory perde estado entre instâncias serverless | **Alta** | Migrar para Redis/Upstash |
| R2 | SSE bloqueado por CDN Netlify — dependência de Realtime como único canal | **Média** | Aceitar como design (Realtime é primário) |
| R3 | Memória Anne é busca sequencial no DB sem indexação vetorial | **Média** | Adicionar `pgvector` para busca semântica |
| R4 | Timeout 26s corta jobs longos de sentinela/sync | **Média** | Paginação com state no banco |
| R5 | `evolution_api_key` armazenado em `tenants` table (plaintext) | **Média** | Criptografar com Supabase Vault |

### 8.2 Pontos de Excelência

| # | Feature | Por que é diferencial |
|---|---|---|
| E1 | REGRA DA CAROL hardcoded | Impede banimento — não pode ser contornado |
| E2 | VirtualizedMessageList | Performance em conversas de 10k+ msgs |
| E3 | Pipeline L0-L6 com detecção de crise | Evita dano reputacional automaticamente |
| E4 | RFM Engine com predições | LTV projetado, churn probability, upsell ready |
| E5 | Kanban FSM com log de auditoria | Rastreabilidade completa de todo movimento |
| E6 | Multi-LLM com 6 provedores | Sem lock-in de fornecedor de IA |
| E7 | 22 migrations versionadas | Schema evolution controlado e documentado |

### 8.3 Roadmap Técnico Recomendado

```
CURTO PRAZO (1-2 sprints)
├── Migrar rate-limiter para Redis/Upstash
├── Criptografar chaves API no banco (Supabase Vault)
└── Paginação incremental no Sentinela

MÉDIO PRAZO (1-2 meses)
├── pgvector para memória semântica da Anne
├── Mover SSE para Vercel Edge Functions (sem limite CDN)
└── Dashboard de saúde multi-tenant para admins

LONGO PRAZO (3-6 meses)
├── Kanban com triggers de automação baseados em RFM
├── A/B testing nativo para campanhas
└── Anne com acesso a ferramentas externas (function calling)
```

---

## CONCLUSÃO

O **VEXX CRM 2.0** é um sistema bem-arquitetado, com separação clara de responsabilidades, modelo de dados sólido e features de negócio genuinamente diferenciadas. A **REGRA DA CAROL** e o **RFM Engine com predições** são ativos técnicos raros no mercado de CRMs para e-commerce brasileiro.

O principal gap técnico atual é a falta de persistência de estado distribuída (rate limiter in-memory), que se torna relevante conforme o número de tenants cresce e o Netlify escala horizontalmente. A resolução é direta e bem documentada.

A base está pronta para crescimento. A arquitetura suporta centenas de tenants sem reestruturação — o isolamento por RLS e o modelo multi-tenant são robustos desde a migration 001.

---

*Relatório gerado em varredura completa do repositório VEXX CRM 2.0 — commit `a48e2cd`*
