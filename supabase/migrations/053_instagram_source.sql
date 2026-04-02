-- Adiciona 'instagram' como source válido para clients
-- Necessário para receber DMs do Instagram Direct via webhook Meta

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_source_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_source_check
  CHECK (source IN ('whatsapp', 'import', 'manual', 'campaign', 'facilzap', 'instagram'));

-- Garantir que conversations.canal aceite 'instagram'
-- (channel já aceita, mas canal é o campo legado usado pelo front)
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_canal_check;

-- Apenas se existir constraint no canal (pode não existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'canal'
  ) THEN
    -- Sem constraint no campo canal (é TEXT livre), nada a fazer
    NULL;
  END IF;
END;
$$;
