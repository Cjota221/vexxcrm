-- Migration: Add UNIQUE constraint on messages(tenant_id, external_id)
-- Necessário para dedup na sincronização histórica (upsert por external_id)

-- Remover mensagens duplicadas antes de adicionar constraint
-- Manter apenas a mais recente de cada par (tenant_id, external_id)
DELETE FROM messages a USING messages b
WHERE a.id < b.id
  AND a.tenant_id = b.tenant_id
  AND a.external_id = b.external_id
  AND a.external_id IS NOT NULL;

-- Dropar o index antigo (não-unique)
DROP INDEX IF EXISTS idx_messages_external;

-- Criar constraint UNIQUE (ignora NULLs no PostgreSQL)
ALTER TABLE messages
  ADD CONSTRAINT messages_tenant_external_unique
  UNIQUE (tenant_id, external_id);
