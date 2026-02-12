# VEXX CRM 2.0 - Instruções do Copilot

## Sobre o Projeto
VEXX CRM 2.0 é um sistema SaaS Multi-Tenant de gestão de vendas via WhatsApp para e-commerces.
Construído com Next.js 14+ (App Router), TypeScript, Tailwind CSS e Supabase.

## Stack Tecnológica
- **Framework:** Next.js 14+ (App Router)
- **Linguagem:** TypeScript 5.3+
- **Estilo:** Tailwind CSS 3.4+
- **State Management:** Zustand 4.5+
- **Data Fetching:** React Query 5.17+
- **Database:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **Ícones:** Lucide React
- **Real-time:** Server-Sent Events (SSE)

## Convenções de Código
- **Arquivos:** kebab-case (ex: `chat-list.tsx`)
- **Componentes:** PascalCase (ex: `ChatList`)
- **Funções/variáveis:** camelCase (ex: `handleSendMessage`)
- **Constantes:** UPPER_SNAKE_CASE (ex: `API_BASE_URL`)
- **Tipos:** PascalCase (ex: `TenantConfig`)

## Ordem de Imports
1. External libs (react, react-query, etc.)
2. Internal libs (@/lib/*)
3. Components (@/components/*)
4. Types (@/types/*)
5. Styles

## Regras Críticas
- TODA query ao Supabase DEVE filtrar por `tenant_id`
- NUNCA expor tokens de API no client-side
- SEMPRE usar `PhoneNormalizer.canonical()` antes de buscar cliente
- Virtualizar listas com +100 itens (react-window)
- Debounce em inputs de busca (300ms)
- Loading states SEMPRE visíveis

## Design System
- Background principal: `#f7f8fa` (light) / `#111b21` (dark/WhatsApp)
- Primária (brand): `#1e3a5f` (Azul Royal)
- Sucesso: `#059669`
- Cards: `#FFFFFF` com border-radius 12-16px e sombras sutis
- Fontes: Inter/Poppins sans-serif
- Ícones: Lucide React (outline/thin style)
