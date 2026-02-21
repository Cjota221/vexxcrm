-- Migration: adiciona coluna history_loaded em conversations
-- Usada pelo lazy loading de histórico (POST /api/whatsapp/load-history)
-- Quando true: histórico já foi puxado da Evolution API para este chat
-- Evita re-buscar toda vez que o usuário abre a conversa

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS history_loaded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN conversations.history_loaded IS
  'Flag de lazy loading: true = histórico da Evolution API já foi importado para este chat';
