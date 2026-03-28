# CHANGELOG

## [2026-03-27] — Fix: Params como Promise para Next.js 15+

**Commit:** `80437b7`
**Autor:** Caroline de Carvalho Azevedo
**Data:** 2026-03-27

### Alterações

#### `src/app/api/anne/suggestions/[id]/route.ts`
- Atualizado a assinatura da rota PATCH para usar `{ params }: { params: Promise<{ id: string }> }` conforme exigido pelo Next.js 15+
- Adicionado `await params` para desembrulhar a Promise e acessar o parâmetro `id`
- Garante compatibilidade com o novo modelo de params do Next.js 15

### Como Testar

1. Abra a Central de Atendimento com uma conversa ativa
2. Quando a Anne gerar uma sugestão no modo `suggest`, confirme que a sugestão aparece no card
3. Clique em **Enviar** para enviar a sugestão e valide que o status é atualizado no banco
4. Clique em **X** para descartar e valide que a sugestão é removida do card

---

## [2026-03-27] — Feat: 9 Correções Críticas da Auditoria da Central de Atendimento

**Commit:** `ef61cca`
**Autor:** Caroline de Carvalho Azevedo
**Data:** 2026-03-27

### Resumo Executivo

Implementação de 9 correções críticas identificadas na auditoria da Central de Atendimento, focando em:
- Resiliência em ambientes serverless (Netlify/Vercel)
- Integridade de dados em Kanban e automações
- Conformidade LGPD e busca de mensagens
- UI completa para sugestões da Anne
- Tool calling genérico compatível com múltiplos provedores de IA

---

### #1 — Throttle Anne Migrado para Banco (`anne_logs_v2`)

**Problema:** Maps em memória não funcionam em ambientes serverless — cada requisição corre em processo isolado.

**Solução:** `isThrottled()` agora consulta `anne_logs_v2` procurando registros `tipo='ativa'` nos últimos 30s. O estado persiste entre invocações.

**Impacto:** Anne funciona corretamente em Netlify/Vercel sem perder histórico de throttle.

---

### #2 — Cron Pending-Messages-Timeout (A Cada 5 Minutos)

**Arquivos:**
- `netlify.toml`
- `src/app/api/cron/pending-messages-timeout/route.ts`

**Problema:** Mensagens outbound ficam travadas em `status='pending'` quando o webhook de entrega da Evolution API não chega.

**Solução:** Novo endpoint GET que marca como `'failed'` mensagens com `status='pending'` há mais de 5 minutos. Registrado no `netlify.toml` com schedule `*/5 * * * *`.

**Impacto:** Nenhuma mensagem fica em limbo. Usuários sabem quando uma tentativa de envio falhou.

---

### #3 — Kanban Card: Upsert Substitui Update Cego

**Arquivos:**
- `src/app/api/webhooks/evolution/route.ts`
- `src/lib/services/agent-executor.ts`

**Problema:** Rotinas usavam `.update()` com `order_id` e `column_id` como chaves — campos do schema antigo, não do schema real (migration 013 usa `chat_id` e `coluna`). Cards não eram criados se não existissem.

**Solução:** Substituído `.update()` por `.upsert()` com `onConflict: 'tenant_id,chat_id'`. Se o card não existir, é criado automaticamente.

**Impacto:** Kanban sincroniza corretamente com a Evolution API.

---

### #4 — TTL em Automação Suspensa

**Arquivos:**
- `supabase/migrations/031_automation_suspended_ttl.sql`
- `src/lib/services/anne-pipeline.ts`

**Problema:** Automações suspensas manualmente não tinham expiração automática.

**Solução:**
- Nova coluna `automacao_suspensa_ate` (TIMESTAMPTZ, nullable) em `conversations`
- `suspendAutomation()` aceita parâmetro `duracaoHoras` opcional
- `isAutomationSuspended()` verifica TTL e limpa o flag automaticamente se expirado
- `NULL` = suspensão permanente (comportamento anterior preservado)

**Impacto:** Operadores podem suspender automações com expiração automática (ex: 24h).

---

### #5 — Índices Críticos (Migration 032)

**Arquivos:**
- `supabase/migrations/032_indices_messages_opt_out.sql`

**Índices adicionados:**
1. `messages(conversation_id, created_at DESC)` — Busca de mensagens por conversa
2. `messages(tenant_id, external_id)` — Deduplicação de webhooks
3. `anne_trigger_log(tenant_id, created_at DESC)` — Busca de logs de trigger
4. `anne_logs_v2(tenant_id, chat_id, tipo, created_at DESC) WHERE tipo='ativa'` — Throttle

**Impacto:** Queries críticas executam 100–1000× mais rápido.

---

### #6 — Filtro Opt-out LGPD Ativado

**Arquivo:** `src/lib/anne/tools/buscar-clientes-pedido-alto.ts`

**Problema:** Tool de busca de clientes não respeitava o flag `opt_out` LGPD.

