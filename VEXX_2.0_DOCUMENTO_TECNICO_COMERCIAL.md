# VEXX 2.0 — Documento Técnico-Comercial

**Classificação:** Confidencial — Uso Interno e Pitch Comercial  
**Versão:** 2.0.0  
**Data:** Fevereiro 2026  
**Elaboração:** Diretoria de Produto & Engenharia de Software

---

## SUMÁRIO EXECUTIVO

O **VEXX 2.0** é uma plataforma SaaS (Software as a Service) de **Gestão de Vendas e Atendimento Inteligente via WhatsApp** projetada para o ecossistema de atacado e varejo brasileiro, com foco inicial no segmento de **moda e confecção**.

A plataforma transforma o WhatsApp — hoje um canal caótico de vendas — em um **terminal de vendas automatizado** com Inteligência Artificial, integração direta com e-commerce (FacilZap), análise comportamental de clientes (RFM) e atendimento multi-agente centralizado.

**Em números auditáveis do repositório:**
- **708 linhas** de definição de tipos TypeScript (contratos de API)
- **24 módulos de API** REST (server-side)
- **14 hooks React** especializados (client-side)
- **14 serviços de negócio** (intelligence, sync, IA, CRM)
- **9 migrações SQL** com esquema relacional completo
- **11 segmentos RFM** com motor de predição proprietário
- **8 tipos de análise autônoma** pela Sentinela Anne
- **10+ tabelas** com Row Level Security (isolamento multi-tenant)

---

## 1. VISÃO GERAL DO PRODUTO

### 1.1 Identidade

| Atributo | Detalhe |
|----------|---------|
| **Nome** | VEXX 2.0 |
| **Categoria** | SaaS B2B — CRM & Sales Automation |
| **Modelo** | Multi-Tenant com isolamento por organização |
| **Público-alvo** | Lojistas de atacado/varejo que vendem via WhatsApp |
| **Vertical inicial** | Moda, confecção e acessórios (ecossistema FacilZap) |
| **Deployment** | Cloud (Netlify) + VPS (Hostinger/Easypanel) |
| **Licença** | Proprietária (UNLICENSED) |

### 1.2 Proposta de Valor

> **"Transformar o WhatsApp de um simples chat em um terminal de vendas automatizado com Inteligência Artificial e integração direta de pedidos."**

O VEXX 2.0 resolve 5 dores fundamentais do lojista brasileiro:

1. **Vendas perdidas por desorganização:** Mensagens se perdem em meio a centenas de conversas diárias. O VEXX centraliza tudo em uma interface profissional com filas, priorização e atribuição automática.

2. **Zero visibilidade sobre o cliente:** O lojista não sabe quem é VIP, quem está prestes a abandonar, ou quem compra sazonalmente. O VEXX calcula RFM, LTV, churn probability e 11 segmentos comportamentais automaticamente.

3. **Tempo desperdiçado em tarefas repetitivas:** Consultar pedido, verificar estoque, classificar comprovante de pagamento. A Sentinela Anne (IA) faz isso em segundos com análise de áudio, imagem e texto.

4. **Impossibilidade de escalar:** Quando o lojista contrata vendedores, não tem como distribuir atendimentos, transferir entre setores ou auditar conversas. O VEXX possui Contact Center completo com filas, departamentos e RBAC.

5. **Dados em silos separados:** Pedidos no e-commerce, contatos no celular, histórico no WhatsApp. O VEXX unifica tudo: cruza dados de pedidos (FacilZap) com contatos do WhatsApp para criar um perfil 360° do cliente.

### 1.3 Posicionamento Estratégico

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MAPA DE POSICIONAMENTO                           │
│                                                                      │
│  Complexidade ↑                                                      │
│               │   Salesforce    HubSpot                              │
│               │       ●            ●     ← Caros, complexos,        │
│               │                          sem WhatsApp nativo         │
│               │                                                      │
│               │            ● VEXX 2.0   ← IA + WhatsApp +           │
│               │                            e-commerce = sweet spot   │
│               │                                                      │
│               │    Chatpro ●       ● Evolvy                         │
│               │                          ← Só chat, sem CRM/IA      │
│               │                                                      │
│               │  WhatsApp ●                                          │
│               │  Business     ← Grátis, mas zero gestão              │
│               └──────────────────────────────────────────→           │
│                            Inteligência & Automação                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. ARQUITETURA TECNOLÓGICA

### 2.1 Stack Completo (Auditado do Repositório)

