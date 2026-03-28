-- Migration 042 — Flag is_group nas conversations

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'is_group') THEN
    ALTER TABLE conversations ADD COLUMN is_group BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Marcar conversas existentes de grupo (remote_jid com @g.us)
UPDATE conversations SET is_group = TRUE
WHERE remote_jid LIKE '%@g.us' AND (is_group IS NULL OR is_group = FALSE);