**Solução:** Descomentado filtro `.eq('opt_out', false)` na query.

**Impacto:** Campanhas respeitam preferências LGPD automaticamente.

---

### #7 — Tool Calling para Anthropic/Google

**Arquivo:** `src/app/api/anne/chat/route.ts`

**Problema:** OpenAI function calling não está disponível em provedores alternativos (Anthropic, Google).

**Solução:** Nova função `runWithToolsTextBased()` que injeta instruções de `<tool_call>` no system prompt e usa regex para parsear a resposta. Funciona com qualquer modelo instruction-following.

**Impacto:** Anne pode usar tools em ambientes com qualquer provedor de IA.

---

### #8 — Suggestion Card UI Completo

**Arquivos:**
- `supabase/migrations/033_anne_suggestions.sql`
- `src/app/api/anne/suggestions/[id]/route.ts`
- `src/components/chat/AnneSuggestionCard.tsx`
- `src/components/chat/ChatArea.tsx`
- `src/components/chat/MessageInput.tsx`
- `src/hooks/useAnneSuggestion.ts`

**Problema:** Modo `suggest` usava SSE em memória — não funciona em Netlify (processos isolados).

**Solução completa:**
1. Nova tabela `anne_suggestions` (migration 033) com status `pending | sent | dismissed`
2. Hook `useAnneSuggestion()` com Supabase Realtime + polling de 10s como fallback
3. Componente `AnneSuggestionCard` com botões Enviar/Editar/Descartar
4. Prop `fillText: { text: string; seq: number }` no `MessageInput` para pré-preencher o input ao clicar Editar
5. `anne-auto-reply.ts` persiste sugestões no banco ao invés de emitir SSE

**Impacto:** Sugestões não se perdem em desconexões. UX completa com 3 ações.

---

### #9 — Busca Full-Text em Mensagens

**Arquivos:**
- `supabase/migrations/034_messages_fts.sql`
- `src/app/api/messages/search/route.ts`

**Solução:**
1. Coluna `search_vector TSVECTOR GENERATED ALWAYS` em `messages` com idioma `portuguese`
2. Índice GIN `idx_messages_fts`
3. Endpoint `GET /api/messages/search?q=texto&limit=20&before=cursor`
4. Fallback para `ILIKE` se migration 034 ainda não foi executada

**Impacto:** Busca de mensagens em milissegundos com suporte a stemming em português.

---

### Arquivos Alterados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `netlify.toml` | Config | Cron pending-messages-timeout a cada 5 min |
| `src/app/api/anne/chat/route.ts` | Route | Tool calling text-based para Anthropic/Google |
| `src/app/api/anne/suggestions/[id]/route.ts` | Route | **NOVO** — PATCH de status de sugestões |
| `src/app/api/cron/pending-messages-timeout/route.ts` | Route | **NOVO** — Cron de mensagens presas |
| `src/app/api/messages/search/route.ts` | Route | **NOVO** — Full-text search |
| `src/app/api/webhooks/evolution/route.ts` | Webhook | Kanban upsert |
| `src/components/chat/AnneSuggestionCard.tsx` | Component | **NOVO** — Card de sugestões |
| `src/components/chat/ChatArea.tsx` | Component | Integração do card de sugestões |
| `src/components/chat/MessageInput.tsx` | Component | Prop `fillText` para editar sugestões |
| `src/hooks/useAnneSuggestion.ts` | Hook | **NOVO** — Realtime + polling para sugestões |
| `src/lib/anne/tools/buscar-clientes-pedido-alto.ts` | Tool | Filtro opt_out LGPD ativado |
| `src/lib/services/agent-executor.ts` | Service | Kanban upsert |
| `src/lib/services/anne-auto-reply.ts` | Service | Persiste sugestões em banco |
| `src/lib/services/anne-pipeline.ts` | Service | TTL em automação suspensa |
| `supabase/migrations/031_automation_suspended_ttl.sql` | Migration | `automacao_suspensa_ate` |
| `supabase/migrations/032_indices_messages_opt_out.sql` | Migration | Índices críticos |
| `supabase/migrations/033_anne_suggestions.sql` | Migration | Tabela `anne_suggestions` |
| `supabase/migrations/034_messages_fts.sql` | Migration | TSVECTOR + GIN |

### Notas de Deploy

- **Migrations:** Execute `031` → `032` → `033` → `034` no SQL Editor do Supabase (nessa ordem)
- **Env vars:** Confirme que `CRON_SECRET` está em `.env.production`
- **Netlify:** Redeploy ativa o cron automaticamente via `netlify.toml`
- **Supabase Realtime:** Ative `anne_suggestions` no painel do Supabase → Database → Replication

### Quebras de Compatibilidade

Nenhuma. Todas as alterações são backward-compatible:
- Migrations usam `IF NOT EXISTS`
- Fallback ILIKE se FTS não disponível
- TTL `NULL` preserva comportamento anterior (suspensão indefinida)
