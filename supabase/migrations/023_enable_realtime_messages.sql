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

-- 1. Habilitar REPLICA IDENTITY nas tabelas de tempo real
--    (seguro rodar mesmo se já estiver configurado)
ALTER TABLE messages      REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE clients       REPLICA IDENTITY FULL;

-- 2. Adicionar tabelas à publicação do Supabase Realtime (idempotente)
--    Ignora silenciosamente se a tabela já for membro da publicação.
DO $$
BEGIN
  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  -- conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  -- clients
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  END IF;
END $$;

-- 3. Verificar resultado (opcional — confirma quais tabelas estão ativas)
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
