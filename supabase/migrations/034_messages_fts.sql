-- Migration: 034 — Full-Text Search em messages
-- Adiciona coluna tsvector gerada automaticamente para busca em messages.content.
-- A coluna é atualizada por trigger a cada INSERT/UPDATE.

DO $$
BEGIN
  -- Adicionar coluna search_vector se ainda não existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'messages'
      AND column_name  = 'search_vector'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE messages
        ADD COLUMN search_vector TSVECTOR
          GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED
    $sql$;
    RAISE NOTICE 'Coluna search_vector adicionada em messages.';
  ELSE
    RAISE NOTICE 'Coluna search_vector já existe — ignorada.';
  END IF;
END $$;

-- Índice GIN para busca full-text eficiente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'messages'
      AND indexname  = 'idx_messages_fts'
  ) THEN
    EXECUTE 'CREATE INDEX idx_messages_fts ON messages USING GIN (search_vector)';
    RAISE NOTICE 'Índice GIN idx_messages_fts criado.';
  ELSE
    RAISE NOTICE 'Índice idx_messages_fts já existe — ignorado.';
  END IF;
END $$;
