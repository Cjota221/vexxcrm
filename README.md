# VEXX CRM 2.0

> Sistema SaaS Multi-Tenant de gestão de vendas via WhatsApp para e-commerces.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)

---

## 🎯 Visão Geral

VEXX CRM 2.0 é uma plataforma completa de CRM para e-commerces que operam via WhatsApp, com:

- **Central de Atendimento** — Interface clone do WhatsApp Web para gestão de conversas
- **CRM Inteligente** — Perfil do cliente com LTV, histórico de pedidos e tags
- **Campanhas** — Disparo de sequências de mensagens em massa
- **Anne (IA)** — Assistente de vendas com GPT-4o integrada
- **Multi-Tenant** — Isolamento completo de dados com RLS no Supabase

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript 5.3+ |
| Estilos | Tailwind CSS 4 |
| State | Zustand 5 |
| Data Fetching | React Query (TanStack) 5 |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| WhatsApp | Evolution API |
| E-commerce | FacilZap |
| IA | OpenAI GPT-4o |
| Real-time | Server-Sent Events (SSE) |
| Ícones | Lucide React |

## 📁 Estrutura do Projeto

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Layouts de autenticação
│   │   └── login/
│   ├── (dashboard)/          # Layouts do dashboard
│   │   ├── atendimento/      # Central de atendimento (chat)
│   │   ├── campanhas/        # Campanhas de disparo
│   │   ├── clientes/         # CRM de clientes
│   │   ├── configuracoes/    # Configurações do sistema
│   │   ├── cupons/           # Gestão de cupons
│   │   ├── pedidos/          # Histórico de pedidos
│   │   └── produtos/         # Catálogo de produtos
│   └── api/                  # API Routes
│       ├── anne/             # IA Assistente
│       ├── auth/             # Autenticação
│       ├── campaigns/        # Campanhas
│       ├── clients/          # Clientes
│       ├── facilzap/         # Integração FacilZap
│       ├── sse/              # Server-Sent Events
│       ├── webhooks/         # Webhooks (Evolution API)
│       └── whatsapp/         # WhatsApp API
├── components/
│   ├── anne/                 # Componentes da IA Anne
│   ├── campaigns/            # Builder de campanhas
│   ├── chat/                 # Chat WhatsApp
│   ├── crm/                  # CRM sidebar e cards
│   ├── layout/               # Sidebar, Header, etc.
│   └── ui/                   # Componentes base (Button, Input, etc.)
├── hooks/                    # Custom hooks (React Query)
├── lib/                      # Utilitários e clients
├── store/                    # Zustand stores
└── types/                    # TypeScript types
```

## 🚀 Começando

### Pré-requisitos

- Node.js 18+
- npm ou pnpm
- Conta Supabase
- Evolution API (para WhatsApp)
- FacilZap (para e-commerce)
- OpenAI API Key (para IA)

### Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd vexx-crm

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.local.example .env.local
# Edite .env.local com suas credenciais

# Rode o servidor de desenvolvimento
npm run dev
```

### Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...

# Evolution API
EVOLUTION_API_URL=https://api.evolution.com
EVOLUTION_API_KEY=xxx

# FacilZap
FACILZAP_TOKEN=xxx
FACILZAP_SITE_URL=https://meusite.facilzap.app.br
```

## 📜 Scripts

```bash
npm run dev      # Servidor de desenvolvimento (Turbopack)
npm run build    # Build de produção
npm run start    # Servidor de produção
npm run lint     # Linting
```

## 🎨 Design System

| Token | Cor | Uso |
|-------|-----|-----|
| `crm-primary` | `#1e3a5f` | Azul Royal (brand) |
| `crm-success` | `#059669` | Sucesso/Confirmação |
| `wa-bg-panel` | `#111b21` | WhatsApp Dark Background |
| `wa-accent-green` | `#00a884` | WhatsApp Green |
| `surface-bg` | `#f7f8fa` | Background principal |

## 🏗 Arquitetura

### Multi-Tenant
- Todo dado é isolado por `tenant_id`
- RLS (Row Level Security) no Supabase garante isolamento
- Toda query DEVE filtrar por `tenant_id`

### Real-time (SSE)
- Server-Sent Events para comunicação em tempo real
- EventBus scoped por tenant no servidor
- Auto-reconnect com backoff exponencial no cliente
- Eventos: `new_message`, `message_status`, `typing_indicator`, `connection_update`

### Normalização de Telefone
- `PhoneNormalizer.canonical()` SEMPRE antes de buscar cliente
- Suporte a DDI 55, 9º dígito, DDDs válidos do Brasil

## 📄 Licença

Proprietário — VEXX © 2024-2025