| Camada | Tecnologia | Versão | Função |
|--------|-----------|--------|--------|
| **Framework** | Next.js (App Router) | 16.1.6 | SSR, API Routes, Middleware |
| **Linguagem** | TypeScript | 5.9.3 | Tipagem estática em todo o projeto |
| **UI Library** | React | 19.2.4 | Componentes declarativos |
| **Estilização** | Tailwind CSS | 4.1.18 | Design system customizado |
| **State Management** | Zustand | 5.0.11 | 4 stores (auth, chats, connection, ui) |
| **Data Fetching** | TanStack React Query | 5.90.21 | Cache, infinite scroll, mutations |
| **Banco de Dados** | Supabase (PostgreSQL) | 2.95.3 | Relacional + Auth + Storage + RLS |
| **Virtualização** | react-window | 2.2.6 | Listas com 10k+ itens sem travamento |
| **Ícones** | Lucide React | 0.563.0 | 1000+ ícones consistentes |
| **Export** | SheetJS (xlsx) | 0.18.5 | Exportação de dados para Excel |
| **Build** | Turbopack | Integrado | Dev server com HMR ultrarrápido |

### 2.2 Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VEXX 2.0 — ARQUITETURA SaaS                    │
│                                                                         │
│  ┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐│
│  │   FRONTEND   │     │   NEXT.JS API LAYER  │     │   DATA LAYER     ││
│  │              │     │                      │     │                  ││
│  │ React 19     │────▶│ 24 API Routes        │────▶│ Supabase         ││
│  │ Tailwind CSS │     │ Middleware (Auth)     │     │ (PostgreSQL)     ││
│  │ Zustand      │     │ SSE Event Bus        │     │                  ││
│  │ React Query  │◀────│ Rate Limiter         │◀────│ RLS Policies     ││
│  │ react-window │     │                      │     │ 9 Migrações      ││
│  └──────────────┘     └──────────┬───────────┘     │ 10+ Tabelas      ││
│                                  │                  └──────────────────┘│
│                    ┌─────────────┼─────────────┐                       │
│                    ▼             ▼              ▼                       │
│  ┌──────────────────┐ ┌───────────────┐ ┌──────────────────┐          │
│  │  EVOLUTION API   │ │   FACILZAP    │ │   OPENAI / n8n   │          │
│  │  (WhatsApp)      │ │  (E-commerce) │ │  (Inteligência)  │          │
│  │                  │ │               │ │                  │          │
│  │ • Multi-instância│ │ • Produtos    │ │ • GPT-4o/mini    │          │
│  │ • Webhook        │ │ • Pedidos     │ │ • Sentinela Anne │          │
│  │ • QR Code auto   │ │ • Clientes    │ │ • Transcrição    │          │
│  │ • Mídia permanente│ │ • Sync cron  │ │ • Visão comp.    │          │
│  └──────────────────┘ └───────────────┘ └──────────────────┘          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    VPS HOSTINGER + EASYPANEL                  │      │
│  │   Docker containers: Evolution API + n8n + Postgres (EVO)     │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Infraestrutura de Deployment

| Componente | Onde roda | Justificativa |
|-----------|-----------|---------------|
| **Frontend + API** | Netlify (Serverless) | Edge network global, CI/CD automático, SSL |
| **Evolution API** | VPS Hostinger (Docker) | Requer conexão persistente com WhatsApp |
| **n8n (Orquestrador IA)** | VPS Hostinger (Docker) | Workflows de processamento de mídia |
| **PostgreSQL (App)** | Supabase Cloud | Managed, backups automáticos, RLS |
| **PostgreSQL (Evolution)** | VPS Hostinger (Docker) | Store da Evolution API |
| **Storage de Mídia** | Supabase Storage | Bucket `media` para mídias permanentes |

### 2.4 Design System

O VEXX 2.0 possui Design System proprietário com 2 temas integrados:

**Tema CRM (Gestão):**
- Background: `#f7f8fa` — Cards: `#ffffff` com border-radius 16px
- Primária: `#1e3a5f` (Azul Royal) — Secundária: `#2563eb`
- Sucesso: `#059669` — Warning: `#d97706` — Danger: `#dc2626`
- Tipografia: Inter + Poppins sans-serif
- Shadows: sistema de 5 níveis (card, card-hover, modal, dropdown, btn-hover)

**Tema WhatsApp Dark (Chat):**
- Background: `#111b21` — Panel: `#202c33` — Input: `#2a3942`
- Bubble In: `#202c33` — Bubble Out: `#005c4b`
- Accent Green: `#00a884` — Accent Blue: `#53bdeb`
- Textos: `#e9edef` (primário) / `#8696a0` (secundário)

### 2.5 Segurança por Design

| Camada | Implementação | Arquivo |
|--------|--------------|---------|
| **Middleware de Auth** | Valida JWT em TODAS as rotas `/api/*` exceto webhooks | `src/middleware.ts` |
| **Row Level Security** | Policies PostgreSQL em TODAS as tabelas | `001_initial_schema.sql` |
| **Tenant Isolation** | Header `x-tenant-id` injetado pelo middleware | `src/lib/auth-helpers.ts` |
| **RBAC** | Roles: `owner`, `admin`, `agent`, `viewer` | `profiles.role` |
| **API Key Protection** | `EVOLUTION_GLOBAL_KEY` NUNCA exposta ao client | `evolution.service.ts` |
| **Rate Limiting** | Sliding window por IP/tenant | `src/lib/rate-limiter.ts` |
| **Safe JSON** | Parser seguro contra HTML/502 da Evolution | `safeJson()` helper |
| **Phone Normalization** | Canonicalização DDI+DDD determinística | `src/lib/phone-normalizer.ts` |
| **Token Masking** | Keys mascaradas no GET (ex: `sk-...XXXX`) | `tenants/config/route.ts` |

