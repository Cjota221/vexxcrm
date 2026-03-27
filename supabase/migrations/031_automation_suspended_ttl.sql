-- Migration: 031 — TTL para automacao_suspensa
-- Adiciona coluna automacao_suspensa_ate em conversations.
-- NULL = suspensão indefinida (comportamento anterior preservado).
-- Quando preenchida, a automação é retomada automaticamente após a data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = 'conversations'
        AND column_name = 'automacao_suspensa_ate'
    ) THEN
      EXECUTE 'ALTER TABLE conversations
               ADD COLUMN automacao_suspensa_ate TIMESTAMPTZ DEFAULT NULL';
      EXECUTE $c$
        COMMENT ON COLUMN conversations.automacao_suspensa_ate IS
          'Quando preenchido, automacao_suspensa é desativada automaticamente após esta data.
           NULL = suspensão permanente até ação manual.'
      $c$;
      RAISE NOTICE 'Coluna automacao_suspensa_ate adicionada em conversations.';
    ELSE
      RAISE NOTICE 'Coluna automacao_suspensa_ate já existe — ignorada.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela conversations não encontrada — migration ignorada.';
  END IF;
END
$$;
