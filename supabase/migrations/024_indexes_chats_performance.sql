-- ============================================================
-- MIGRATION 024: Índices de performance para /api/chats
-- ============================================================
--
-- PROBLEMA: /api/chats levando 4s com 1254 conversas.
--
-- NOTA: CONCURRENTLY removido — o Supabase SQL Editor roda dentro
-- de um bloco de transação implícito e não aceita CONCURRENTLY.
-- Em produção com tabelas grandes, execute cada CREATE INDEX
-- separadamente fora de uma transaction (psql direto).
--
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Índice principal: filtra por tenant + ordena por last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_msg
  ON conversations (tenant_id, last_message_at DESC NULLS LAST);

-- 2. Índice para filtro de status
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status
  ON conversations (tenant_id, status);

-- 3. Índice para o campo assigned_to (filtro 'mine')
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_assigned
  ON conversations (tenant_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 4. Índice para unread_count (filtro 'unread')
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_unread
  ON conversations (tenant_id, unread_count)
  WHERE unread_count > 0;

-- 5. Índice no client_id para o JOIN conversations → clients
CREATE INDEX IF NOT EXISTS idx_conversations_client_id
  ON conversations (client_id)
  WHERE client_id IS NOT NULL;

-- 6. Índice nos clients para lookup por tenant
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id
  ON clients (tenant_id);

-- ============================================================
-- Verificar índices criados:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('conversations', 'clients')
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
-- ============================================================