---

## 3. FUNCIONALIDADES — INVENTÁRIO COMPLETO

### 3.1 Módulo: Central de Atendimento (WhatsApp)

A Central de Atendimento é o coração operacional do VEXX 2.0, integrando chat, CRM e e-commerce em uma interface única.

| Feature | Implementação | Arquivos |
|---------|--------------|----------|
| **Chat em tempo real** | SSE (Server-Sent Events) multi-tenant | `event-bus.ts`, `sse/route.ts` |
| **Lista de conversas** | Infinite scroll com paginação cursor-based (25/page) | `ChatList.tsx`, `useChats.ts` |
| **Bolhas de mensagem** | Texto, imagem, vídeo, áudio, documento, sticker | `MessageBubble.tsx` |
| **Input de mensagem** | Texto + envio de mídia (imagem, vídeo, áudio, doc) | `MessageInput.tsx` |
| **Respostas rápidas** | Templates pré-configurados por tenant | `QuickReplies.tsx` |
| **Filtros de conversa** | Todas, Não lidas, Aguardando, Minhas, Arquivadas | `ChatFilters.tsx` |
| **CRM Sidebar** | Painel lateral com dados do cliente em tempo real | `CRMSidebar.tsx` |
| **Histórico de pedidos** | Timeline com status, itens, valores e tracking | `OrderHistory.tsx` |
| **Catálogo inline** | Busca e envio de produtos direto no chat | `CatalogoDrawer.tsx` |
| **Transferência** | Transferir conversa entre agentes/departamentos | `TransferDialog.tsx` |
| **Ações rápidas** | Marcar como resolvido, priorizar, arquivar | `QuickActionsBar.tsx` |
| **Filas inteligentes** | Distribuição por departamento/prioridade/disponibilidade | `QueuePanel.tsx` |
| **Status de conexão** | Badge real-time do WhatsApp (conectado/desconectado) | `ConnectionStatus.tsx` |
| **QR Code automático** | Provisionamento de instância e QR via API interna | `whatsapp/connect/route.ts` |
| **Download de mídia permanente** | Mídia baixada para Storage (URLs do WhatsApp expiram) | `downloadMediaToStorage()` |
| **Re-download de mídia** | Botão para re-baixar mídias expiradas | `media/redownload/route.ts` |

#### Fluxo técnico de uma mensagem recebida:
```
WhatsApp → Evolution API → Webhook POST /api/webhooks/evolution
  │
  ├─ 1. Identifica tenant (query param ou lookup por instância)
  ├─ 2. Normaliza telefone → PhoneNormalizer.canonical()
  ├─ 3. Upsert cliente (cria se não existir)
  ├─ 4. Busca/cria conversation
  ├─ 5. Download mídia → Supabase Storage (permanente)
  ├─ 6. INSERT na tabela messages (dedup por external_id)
  ├─ 7. Emite SSE → EventBus → todas as tabs do atendente
  └─ 8. Forward para n8n (se mídia: transcrição/visão computacional)
```

### 3.2 Módulo: Inteligência Artificial (IA)

O VEXX 2.0 possui 5 motores de inteligência independentes mas interconectados:

#### 3.2.1 Motor RFM (Recency-Frequency-Monetary)

Motor proprietário que classifica **toda a base de clientes** em 11 segmentos comportamentais:

| Segmento | Score R-F-M | Ação Automática |
|----------|-------------|-----------------|
| 🏆 Champions | R5 F5 M5 | VIP care, upsell premium |
| 💎 Loyal Customers | R4 F4+ M4+ | Programa de fidelidade |
| ⭐ Potential Loyalist | R4+ F2-3 | Nurturing, 2ª compra |
| 🆕 New Customers | R5 F1 | Onboarding, cross-sell |
| 🌱 Promising | R4 F1 M1 | Incentivar recompra |
| ⚠️ Need Attention | R3 F3 M3 | Re-engajamento |
| 😴 About to Sleep | R2 F2 | Cupom de reativação |
| 🔴 At Risk | R2 F3+ M3+ | Retenção urgente |
| 🚨 Can't Lose Them | R1 F4+ M4+ | Recuperação VIP |
| ❄️ Hibernating | R1-2 F1-2 | Win-back campaign |
| 💀 Lost | R1 F1 M1 | Últimas tentativas |

**Métricas calculadas por cliente:**
- `rfm_recency`, `rfm_frequency`, `rfm_monetary` (scores 1-5)
- `churn_probability` (% de probabilidade de perda)
- `purchase_prob_30d` (% de chance de compra nos próximos 30 dias)
- `ltv_projected_12m` / `ltv_projected_life` (valor projetado)
- `expected_next_ticket` (ticket esperado da próxima compra)
- `next_purchase_at` (data estimada da próxima compra)
- Flags: `auto_vip`, `churn_risk`, `needs_attention`, `upsell_ready`

