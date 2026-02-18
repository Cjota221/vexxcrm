# VEXX 2.0 — Stack de Tecnologias

**Projeto:** VEXX CRM 2.0 — SaaS Multi-Tenant de Gestão de Vendas via WhatsApp  
**Versão:** 2.0.0  
**Última atualização:** Fevereiro 2026  

---

## 📋 Sumário

1. [Visão Geral da Stack](#1-visão-geral-da-stack)
2. [Frontend](#2-frontend)
3. [Backend (API Layer)](#3-backend-api-layer)
4. [Banco de Dados](#4-banco-de-dados)
5. [Infraestrutura & Deploy](#5-infraestrutura--deploy)
6. [Integrações Externas](#6-integrações-externas)
7. [Inteligência Artificial](#7-inteligência-artificial)
8. [Ferramentas de Desenvolvimento](#8-ferramentas-de-desenvolvimento)
9. [Arquitetura Completa (Diagrama)](#9-arquitetura-completa-diagrama)

---

## 1. Visão Geral da Stack

O VEXX 2.0 utiliza uma stack moderna **full-stack TypeScript**, onde frontend e backend compartilham a mesma linguagem, os mesmos tipos e o mesmo repositório (monorepo). A escolha de cada tecnologia foi direcionada por três critérios: **performance**, **produtividade do desenvolvedor** e **custo de operação**.

| Camada | Tecnologia Principal | Papel |
|--------|---------------------|-------|
| Frontend | React 19 + Next.js 16 | Interface do usuário e navegação |
| Estilização | Tailwind CSS 4 | Design system e temas |
| Estado Global | Zustand 5 | Gerenciamento de estado reativo |
| Fetching & Cache | TanStack React Query 5 | Requisições, cache e infinite scroll |
| Backend/API | Next.js API Routes | REST APIs server-side |
| Banco de Dados | Supabase (PostgreSQL) | Dados, autenticação, storage e RLS |
| WhatsApp | Evolution API v2 | Mensageria multi-instância |
| E-commerce | FacilZap API | Sincronização de produtos/pedidos |
| IA | OpenAI GPT-4o | Agente inteligente conversacional |
| Automação | n8n | Workflows de processamento de mídia |
| Deploy | Netlify + VPS Hostinger | Serverless + Docker containers |

---

## 2. Frontend

### 2.1 React 19.2.4

> **O que é:** Biblioteca JavaScript para construção de interfaces de usuário declarativas.

**Por que usamos:**
- Componentização — cada parte da interface é um componente reutilizável
- React 19 traz Server Components, melhor performance em renderização e `use()` hook nativo
- Ecossistema gigantesco com suporte de longo prazo

**Onde usamos no VEXX:**
- Todos os 35+ componentes da interface (chat, CRM sidebar, dashboard, painéis de inteligência)
- 14 hooks customizados (`useChats`, `useClients`, `useAuth`, `useIntelligence`, etc.)
- Composição de layouts com `layout.tsx` e `page.tsx` (App Router)

**Arquivo de referência:** `src/app/providers.tsx` — Provider raiz que inicializa autenticação e cache

---

### 2.2 Next.js 16.1.6 (App Router)

> **O que é:** Framework React de produção que fornece roteamento, renderização server-side (SSR), API Routes e otimizações automáticas.

**Por que usamos:**
- **App Router** — sistema de rotas baseado em pastas com layouts aninhados
- **API Routes** — permite criar backend REST na mesma aplicação, sem servidor separado
- **Middleware** — intercepta requisições para validar autenticação e injetar `tenant_id`
- **Server Components** — componentes que rodam no servidor, reduzindo JavaScript enviado ao cliente
- **Turbopack** — bundler em Rust integrado, 10x mais rápido que o Webpack para desenvolvimento

**Onde usamos no VEXX:**
- 24 módulos de API em `src/app/api/` (auth, chats, clients, orders, intelligence, whatsapp, etc.)
- Middleware de autenticação em `src/middleware.ts`
- Roteamento de páginas em `src/app/(dashboard)/` e `src/app/(auth)/`
- Configuração de imagens remotas (Supabase Storage e FacilZap) em `next.config.js`

**Arquivo de referência:** `next.config.js`, `src/middleware.ts`

---

### 2.3 TypeScript 5.9.3

> **O que é:** Superset do JavaScript que adiciona tipagem estática — permite definir tipos de variáveis, parâmetros e retornos de funções, prevenindo erros antes da execução.

**Por que usamos:**
- **Segurança em tempo de compilação** — erros são detectados pelo editor antes de rodar o código
- **Autocomplete inteligente** — o VS Code sugere propriedades e métodos com base nos tipos
- **Documentação viva** — os tipos servem como documentação do formato dos dados
- **Refatoração segura** — renomear ou mover código sem quebrar dependências

**Onde usamos no VEXX:**
- **100% do código fonte** é TypeScript (`.ts` e `.tsx`)
- 708 linhas de definição de tipos em `src/types/index.ts` (Tenant, Client, Message, Order, RFM, etc.)
- Interfaces de configuração em todos os services (`EvolutionAPIConfig`, `FacilZapConfig`, `AnneConfig`)
- Strict mode habilitado no `tsconfig.json`

**Arquivo de referência:** `src/types/index.ts`, `tsconfig.json`

---

### 2.4 Tailwind CSS 4.1.18

> **O que é:** Framework CSS utilitário que permite estilizar diretamente no HTML/JSX com classes pré-definidas, sem criar arquivos CSS separados.

**Por que usamos:**
- **Produtividade** — não precisa criar nomes de classes nem alternar entre arquivos CSS
- **Design system nativo** — cores, espaçamentos, sombras e animações definidos em um único arquivo de configuração
- **Tamanho mínimo em produção** — só inclui as classes que realmente são usadas (tree-shaking automático)
- **Tailwind v4** — novo sistema de temas via `@theme` diretamente no CSS, sem necessidade de `tailwind.config.ts` para extensões básicas

**Design system do VEXX (2 temas):**

**Tema CRM (modo claro):**
| Token | Cor | Uso |
|-------|-----|-----|
| `crm-primary` | `#1e3a5f` (Azul Royal) | Botões, links, badges |
| `crm-secondary` | `#2563eb` (Azul) | CTAs secundários |
| `crm-success` | `#059669` (Verde) | Status positivo, confirmações |
| `crm-warning` | `#d97706` (Âmbar) | Alertas, atenção |
| `crm-danger` | `#dc2626` (Vermelho) | Erros, exclusão |
| `surface-bg` | `#f7f8fa` | Background geral |
| `surface-card` | `#ffffff` | Cards e painéis |

**Tema WhatsApp Dark (chat):**
| Token | Cor | Uso |
|-------|-----|-----|
| `wa-bg` | `#111b21` | Background principal |
| `wa-bg-panel` | `#202c33` | Painéis laterais |
| `wa-bubble-in` | `#202c33` | Bolha de mensagem recebida |
| `wa-bubble-out` | `#005c4b` | Bolha de mensagem enviada |
| `wa-accent-green` | `#00a884` | Ícones ativos, badges |
| `wa-text-primary` | `#e9edef` | Texto principal |

**Tipografia:** Inter (corpo) + Poppins (títulos)  
**Border-radius:** Cards 16px, botões/inputs 12px, bolhas 12px, modais 20px  
**Sombras:** 5 níveis (card, card-hover, modal, dropdown, btn-hover)  
**Animações:** fade-in, slide-up, slide-in-right, pulse-dot, spin-slow

**Arquivos de referência:** `tailwind.config.ts`, `src/app/globals.css`

---

### 2.5 Zustand 5.0.11

> **O que é:** Biblioteca minimalista de gerenciamento de estado global para React — substitui Redux com 10x menos código.

**Por que usamos:**
- API simples — uma store se cria em 10 linhas de código
- Sem boilerplate — não precisa de actions, reducers, dispatchers, providers
- Performance — atualizações cirúrgicas, só re-renderiza componentes que usam o estado que mudou
- Compatível com React 19 e Server Components

**4 stores do VEXX:**

| Store | Arquivo | O que gerencia |
|-------|---------|---------------|
| `useAuthStore` | `src/store/auth.ts` | Sessão do usuário, tenant, role, loading |
| `useChatStore` | `src/store/chats.ts` | Chat selecionado, lista de chats, filtros |
| `useConnectionStore` | `src/store/connection.ts` | Status do WhatsApp (conectado/desconectado/QR code) |
| `useUIStore` | `src/store/ui.ts` | Sidebar aberta/fechada, modais, notificações |

---

### 2.6 TanStack React Query 5.90.21

> **O que é:** Biblioteca de data fetching que gerencia requisições HTTP, cache, revalidação, paginação infinita e estados de loading/erro automaticamente.

**Por que usamos:**
- **Cache inteligente** — dados buscados ficam em cache e são revalidados automaticamente
- **Infinite scroll** — `useInfiniteQuery` para listas de chats e mensagens com paginação cursor-based
- **Mutations** — `useMutation` para enviar mensagens, criar clientes, atualizar pedidos
- **Loading/error states** — estados de carregamento gerenciados automaticamente
- **Stale-while-revalidate** — mostra dados antigos instantaneamente enquanto busca novos

**14 hooks customizados construídos sobre React Query:**

| Hook | Função |
|------|--------|
| `useChats` | Lista de conversas com infinite scroll e filtros |
| `useClients` | CRUD de clientes com busca e paginação |
| `useOrders` | Pedidos com joins e filtros |
| `useProducts` | Catálogo de produtos |
| `useCampaigns` | Campanhas de marketing |
| `useIntelligence` | Dashboard de IA (RFM, Seasonal, Products) |
| `useAnne` | Chat com IA e Sentinela |
| `useContactCenter` | Filas, distribuição, transferências |
| `useAuth` | Autenticação e sessão |
| `useWhatsApp` | Status de conexão e envio de mensagens |
| `useAutoSync` | Sincronização automática periódica |
| `useRealtimeMessages` | Mensagens em tempo real via SSE |
| `useTenantConfig` | Configurações do tenant |
| `useKeyboardShortcuts` | Atalhos de teclado globais |

**Arquivo de referência:** `src/hooks/useChats.ts`, `src/app/providers.tsx`

---

### 2.7 react-window 2.2.6

> **O que é:** Biblioteca de virtualização de listas — renderiza apenas os itens visíveis na tela, mesmo que a lista tenha 10.000+ itens.

**Por que usamos:**
- Listas de clientes podem ter 10.000+ registros
- Sem virtualização, renderizar 10k DOM nodes trava o browser
- Com `react-window`, apenas ~20 itens ficam no DOM independente do tamanho total

**Onde usamos:** Lista de chats, lista de clientes, lista de pedidos

---

### 2.8 Lucide React 0.563.0

> **O que é:** Biblioteca de ícones SVG leves e consistentes — fork mantido do Feather Icons com 1.500+ ícones.

**Por que usamos:**
- Ícones SVG (não font icons) — melhor performance e acessibilidade
- Estilo outline/thin consistente com o design do VEXX
- Tree-shakeable — só importa os ícones que usa, sem carregar a biblioteca inteira

**Onde usamos:** Sidebar, botões, badges de status, indicadores, ações

---

### 2.9 clsx 2.1.1

> **O que é:** Utilitário para construir strings de classes CSS condicionais.

**Por que usamos:**
- Combinar classes Tailwind condicionalmente (ex: `clsx('btn', isActive && 'btn-active')`)
- Código mais limpo que concatenação de strings manual

---

### 2.10 SheetJS (xlsx) 0.18.5

> **O que é:** Biblioteca para ler e gerar planilhas Excel (.xlsx, .xls, .csv) no JavaScript.

**Por que usamos:**
- Importação de base de clientes via planilha Excel
- Exportação de relatórios e dados para download

**Onde usamos:** `src/app/api/import/process/route.ts`

---

## 3. Backend (API Layer)

### 3.1 Next.js API Routes (Server-Side)

O backend do VEXX roda **dentro do Next.js** via API Routes. Cada arquivo em `src/app/api/` é automaticamente um endpoint REST.

**24 módulos de API implementados:**

| Módulo | Endpoints | Função |
|--------|-----------|--------|
| `auth/` | login, session, avatar | Autenticação Supabase |
| `chats/` | lista com cursor pagination | Conversas do WhatsApp |
| `messages/` | `[clientId]` com paginação | Histórico de mensagens |
| `clients/` | CRUD, health, notes | Gestão de contatos |
| `orders/` | CRUD, tracking, stats | Pedidos e-commerce |
| `products/` | CRUD | Catálogo de produtos |
| `campaigns/` | CRUD | Campanhas de marketing |
| `whatsapp/` | status, connect, send, sync, bulk-sync | Integração WhatsApp |
| `webhooks/` | evolution, facilzap | Receptores de eventos |
| `intelligence/` | overview, rfm, seasonal, products, assistant, events | Motores de IA |
| `anne/` | chat, analyze, approve, feedback | Agente IA |
| `contact-center/` | queues, pull, transfer, quick-actions, send-product, stats | Central de atendimento |
| `sentinela/` | scan | Análise autônoma da base |
| `dashboard/` | KPIs consolidados | Métricas executivas |
| `tenants/` | config (GET/PUT) | Configurações do tenant |
| `cron/` | sync-orders, sync-full | Jobs agendados |
| `import/` | process | Importação de planilhas |
| `media/` | redownload | Re-download de mídia expirada |
| `upload/` | upload genérico | Upload de arquivos |
| `admin/` | vps-health | Health check da VPS |
| `maintenance/` | recalc-stats, health-check | Manutenção do sistema |
| `sse/` | stream GET | Eventos em tempo real |
| `facilzap/` | sync, auto-sync, relink, clear | Sincronização e-commerce |

### 3.2 Middleware de Autenticação

O Next.js Middleware (`src/middleware.ts`) intercepta **todas** as requisições à API e:

1. Verifica se existe token JWT no header `Authorization`
2. Valida o token com Supabase Auth (`getUser()`)
3. Busca o `tenant_id` do perfil do usuário
4. Injeta o header `x-tenant-id` na requisição
5. Se inválido → retorna `401 Unauthorized`

**Rotas isentas:** `/api/auth/*`, `/api/webhooks/*`, `/api/sse`

### 3.3 14 Services de Negócio

Os services encapsulam toda a lógica de negócio, separados das API Routes:

| Service | Linhas | Função |
|---------|--------|--------|
| `evolution.service.ts` | 664 | Orquestrador WhatsApp multi-tenant |
| `facilzap.service.ts` | 579 | Integração e-commerce com retry |
| `resilient-sync.ts` | 628 | Sync com checkpoints e recuperação |
| `rfm-engine.ts` | 581 | Motor de segmentação RFM (11 segmentos) |
| `anne-intelligence.ts` | 600 | Sentinela Anne — 8 análises autônomas |
| `product-intelligence.ts` | 819 | Market basket analysis e tendências |
| `seasonal-analyzer.ts` | 709 | Análise sazonal com calendário BR |
| `customer-health.ts` | 631 | Health score 0-100 por cliente |
| `sales-assistant.ts` | 475 | Copiloto do vendedor com scripts |
| `learning-logger.ts` | 555 | 30 tipos de eventos comportamentais |
| `contact-center.service.ts` | 396 | Filas, distribuição, transferências |
| `sync-auditor.ts` | 280 | Auditoria de integridade de dados |
| `orphan-linker.ts` | 241 | Re-vinculação de pedidos órfãos |
| `anne.service.ts` | 200 | Chat com GPT-4o/mini |

### 3.4 Event Bus (SSE — Server-Sent Events)

> **O que é:** Mecanismo de comunicação real-time server→client, onde o servidor "empurra" eventos para o browser sem que o client precise fazer polling.

**Implementação:** `src/lib/event-bus.ts`

O VEXX usa um `EventEmitter` com namespace por `tenant_id`, garantindo que eventos de um tenant nunca sejam recebidos por outro:

```
Chave do evento: "${nomeEvento}:${tenantId}"
Exemplo: "new_message:abc123-def456"
```

**Eventos emitidos:** `new_message`, `message_status`, `chat_updated`, `connection_status`

### 3.5 Rate Limiter

> **O que é:** Mecanismo que limita o número de requisições por período, evitando abuso e protegendo APIs externas (OpenAI, Evolution).

**Implementação:** `src/lib/rate-limiter.ts` — Sliding window in-memory

- Limite por chave (IP, tenant, endpoint)
- Janela deslizante configurável (ex: 30 req/60s)
- Limpeza automática de entries expiradas a cada 60s
- Retorna `429 Too Many Requests` quando excedido

---

## 4. Banco de Dados

### 4.1 Supabase (PostgreSQL)

> **O que é:** Plataforma BaaS (Backend as a Service) open-source construída sobre PostgreSQL. Fornece banco de dados relacional, autenticação, storage de arquivos e Row Level Security — tudo gerenciado.

**Versão do client:** `@supabase/supabase-js` 2.95.3

**Por que usamos:**
- **PostgreSQL managed** — não precisamos gerenciar servidor de banco de dados
- **Auth integrado** — login com email/senha, JWT, refresh tokens
- **Row Level Security (RLS)** — policies de segurança no nível do banco que isolam dados entre tenants
- **Storage** — bucket `media` para armazenamento permanente de mídias do WhatsApp
- **Backups automáticos** — point-in-time recovery sem configuração
- **Duas chaves de acesso:**
  - `anon key` — usada no frontend (segura com RLS)
  - `service key` — usada APENAS no backend (bypassa RLS para operações administrativas)

### 4.2 Extensões PostgreSQL

| Extensão | Função |
|----------|--------|
| `uuid-ossp` | Geração de UUIDs v4 para chaves primárias |
| `pg_trgm` | Busca fuzzy/trigram para pesquisa de clientes por nome |

### 4.3 Esquema do Banco (10+ Tabelas)

**Tabelas principais (Migration 001):**

| Tabela | Colunas-chave | Função |
|--------|--------------|--------|
| `tenants` | id, name, slug, plan, api_keys, limits | Organizações (lojas) |
| `profiles` | id, tenant_id, role, email | Usuários com RBAC |
| `clients` | tenant_id, phone_normalized, ltv, tags | Contatos/clientes |
| `conversations` | tenant_id, client_id, status, assigned_to | Chats com atribuição |
| `messages` | tenant_id, conversation_id, type, direction | Mensagens multi-tipo |
| `products` | tenant_id, name, price, stock | Catálogo de produtos |
| `orders` | tenant_id, client_id, status, total | Pedidos e-commerce |
| `order_items` | order_id, product_id, quantity, price | Itens do pedido |
| `campaigns` | tenant_id, type, status, metrics | Campanhas de marketing |
| `coupons` | tenant_id, code, discount, usage | Cupons de desconto |
| `quick_replies` | tenant_id, title, message | Templates rápidos |
| `client_notes` | client_id, author_id, content | Notas CRM |
| `tenant_config` | tenant_id, key, value | Configurações por tenant |

**Tabelas de inteligência (Migrations 005-008):**

| Tabela | Função |
|--------|--------|
| `behavioral_events` | 30 tipos de eventos de ML |
| `rfm_history` | Histórico de scores RFM |
| `predictions_log` | Predições com validação posterior |
| `seasonal_events` | Calendário sazonal |
| `client_seasonal_profiles` | Perfil sazonal por cliente |
| `departments` | Departamentos do Contact Center |
| `queues` | Filas de atendimento |
| `agent_queues` | Associação agente↔fila |
| `sentinela_analyses` | Diagnósticos da Sentinela Anne |
| `sentinela_coupons` | Cupons gerados pela IA |
| `sync_executions` | Log de sincronizações |
| `sync_checkpoints` | Pontos de retomada |
| `sync_divergences` | Divergências detectadas |
| `orphaned_orders` | Pedidos sem cliente vinculado |
| `sync_audit_log` | Auditoria forense |

### 4.4 Row Level Security (RLS)

Todas as tabelas possuem policies RLS que garantem isolamento total entre tenants:

```sql
-- Exemplo: policy na tabela clients
CREATE POLICY "tenant_isolation" ON clients
  USING (tenant_id = get_tenant_id());
```

A função `get_tenant_id()` extrai o `tenant_id` do JWT do usuário autenticado. Mesmo que um bug no código tente buscar dados de outro tenant, o PostgreSQL **bloqueia no nível do banco**.

### 4.5 Supabase Storage

- **Bucket:** `media`
- **Função:** Armazenar mídias do WhatsApp permanentemente (URLs nativas do WhatsApp expiram após algumas horas)
- **Tipos suportados:** Imagens, vídeos, áudios, documentos, stickers
- **Acesso:** URLs públicas assinadas com expiração configurável

### 4.6 pg (node-postgres) 8.18.0

> Driver PostgreSQL nativo para Node.js — usado para operações diretas ao banco quando o client Supabase não é adequado (batch inserts, queries complexas).

---

## 5. Infraestrutura & Deploy

### 5.1 Netlify

> **O que é:** Plataforma de deploy serverless com CDN global, CI/CD automático e SSL gratuito.

**O que roda no Netlify:**
- Frontend React (SSR/SSG)
- Todas as 24 API Routes (como Serverless Functions)
- Middleware de autenticação

**Configuração:**
- Node.js 20
- Build command: `npm run build`
- Plugin: `@netlify/plugin-nextjs`
- Headers de segurança: X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- URL: `vexxcrm.netlify.app`

**Arquivo de referência:** `netlify.toml`

### 5.2 VPS Hostinger + Easypanel

> **O que é:** Servidor virtual privado com Easypanel como painel de gerenciamento de containers Docker.

**O que roda na VPS:**

| Container | Tecnologia | Função |
|-----------|-----------|--------|
| **Evolution API** | Docker | Conexão WhatsApp (requer WebSocket persistente) |
| **n8n** | Docker | Automação de workflows (processamento de mídia) |
| **PostgreSQL (Evolution)** | Docker | Banco de dados da Evolution API |

**Por que VPS e não serverless?**
- A Evolution API precisa de conexão WebSocket **persistente** com o WhatsApp (incompatível com serverless)
- n8n precisa rodar workflows longos (transcrição de áudio, visão computacional)

### 5.3 PostCSS 8.5.6

> Pipeline de processamento CSS que compila as diretivas Tailwind. Configurado via `postcss.config.js` com o plugin `@tailwindcss/postcss`.

---

## 6. Integrações Externas

### 6.1 Evolution API v2 (WhatsApp)

> **O que é:** API open-source para conexão com WhatsApp via protocolo Baileys (não oficial). Permite enviar e receber mensagens, criar instâncias e gerenciar conexões.

**Modelo de uso no VEXX:**
- **Multi-instância:** Cada tenant tem sua própria instância: `vexx-{tenantId.slice(0,12)}`
- **API Key global:** Uma única chave gerencia todas as instâncias (protegida no servidor)
- **Webhook:** Eventos do WhatsApp são recebidos em `POST /api/webhooks/evolution`
- **Mídias:** Download para Supabase Storage + forward para n8n (se áudio/imagem)
- **Safe JSON:** Parser especial para lidar com respostas HTML/502 da Evolution

**Funcionalidades usadas:**
- `createInstance()` — provisionar instância
- `connectInstance()` — gerar QR code
- `getInstanceStatus()` — verificar conexão
- `sendText()` / `sendMedia()` — enviar mensagens
- `fetchMessages()` — buscar histórico
- `fetchChats()` — listar conversas
- `downloadMediaToStorage()` — salvar mídia permanente

**Arquivo:** `src/lib/services/evolution.service.ts` (664 linhas)

### 6.2 FacilZap API (E-commerce)

> **O que é:** Plataforma de e-commerce brasileira especializada em moda e atacado. A API permite buscar produtos, clientes e pedidos.

**Modelo de uso no VEXX:**
- **Token por tenant:** Cada loja tem seu próprio `facilzap_token`
- **Retry com backoff exponencial:** 3 tentativas com delay crescente
- **Timeout:** 30 segundos por requisição
- **Sync resiliente:** Checkpoints a cada N páginas, retomada após falha
- **Checksum:** Verificação de integridade FacilZap vs banco local
- **Orphan Linker:** Re-vinculação multi-camada de pedidos sem cliente (phone → facilzap_id → email → nome)

**Funcionalidades usadas:**
- `fetchProducts()` — catálogo completo
- `fetchClients()` — base de clientes com cruzamento por telefone
- `fetchOrders()` — pedidos com paginação infinita

**Arquivos:**
- `src/lib/services/facilzap.service.ts` (579 linhas)
- `src/lib/services/resilient-sync.ts` (628 linhas)
- `src/lib/services/sync-auditor.ts` (280 linhas)
- `src/lib/services/orphan-linker.ts` (241 linhas)

### 6.3 n8n (Automação)

> **O que é:** Plataforma de automação de workflows open-source (alternativa ao Zapier). Permite criar fluxos visuais que conectam APIs.

**Workflow do VEXX:** `n8n/vexx-media-processing-workflow.json`

Fluxo: Webhook recebe mídia → identifica tipo (áudio/imagem) → processa:
- **Áudio:** Envia para OpenAI Whisper → transcrição → salva como texto
- **Imagem:** Envia para OpenAI Vision → descrição → classifica (comprovante, produto, etc.)

---

## 7. Inteligência Artificial

### 7.1 OpenAI GPT-4o / GPT-4o-mini

> **O que é:** Modelos de linguagem da OpenAI que entendem e geram texto, analisam imagens e transcrevem áudio.

**Onde usamos:**

| Uso | Modelo | Função |
|-----|--------|--------|
| Chat com Anne | GPT-4o-mini | Assistente conversacional com contexto do cliente |
| Detecção de intenção | GPT-4o-mini | Classifica mensagem em 7 categorias |
| Resumo de conversa | GPT-4o-mini | Comprime conversas longas em 3 frases |
| Transcrição de áudio | Whisper (via n8n) | Áudio do WhatsApp → texto |
| Visão computacional | GPT-4o Vision (via n8n) | Classificação de imagens (comprovante, produto) |

**Suporte multi-provedor:** O VEXX suporta trocar o provedor de IA sem alteração de código:
- OpenAI, Anthropic (Claude), Google (Gemini), Groq, DeepSeek, ou qualquer API compatível via `base_url` customizada

**Arquivo:** `src/lib/services/anne.service.ts` (200 linhas)

### 7.2 Motores de Inteligência Proprietários

Além da IA generativa (GPT), o VEXX possui **5 motores de análise rule-based** que não dependem de API externa:

| Motor | O que faz | Depende de API? |
|-------|----------|----------------|
| **RFM Engine** | Segmenta clientes em 11 categorias comportamentais | ❌ Cálculo local |
| **Customer Health** | Score de saúde 0-100 por cliente | ❌ Cálculo local |
| **Product Intelligence** | Market basket analysis + tendências | ❌ Cálculo local |
| **Seasonal Analyzer** | Análise por calendário comercial BR | ❌ Cálculo local |
| **Sentinela Anne** | 8 análises autônomas com ações automáticas | ❌ Regras locais |

**Vantagem:** Esses motores rodam 100% no servidor do VEXX, sem custo de API por execução.

---

## 8. Ferramentas de Desenvolvimento

### 8.1 Turbopack (Dev Server)

> Bundler em Rust integrado ao Next.js 16. Compila módulos sob demanda com HMR (Hot Module Replacement) até 10x mais rápido que o Webpack.

**Ativado via:** `next dev --turbopack`

### 8.2 ESLint 9.39.2 + eslint-config-next

> Linter estático que detecta erros comuns, imports não usados e padrões incorretos no código.

### 8.3 Git + GitHub

> Controle de versão e repositório remoto.
- **Repositório:** `Cjota221/vexxcrm`
- **Branch principal:** `main`

### 8.4 VS Code

> Editor principal de desenvolvimento, com extensões para TypeScript, Tailwind CSS IntelliSense, ESLint e GitHub Copilot.

---

## 9. Arquitetura Completa (Diagrama)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VEXX 2.0 — ARQUITETURA                         │
│                                                                         │
│  ┌─── BROWSER (Cliente) ─────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  React 19 ─── Zustand (4 stores) ─── React Query (14 hooks)      │ │
│  │      │                                      │                      │ │
│  │  Tailwind CSS 4          SSE (real-time) ◀──┘                     │ │
│  │  react-window (10k+ itens)                                        │ │
│  │  Lucide React (ícones)                                            │ │
│  │                                                                    │ │
│  └────────────────────────────┬───────────────────────────────────────┘ │
│                               │ HTTPS                                   │
│                               ▼                                         │
│  ┌─── NETLIFY (Serverless) ──────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  Next.js 16 (App Router)                                          │ │
│  │  ├── Middleware (JWT + tenant_id)                                  │ │
│  │  ├── 24 API Routes                                                │ │
│  │  ├── 14 Services de negócio                                       │ │
│  │  ├── Event Bus (SSE multi-tenant)                                 │ │
│  │  └── Rate Limiter (sliding window)                                │ │
│  │                                                                    │ │
│  └──────┬──────────────┬──────────────┬───────────────────────────────┘ │
│         │              │              │                                  │
│         ▼              ▼              ▼                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                          │
│  │  Supabase  │ │ Evolution  │ │  FacilZap  │                          │
│  │ PostgreSQL │ │   API v2   │ │    API     │                          │
│  │ Auth+RLS   │ │ (WhatsApp) │ │(E-commerce)│                          │
│  │ Storage    │ │            │ │            │                          │
│  └────────────┘ └─────┬──────┘ └────────────┘                          │
│                       │                                                  │
│                       ▼                                                  │
│  ┌─── VPS HOSTINGER (Docker) ────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  ┌──────────────┐  ┌──────┐  ┌──────────────────┐                │ │
│  │  │ Evolution API│  │ n8n  │  │ PostgreSQL (EVO)  │                │ │
│  │  │  + Baileys   │  │      │  │                  │                │ │
│  │  └──────────────┘  └──┬───┘  └──────────────────┘                │ │
│  │                       │                                            │ │
│  │                       ▼                                            │ │
│  │                 ┌──────────┐                                       │ │
│  │                 │  OpenAI  │                                       │ │
│  │                 │  GPT-4o  │                                       │ │
│  │                 │  Whisper │                                       │ │
│  │                 │  Vision  │                                       │ │
│  │                 └──────────┘                                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  TypeScript 5.9 ─── em TODAS as camadas (front + back + types)         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Resumo Final — Todas as Tecnologias

| # | Tecnologia | Versão | Categoria | Papel no VEXX |
|---|-----------|--------|-----------|---------------|
| 1 | **Next.js** | 16.1.6 | Framework | App Router, API Routes, Middleware, SSR |
| 2 | **React** | 19.2.4 | UI Library | Componentes, hooks, Server Components |
| 3 | **TypeScript** | 5.9.3 | Linguagem | Tipagem estática em 100% do código |
| 4 | **Tailwind CSS** | 4.1.18 | Estilização | Design system com 2 temas (CRM + WhatsApp) |
| 5 | **Zustand** | 5.0.11 | Estado | 4 stores globais (auth, chats, connection, ui) |
| 6 | **TanStack React Query** | 5.90.21 | Data Fetching | Cache, infinite scroll, mutations, 14 hooks |
| 7 | **Supabase** | 2.95.3 | BaaS/Banco | PostgreSQL + Auth + Storage + RLS |
| 8 | **react-window** | 2.2.6 | Virtualização | Listas com 10k+ itens sem lag |
| 9 | **Lucide React** | 0.563.0 | Ícones | 1.500+ ícones SVG consistentes |
| 10 | **clsx** | 2.1.1 | Utilitário | Classes CSS condicionais |
| 11 | **SheetJS (xlsx)** | 0.18.5 | Export/Import | Planilhas Excel |
| 12 | **pg (node-postgres)** | 8.18.0 | Driver DB | Queries diretas ao PostgreSQL |
| 13 | **PostCSS** | 8.5.6 | Build CSS | Pipeline de compilação Tailwind |
| 14 | **ESLint** | 9.39.2 | Linter | Qualidade de código |
| 15 | **Turbopack** | Integrado | Bundler | Dev server com HMR ultrarrápido |
| 16 | **Evolution API** | v2 | Integração | WhatsApp multi-instância |
| 17 | **FacilZap API** | REST | Integração | E-commerce (produtos, pedidos, clientes) |
| 18 | **OpenAI GPT-4o** | Latest | IA | Chat, intent detection, resumos |
| 19 | **OpenAI Whisper** | Latest | IA | Transcrição de áudio |
| 20 | **n8n** | Latest | Automação | Workflows de processamento de mídia |
| 21 | **Netlify** | — | Deploy | Serverless + CDN + CI/CD |
| 22 | **Docker** | — | Containers | Evolution API + n8n na VPS |
| 23 | **Easypanel** | — | Orquestrador | Gerenciamento de containers na VPS |
| 24 | **Git + GitHub** | — | Versionamento | Controle de código-fonte |

---

*Documento gerado a partir de auditoria do repositório `Cjota221/vexxcrm`, branch `main`.*  
*Todas as versões e funcionalidades são baseadas no código real implementado.*
