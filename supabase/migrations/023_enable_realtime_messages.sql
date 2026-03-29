-- ============================================================
-- MIGRATION 023: Habilitar Supabase Realtime nas tabelas críticas
-- ============================================================
--
-- PROBLEMA RAIZ: O SSE via eventBus (Node EventEmitter) NÃO funciona
-- no Netlify/Vercel serverless porque cada invocação de função roda em
-- um processo isolado. O webhook chega na instância A, o SSE está
-- escutando na instância B → o evento NUNCA cruza.
--
-- SOLUÇÃO: Usar o Supabase Realtime (WebSocket direto ao Supabase) como
-- fonte principal de eventos em tempo real.
--
-- Para o Realtime funcionar com `postgres_changes`, a tabela precisa:
--   1. REPLICA IDENTITY FULL (para enviar o row completo no payload)
--   2. Estar na publicação `supabase_realtime`
--
-- Execute este script no Supabase Dashboard > SQL Editor
-- ============================================================

DO $$
BEGIN
  -- 1. REPLICA IDENTITY FULL (idempotente — não lança erro se já configurado)
  ALTER TABLE messages      REPLICA IDENTITY FULL;
  ALTER TABLE conversations REPLICA IDENTITY FULL;
  ALTER TABLE clients       REPLICA IDENTITY FULL;

  -- 2. Adicionar tabelas à publicação do Supabase Realtime
  --    Captura duplicate_object (42710) para ser idempotente.

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- já é membro, ok
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Verificar resultado
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