**Arquivo:** `src/lib/services/rfm-engine.ts` (581 linhas)  
**Arquivo:** `src/lib/rfm-segments.ts` (266 linhas — dicionário de segmentos com cores, ícones e ações)

#### 3.2.2 Sentinela Anne v3 (Agente Autônomo)

A Sentinela Anne é um **agente de IA autônomo** que analisa a base de clientes e gera **diagnósticos e ações acionáveis** sem intervenção humana.

**8 tipos de análise autônoma:**

| Tipo | Gatilho | Ação Gerada |
|------|---------|-------------|
| `churn_risk` | Churn prob ≥ 50% | Gera cupom personalizado com urgência |
| `upsell_opportunity` | LTV alto + upsell_ready | Sugere produtos premium |
| `reactivation` | 60-120 dias inativo | Mensagem de reativação + cupom |
| `vip_care` | Segmento Champions | Atendimento prioritário + mimo |
| `seasonal_opportunity` | Evento sazonal próximo | Campanha direcionada |
| `cross_sell` | Afinidade de produtos detectada | Sugestão de produtos complementares |
| `win_back` | 120+ dias inativo, LTV > R$500 | Oferta agressiva de retorno |
| `new_customer_nurture` | 1º pedido recente | Sequência de boas-vindas |

**Fluxo completo:**
```
Sentinela Anne Scan → Para cada cliente:
  │
  ├─ 1. SalesAssistant.getFullInsight(clientId)
  │     ├─ RFM Score + Segment
  │     ├─ Purchase history + trends
  │     ├─ Seasonal profile
  │     ├─ Product affinities (Market Basket Analysis)
  │     └─ Grade preferences + price sensitivity
  │
  ├─ 2. Aplica 8 regras de análise (ANALYSIS_RULES)
  │     ├─ check(insight) → boolean
  │     ├─ urgency(insight) → low/medium/high/critical
  │     ├─ confidence(insight) → 0-100%
  │     └─ actionPayload(insight) → cupom, mensagem, tag...
  │
  ├─ 3. Gera sentinela_analyses (tabela de diagnósticos)
  │     ├─ Status: pending → approved → executed
  │     └─ Feedback loop: score + notes do atendente
  │
  └─ 4. Gera cupons automáticos (sentinela_coupons)
        ├─ Código único (CODE_XXXX)
        ├─ Percentual proporcional ao risco
        └─ Expiração automática (48-72h)
```

**Arquivo:** `src/lib/services/anne-intelligence.ts` (600 linhas)

#### 3.2.3 Sales Assistant (Copiloto do Vendedor)

Gera **contexto completo em tempo real** para o atendente durante a conversa:

- **Summary:** Resumo textual do perfil do cliente em 1 frase
- **Urgency:** Classificação visual (🟢🟡🟠🔴)
- **Script sugerido:** Saudação, talking points, ofertas e cautelas
- **Cross-sell:** Sugestões baseadas em Market Basket Analysis
- **Sazonalidade:** Se o cliente compra em datas específicas

**Arquivo:** `src/lib/services/sales-assistant.ts` (475 linhas)  
**Componente:** `src/components/intelligence/SalesAssistantPanel.tsx` (233 linhas)

#### 3.2.4 Customer Health Engine

Motor de **análise comportamental individual** que calcula:

- Score de saúde (0-100)
- Classificação: VIP → Ativo → Oportunidade → Risco → Perdido
- Frequência de compra por mês
- Tendências (crescendo, estável, diminuindo)
- Produtos e categorias preferidas (top 3)
- Recomendações acionáveis contextualizadas

**Arquivo:** `src/lib/services/customer-health.ts` (631 linhas)

#### 3.2.5 Anne GPT (Chat IA Conversacional)

Integração direta com **OpenAI GPT-4o/GPT-4o-mini** para:

- **Chat contextualizado:** Anne recebe dados do cliente (RFM, pedidos, produtos) e responde com base no contexto real
- **Detecção de intenção:** Classifica mensagens em 7 categorias (`buscar_produto`, `consultar_pedido`, `consultar_estoque`, `falar_com_humano`, `saudação`, `agradecimento`, `desconhecido`)
- **Resumo de conversas:** Comprime conversas longas em 3 frases

**Suporte multi-provedor:** OpenAI, Anthropic, Google (Gemini), Groq, DeepSeek, Custom (via `base_url`)

**Arquivo:** `src/lib/services/anne.service.ts` (200 linhas)

### 3.3 Módulo: Inteligência de Produto

#### Product Intelligence Engine

Motor de **Market Basket Analysis** que analisa:

- **Tendências de venda:** Produtos growing/stable/declining por período
- **Afinidade entre produtos:** Lift, confidence, co-purchase count
- **Preferências de grade:** Sensibilidade a preço por cliente
- **Velocity Score:** Velocidade de saída de cada produto

