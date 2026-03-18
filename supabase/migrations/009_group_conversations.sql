-- ============================================================
-- 009: Suporte a conversas de grupo WhatsApp
-- ============================================================
-- Permite que conversations.client_id seja NULL (grupos não têm cliente individual)
-- Adiciona contact_name (nome do grupo) e remote_jid (JID único @g.us)

ALTER TABLE conversations
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS remote_jid   TEXT;

-- Índice para busca por JID (para upsert de grupo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_remote_jid
  ON conversations (tenant_id, remote_jid)
  WHERE remote_jid IS NOT NULL;

-- Índice para listar grupos facilmente
CREATE INDEX IF NOT EXISTS idx_conversations_group
  ON conversations (tenant_id, remote_jid)
  WHERE remote_jid LIKE '%@g.us';
