-- ============================================================
-- MIGRATION 045: Habilitar Supabase Realtime em contact_presence
-- ============================================================
-- Necessário para que o hook usePresence receba atualizações
-- instantâneas de typing/recording via WebSocket.
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE contact_presence REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contact_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_presence;
  END IF;
END $$;