**Arquivo:** `src/lib/services/product-intelligence.ts` (819 linhas)

#### Seasonal Analyzer

Motor de **análise sazonal** com calendário comercial brasileiro completo:

- Carnaval, Dia da Mulher, Dia das Mães, Dia dos Namorados
- Dia dos Pais, Black Friday, Natal, e mais
- Identifica clientes sazonais e projeta receita por evento
- Warmup alerts (avisos antecipados para preparação)

**Arquivo:** `src/lib/services/seasonal-analyzer.ts` (709 linhas)

### 3.4 Módulo: Integração FacilZap (E-commerce)

Integração bidirecional completa com a plataforma FacilZap:

| Feature | Implementação |
|---------|--------------|
| **Sync de Produtos** | Importação completa com normalização de preços/estoque |
| **Sync de Clientes** | Cruzamento por phone_normalized para resolução de identidade |
| **Sync de Pedidos** | Paginação infinita com retry exponencial (3x backoff) |
| **Resilient Sync** | Checkpoints a cada N páginas, retomada após falha |
| **Checksum** | Cobertura FacilZap vs banco para detecção de divergências |
| **Orphan Linker** | Re-vinculação multi-camada (phone → facilzap_id → email → nome) |
| **Cron Full Sync** | Sync diário às 3h com auditoria completa |
| **Auto Sync** | Sync incremental periódico por tenant |
| **Audit Trail** | `sync_executions`, `sync_divergences`, `sync_audit_log` |

**Arquivos principais:**
- `src/lib/services/facilzap.service.ts` (579 linhas)
- `src/lib/services/resilient-sync.ts` (628 linhas)
- `src/lib/services/sync-auditor.ts` (280 linhas)
- `src/lib/services/orphan-linker.ts` (241 linhas)
- `src/lib/facilzap/mapper.ts` (normalização e upsert)
- `src/lib/facilzap/checksum.ts` (verificação de integridade)
- `src/lib/facilzap/sync-logger.ts` (logging estruturado)

### 3.5 Módulo: Contact Center

Central de atendimento multi-agente com gestão de filas:

| Feature | Detalhes |
|---------|---------|
| **Departamentos** | Vendas, Suporte, Financeiro — customizáveis por tenant |
| **Filas por departamento** | Prioridade, modo de distribuição, limite de capacity |
| **Distribuição automática** | Round-robin ou por carga do agente |
| **Transferência entre agentes** | Com motivo documentado |
| **Status do agente** | Online/offline, chats ativos, máximo configurável |
| **Quick Actions** | Ações rápidas com shortcuts configuráveis |

**Arquivo:** `src/lib/services/contact-center.service.ts` (396 linhas)

### 3.6 Módulo: Campanhas (Marketing Automation)

| Feature | Status |
|---------|--------|
| **Tipos** | Broadcast, Sequence, Drip |
| **Builder visual** | Blocos: texto, imagem, vídeo, áudio, delay, condição |
| **Segmentação** | Filtros por status, tags, LTV, última compra, segmento RFM |
| **Métricas** | Enviadas, entregues, lidas, falhas — por campanha |
| **Agendamento** | Data/hora futura com timezone |

**Componente:** `src/components/campaigns/MessageSequenceBuilder.tsx`

### 3.7 Módulo: Dashboard Executivo

KPIs em tempo real disponíveis na home:

- Total de clientes / Chats ativos / Campanhas rodando
- Mensagens hoje / Receita total / Ticket médio
- Novos clientes no mês / Tempo médio de resposta
- Pedidos totais / Pedidos pagos / Pedidos entregues
- Total de produtos / Peças vendidas / Receita confirmada

### 3.8 Módulo: Behavioral Learning

Sistema de **Machine Learning passivo** que registra eventos comportamentais:

- **30 tipos de eventos** rastreados (purchase, communication, engagement, support, lifecycle, campaign, product, churn_signal)
- **Análise de sentimento** por keywords (positivo/negativo/neutro)
- **Predictions Log** com validação posterior (was_correct)
- **ML Feedback** para auto-otimização

**Arquivo:** `src/lib/services/learning-logger.ts` (555 linhas)

---

## 4. MULTI-TENANCY & ESCALABILIDADE

### 4.1 Arquitetura Multi-Tenant

O VEXX 2.0 é **nativamente multi-tenant**. Cada organização (loja) é completamente isolada:

```
┌─────────────────────────────────────────────────────────┐
│                    TENANT A (Loja Maria)                 │
│                                                         │
│  ● Clientes próprios      ● Instância WhatsApp própria │
│  ● Pedidos próprios       ● API keys próprias          │
│  ● Conversas próprias     ● Config própria (Anne, etc) │
│  ● Campanhas próprias     ● Filas/departamentos        │
│  ● Produtos próprios      ● Cupons da Sentinela        │
└─────────────────────────────────────────────────────────┘
             │ 100% isolado de │
┌─────────────────────────────────────────────────────────┐
│                    TENANT B (Loja João)                  │
│                                                         │
│  ● Sua própria base       ● Sua própria instância      │
│  ● Seus próprios dados    ● Suas próprias configs      │
└─────────────────────────────────────────────────────────┘
```

