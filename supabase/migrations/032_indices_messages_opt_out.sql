-- Migration: 032 — Índices críticos em messages + ativar filtro opt_out
--
-- Índices:
--   messages(conversation_id, created_at DESC)  → histórico de chat (mais usada)
--   messages(external_id)                       → deduplicação de mensagens do webhook
--   anne_trigger_log(tenant_id, created_at DESC) → queries de dashboard Sentinela
--
-- Todos os blocos são idempotentes (IF NOT EXISTS).

-- ── 1. Índice de histórico de mensagens por conversa ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'messages'
      AND indexname  = 'idx_messages_conversation_created'
  ) THEN
    EXECUTE 'CREATE INDEX idx_messages_conversation_created
             ON messages (conversation_id, created_at DESC)';
    RAISE NOTICE 'Índice idx_messages_conversation_created criado.';
  ELSE
    RAISE NOTICE 'Índice idx_messages_conversation_created já existe — ignorado.';
  END IF;
END $$;

-- ── 2. Índice de deduplicação por external_id ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'messages'
      AND indexname  = 'idx_messages_external_id'
  ) THEN
    EXECUTE 'CREATE INDEX idx_messages_external_id
             ON messages (tenant_id, external_id)
             WHERE external_id IS NOT NULL';
    RAISE NOTICE 'Índice idx_messages_external_id criado.';
  ELSE
    RAISE NOTICE 'Índice idx_messages_external_id já existe — ignorado.';
  END IF;
END $$;

-- ── 3. Índice para dashboard Sentinela (anne_trigger_log) ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'anne_trigger_log'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'anne_trigger_log'
        AND indexname  = 'idx_anne_trigger_log_tenant_created'
    ) THEN
      EXECUTE 'CREATE INDEX idx_anne_trigger_log_tenant_created
               ON anne_trigger_log (tenant_id, created_at DESC)';
      RAISE NOTICE 'Índice idx_anne_trigger_log_tenant_created criado.';
    ELSE
      RAISE NOTICE 'Índice idx_anne_trigger_log_tenant_created já existe — ignorado.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela anne_trigger_log não encontrada — índice ignorado.';
  END IF;
END $$;

-- ── 4. Índice para throttle Anne por conversa (anne_logs_v2) ─────────────────
-- Usado pela nova lógica de throttle persistido em banco (Fix #1).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'anne_logs_v2'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'anne_logs_v2'
        AND indexname  = 'idx_anne_logs_v2_throttle'
    ) THEN
      EXECUTE 'CREATE INDEX idx_anne_logs_v2_throttle
               ON anne_logs_v2 (tenant_id, chat_id, tipo, created_at DESC)
               WHERE tipo = ''ativa''';
      RAISE NOTICE 'Índice idx_anne_logs_v2_throttle criado.';
    ELSE
      RAISE NOTICE 'Índice idx_anne_logs_v2_throttle já existe — ignorado.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela anne_logs_v2 não encontrada — índice ignorado.';
  END IF;
END $$;
