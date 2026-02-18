-- ============================================================
-- Migration 009: UNIQUE constraint em messages.external_id
-- ============================================================
-- Garante que não existam mensagens duplicadas por tenant.
-- external_id é o ID da Evolution API (message key).
-- 
-- PARTIAL INDEX: só aplica onde external_id IS NOT NULL,
-- pois mensagens internas (sistema) podem não ter external_id.
-- ============================================================

-- 1. Remover TODAS as duplicatas (manter apenas a de menor ID/mais antiga)
-- Usando ctid para garantir que funciona mesmo com timestamps iguais
DELETE FROM messages
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, external_id 
        ORDER BY created_at ASC, id ASC
      ) as rn
    FROM messages
    WHERE external_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2. Criar partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tenant_external_unique
  ON messages (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- 3. Index auxiliar para busca rápida de dedup no webhook
CREATE INDEX IF NOT EXISTS idx_messages_external_id_lookup
  ON messages (tenant_id, conversation_id, external_id)
  WHERE external_id IS NOT NULL;