**Mecanismos de isolamento:**

1. **Banco de dados:** Toda tabela tem coluna `tenant_id` NOT NULL
2. **RLS (Row Level Security):** PostgreSQL policies bloqueiam acesso entre tenants
3. **Middleware Next.js:** Injeta `x-tenant-id` após validação JWT
4. **Service Client:** Usa `SUPABASE_SERVICE_KEY` (bypassa RLS) apenas em operações servidor
5. **Event Bus:** Eventos SSE isolados por chave `${event}:${tenantId}`
6. **Evolution API:** Instância por tenant: `vexx-{tenantId.slice(0,12)}`

### 4.2 Modelo de Planos

Definido no schema SQL e nos tipos TypeScript:

| Plano | Max Usuários | Max Contatos | Max Campanhas/mês |
|-------|-------------|--------------|-------------------|
| **Free** | 1 | 500 | 5 |
| **Starter** | 3 | 2.000 | 15 |
| **Pro** | 10 | 10.000 | Ilimitadas |
| **Enterprise** | Ilimitado | Ilimitado | Ilimitadas |

### 4.3 RBAC (Role-Based Access Control)

4 níveis de permissão:

| Role | Acesso |
|------|--------|
| **Owner** | Tudo — configurações, billing, integrações |
| **Admin** | Tudo exceto billing e exclusão do tenant |
| **Agent** | Chat, clientes, pedidos, campanhas |
| **Viewer** | Somente leitura em todos os módulos |

### 4.4 Capacidade de Escala

| Dimensão | Capacidade | Como |
|----------|-----------|------|
| **Mensagens** | 24.000+ sincronizadas | Bulk sync com paginação + dedup |
| **Chats simultâneos** | Ilimitado (cursor pagination) | Infinite scroll, 25/page |
| **Listas de clientes** | 10.000+ | react-window (virtualização) |
| **Instâncias WhatsApp** | Multi-instância por painel | Evolution API multi-tenant |
| **Webhooks** | Processamento assíncrono | Event Bus + background sync |
| **Sync de pedidos** | Paginação infinita | Resilient Sync com checkpoints |
| **IA** | Rate limited por tenant | Sliding window (30 req/min) |

---

## 5. INTEGRAÇÕES & APIs

### 5.1 Mapa de Integrações

