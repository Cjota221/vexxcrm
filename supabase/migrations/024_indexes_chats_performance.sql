-- ============================================================
-- MIGRATION 024: Índices de performance para /api/chats
-- ============================================================
--
-- PROBLEMA: /api/chats levando 4s com 1254 conversas.
--
-- A query faz:
--   SELECT * FROM conversations
--   WHERE tenant_id = $1
--     AND status != 'archived'
--   ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
--   LIMIT 26
--
-- Sem índice composto, o Postgres faz seq scan em TODAS as conversas
-- do tenant para depois ordenar — O(n log n) em vez de O(k) com índice.
--
-- SOLUÇÃO: Índice composto (tenant_id, last_message_at DESC) na tabela
-- conversations + índice auxiliar para o join com clients.
--
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Índice principal: filtra por tenant + ordena por last_message_at
--    Cobre: WHERE tenant_id = $1 ORDER BY last_message_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_last_msg
  ON conversations (tenant_id, last_message_at DESC NULLS LAST);

-- 2. Índice para filtro de status (evita seq scan ao excluir 'archived')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_status
  ON conversations (tenant_id, status);

-- 3. Índice para cursor-based pagination (last_message_at < $cursor)
--    Já coberto pelo idx_conversations_tenant_last_msg acima.

-- 4. Índice para o campo assigned_to (filtro 'mine')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_assigned
  ON conversations (tenant_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 5. Índice para unread_count (filtro 'unread')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_unread
  ON conversations (tenant_id, unread_count)
  WHERE unread_count > 0;

-- 6. Índice no client_id para o JOIN conversations → clients
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_client_id
  ON conversations (client_id)
  WHERE client_id IS NOT NULL;

-- 7. Índice nos clients para lookup por tenant (JOIN lateral)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_tenant_id
  ON clients (tenant_id);

-- ============================================================
-- Verificar índices criados (opcional):
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('conversations', 'clients')
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
-- ============================================================
