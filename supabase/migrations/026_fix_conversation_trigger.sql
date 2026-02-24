-- ============================================================
-- MIGRATION 026: Corrigir trigger de update de conversations
-- ============================================================
--
-- PROBLEMA:
-- A central de atendimento não exibia mensagens recebidas porque:
--   1. O trigger update_conversation_on_message pode não existir no banco
--      (foi adicionado na migration 001, mas ambientes novos podem não ter rodado)
--   2. O trigger não atualizava last_message_content (campo renomeado)
--   3. Sem o update no conversation, o Supabase Realtime não emitia UPDATE
--      nessa tabela → o canal de conversations não disparava
--
-- SOLUÇÃO:
--   1. Recriar o trigger com REPLACE (idempotente)
--   2. Garantir que atualiza todos os campos corretos
--   3. Verificar nome da coluna (last_message_text vs last_message_content)
--
-- Execute este script no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Recriar a função do trigger (OR REPLACE = idempotente)
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_text    = NEW.content,
    last_message_at      = NEW.created_at,
    last_message_type    = NEW.type,
    message_count        = COALESCE(message_count, 0) + 1,
    unread_count         = CASE
                             WHEN NEW.direction = 'inbound'
                             THEN COALESCE(unread_count, 0) + 1
                             ELSE COALESCE(unread_count, 0)
                           END,
    updated_at           = NOW()
  WHERE id = NEW.conversation_id
    AND NEW.conversation_id IS NOT NULL;

  -- Atualizar last_message_at no cliente também
  UPDATE clients SET
    last_message_at = NEW.created_at
  WHERE id = NEW.client_id
    AND NEW.client_id IS NOT NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Recriar o trigger (DROP + CREATE para garantir que está ativo)
DROP TRIGGER IF EXISTS trg_messages_update_conversation ON messages;

CREATE TRIGGER trg_messages_update_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- 3. Confirmar que REPLICA IDENTITY está correto para o Realtime
--    detectar o UPDATE em conversations e emitir para o frontend
ALTER TABLE messages      REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE clients       REPLICA IDENTITY FULL;

-- 4. Verificar resultado — execute para confirmar:
-- SELECT trigger_name, event_manipulation, event_object_table, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name = 'trg_messages_update_conversation';