```
┌──────────────────────────────────────────────────────────────────┐
│                      VEXX 2.0 — HUB DE INTEGRAÇÕES              │
│                                                                  │
│   ENTRADA                    CORE                    SAÍDA       │
│                                                                  │
│   ┌───────────┐         ┌─────────────┐        ┌────────────┐  │
│   │ Evolution │────────▶│             │───────▶│ Supabase   │  │
│   │ API       │ Webhook │             │ INSERT │ PostgreSQL │  │
│   │ WhatsApp  │         │             │        │ + Storage  │  │
│   └───────────┘         │  NEXT.JS    │        └────────────┘  │
│                         │  API LAYER  │                         │
│   ┌───────────┐         │             │        ┌────────────┐  │
│   │ FacilZap  │────────▶│  24 Routes  │───────▶│ SSE Events │  │
│   │ E-commerce│ REST    │  14 Services│ Push   │ Real-time  │  │
│   └───────────┘         │  Middleware │        └────────────┘  │
│                         │             │                         │
│   ┌───────────┐         │             │        ┌────────────┐  │
│   │ OpenAI    │◀───────▶│             │───────▶│ n8n        │  │
│   │ GPT-4o    │ API     │             │ Media  │ Workflows  │  │
│   └───────────┘         └─────────────┘        └────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 API Routes Completas (24 Módulos)

| Módulo | Rota | Método | Função |
|--------|------|--------|--------|
| **Auth** | `/api/auth/login` | POST | Login com Supabase Auth |
| | `/api/auth/session` | GET | Validar sessão |
| | `/api/auth/avatar` | POST/GET | Upload/busca de avatar |
| **Chats** | `/api/chats` | GET | Lista com cursor pagination |
| **Messages** | `/api/messages/[clientId]` | GET | Mensagens com tradução de schema |
| **Clients** | `/api/clients` | GET/POST | CRUD com filtros avançados |
| | `/api/clients/[id]` | GET/PUT/DELETE | Detalhe do cliente |
| | `/api/clients/[id]/health` | GET | Customer Health Score |
| | `/api/clients/[id]/notes` | GET/POST/DELETE | Notas do CRM |
| **Orders** | `/api/orders` | GET | Lista com joins |
| | `/api/orders/[id]` | GET | Detalhe com itens |
| | `/api/orders/[id]/tracking` | GET | Rastreamento |
| | `/api/orders/stats` | GET | KPIs de vendas |
| **Products** | `/api/products` | GET | Lista paginada |
| | `/api/products/[id]` | GET | Detalhe |
| **Campaigns** | `/api/campaigns` | GET/POST | CRUD de campanhas |
| **WhatsApp** | `/api/whatsapp/status` | GET | Status da conexão |
| | `/api/whatsapp/connect` | POST/DELETE | Conectar/desconectar |
| | `/api/whatsapp/send` | POST | Enviar mensagem |
| | `/api/whatsapp/sync` | POST | Sync histórico |
| | `/api/whatsapp/bulk-sync` | POST | Sync agressivo (24k msgs) |
| **Webhooks** | `/api/webhooks/evolution` | POST | Receptor WhatsApp |
| | `/api/webhooks/facilzap` | POST | Receptor e-commerce |
| **Intelligence** | `/api/intelligence/overview` | GET | Dashboard de IA |
| | `/api/intelligence/rfm` | GET/POST | Motor RFM |
| | `/api/intelligence/rfm/clients` | GET | Clientes por segmento |
| | `/api/intelligence/events` | GET/POST | Behavioral events |
| | `/api/intelligence/seasonal` | GET/POST | Análise sazonal |
| | `/api/intelligence/products` | GET/POST | Product intelligence |
| | `/api/intelligence/assistant` | GET/POST | Sales Assistant |
| **Anne** | `/api/anne/chat` | POST | Chat com GPT |
| | `/api/anne/analyze` | GET/POST | Sentinela batch scan |
| | `/api/anne/approve` | POST | Aprovar diagnóstico |
| | `/api/anne/feedback` | POST | Feedback loop |
| **Contact Center** | `/api/contact-center/queues` | GET | Filas ativas |
| | `/api/contact-center/pull` | POST | Puxar próximo chat |
| | `/api/contact-center/transfer` | POST | Transferir conversa |
| | `/api/contact-center/quick-actions` | GET/POST | Ações rápidas |
| | `/api/contact-center/send-product` | POST | Enviar produto no chat |
| | `/api/contact-center/stats` | GET | Métricas do CC |
| **Sentinela** | `/api/sentinela/scan` | POST | Scan de toda a base |
| **Dashboard** | `/api/dashboard` | GET | KPIs consolidados |
| **Tenant** | `/api/tenants/config` | GET/PUT | Configurações |
| **Cron** | `/api/cron/sync-orders` | GET/POST | Sync periódico |
| | `/api/cron/sync-full` | GET/POST | Full sync diário |
| **Import** | `/api/import/process` | POST | Import de planilhas |
| **Media** | `/api/media/redownload` | POST | Re-download de mídia |
| | `/api/upload` | POST | Upload genérico |
| **Admin** | `/api/admin/vps-health` | GET | Health check da VPS |
| **Maintenance** | `/api/maintenance/recalc-stats` | POST | Recalcular métricas |
| | `/api/maintenance/health-check` | GET | System health |
| **SSE** | `/api/sse` | GET | Stream de eventos real-time |

---

## 6. OPORTUNIDADE DE MERCADO

### 6.1 O Problema (TAM/SAM/SOM)

**O WhatsApp é o maior canal de vendas do Brasil — e o mais caótico.**

- **175 milhões** de brasileiros usam WhatsApp (2025)
- **80%** das PMEs brasileiras usam WhatsApp para vender (Sebrae, 2024)
- **R$ 300+ bilhões** em vendas influenciadas por WhatsApp no varejo BR
- **62%** dos lojistas perdem vendas por não responder a tempo (Pesquisa WhatsApp Business)

**Dor específica do segmento de moda/atacado:**

O lojista recebe 200-500 mensagens por dia. Ele precisa:
1. Identificar quem é o cliente (número novo? já comprou antes?)
2. Consultar histórico de pedidos (precisa alternar entre WhatsApp e e-commerce)
3. Verificar se tem o produto em estoque
4. Analisar comprovante de pagamento (precisa abrir foto e conferir manualmente)
5. Montar pedido no sistema de e-commerce
6. Responder o cliente (que já está impaciente)

**Tempo médio desse fluxo hoje: 8-15 minutos por atendimento.**  
**Com VEXX 2.0: 1-3 minutos** (tudo na mesma tela + IA assistindo).

### 6.2 Tamanho do Mercado

| Segmento | Tamanho | VEXX Target |
|----------|---------|-------------|
| **TAM** (Total Addressable) | R$ 15B — CRM para PMEs no Brasil | Todo o mercado |
| **SAM** (Serviceable) | R$ 2B — CRM+WhatsApp para varejo | Lojistas que vendem via WA |
| **SOM** (Obtainable - 2 anos) | R$ 20M — Moda/FacilZap | 2.000 lojas × R$800/mês |

### 6.3 Modelo de Receita Proposto

| Plano | Preço/mês | Inclui |
|-------|-----------|--------|
| **Starter** | R$ 197 | 1 usuário, 500 contatos, chat + pedidos |
| **Pro** | R$ 497 | 5 usuários, 5k contatos, IA + campanhas |
| **Enterprise** | R$ 997+ | Ilimitado, Contact Center, API aberta |

**Upsells:**
- Instâncias WhatsApp adicionais: R$ 97/mês cada
- Sentinela Anne (IA avançada): R$ 197/mês
- Setup e onboarding: R$ 997 (one-time)

### 6.4 Vantagens Competitivas Defensáveis

| Vantagem | Por que é difícil de copiar |
|----------|---------------------------|
| **Identidade automática de cliente** | Cruzamento FacilZap × WhatsApp com PhoneNormalizer proprietário |
| **11 segmentos RFM com predição** | Motor próprio com 581 linhas de lógica de scoring |
| **Sentinela Anne (8 análises autônomas)** | 600 linhas de regras comportamentais + feedback loop |
| **Resilient Sync** | 628 linhas com checkpoint, retry, auto-repair, auditoria |
| **Market Basket Analysis** | 819 linhas de inteligência de produto nativa |
| **Seasonal Analyzer** | Calendário comercial BR com projeção de receita |
| **Multi-tenant nativo** | RLS + isolamento total — não é bolt-on |

### 6.5 Dor → Feature → Resultado (Pitch de Vendas)

| Dor do Lojista | Feature VEXX | Resultado |
|----------------|-------------|-----------|
| "Não sei quem me manda mensagem" | Identidade automática + CRM Sidebar | Nome, pedidos e LTV aparecem automaticamente |
| "Perco vendas por demora" | Filas + distribuição automática | Nenhum cliente fica sem resposta |
| "Não sei quem vai parar de comprar" | Sentinela Anne (churn risk) | Alerta + cupom automático antes do cliente sumir |
| "Não consigo escalar vendedores" | Contact Center + RBAC | 10 vendedores no mesmo WhatsApp com controle |
| "Preciso alternar 5 apps" | Central unificada | Chat + pedidos + catálogo + IA na mesma tela |
| "Não sei o que mais vendeu" | Product Intelligence | Top sellers, tendências, afinidades entre produtos |
| "Meu time não segue padrão" | Quick Replies + Assinatura | Mensagens padronizadas com nome do atendente |
| "Dia das Mães passa e eu não me preparo" | Seasonal Analyzer | Alerta 30 dias antes com lista de clientes target |

---

## 7. ROADMAP TÉCNICO (PRÓXIMOS PASSOS)

### 7.1 Curto Prazo (Q1 2026)

- [ ] Migrar sync de massa para worker de background (Edge Functions ou n8n)
- [ ] Implementar UNIQUE constraint em `messages.external_id`
- [ ] Adicionar Redis para rate limiting distribuído
- [ ] Implementar search full-text com `pg_trgm`
- [ ] Completar fluxo de campanhas (envio em massa com throttling)

### 7.2 Médio Prazo (Q2 2026)

- [ ] App mobile (React Native ou PWA)
- [ ] Webhook reverse para integrações externas (Zapier, Make)
- [ ] Catálogo compartilhável via link (mini e-commerce)
- [ ] Dashboard público para o lojista mostrar aos investidores
- [ ] Multi-idioma (EN, ES)

### 7.3 Longo Prazo (Q3-Q4 2026)

- [ ] Marketplace de templates e integrações
- [ ] Módulo financeiro (conciliação de pagamentos)
- [ ] Integração com Shopify, WooCommerce, Nuvemshop
- [ ] IA generativa para criação automática de campanhas
- [ ] Módulo de relatórios avançados com exportação PDF

---

## 8. MÉTRICAS DO REPOSITÓRIO

| Métrica | Valor |
|---------|-------|
| **Linhas de TypeScript (src/)** | 15.000+ |
| **Arquivos de código** | 100+ |
| **API Routes** | 24 módulos / 40+ endpoints |
| **Hooks React** | 14 especializados |
| **Services de negócio** | 14 engines |
| **Migrações SQL** | 9 arquivos |
| **Scripts utilitários** | 30+ |
| **Tipos/Interfaces** | 708 linhas de contratos |
| **Componentes React** | 35+ |
| **Stores Zustand** | 4 (auth, chats, connection, ui) |

---

## 9. CONCLUSÃO

O VEXX 2.0 não é um chatbot. Não é um CRM genérico. Não é um painel de WhatsApp.

É uma **plataforma de inteligência comercial** que transforma dados brutos de conversas e pedidos em **ações de venda automatizadas**.

O lojista brasileiro que vende via WhatsApp hoje opera no escuro — sem saber quem é VIP, quem vai abandonar, o que vende junto, ou quando é hora de fazer campanha. O VEXX ilumina tudo isso com dados reais e IA acionável.

**A tecnologia está construída. O produto está funcional. A oportunidade é agora.**

---

*Documento gerado a partir de auditoria completa do repositório `Cjota221/vexxcrm`, branch `main`.*  
*Todas as funcionalidades e métricas são baseadas em código real implementado, não projeções.*
