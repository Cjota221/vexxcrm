-- Migration 044 — Corrige tabela message_reactions
-- PROBLEMA: UNIQUE(tenant_id, message_id) só permite 1 reaction por mensagem no banco inteiro.
-- Em grupos com múltiplas pessoas reagindo ao mesmo message_id, apenas a última ficava salva.
-- SOLUÇÃO: adicionar reactor_phone + mudar constraint para UNIQUE(tenant_id, message_id, reactor_phone)

-- 1. Adicionar coluna reactor_phone se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_reactions' AND column_name = 'reactor_phone'
  ) THEN
    ALTER TABLE message_reactions ADD COLUMN reactor_phone TEXT DEFAULT '';
  END IF;
END $$;

-- 2. Remover constraint antiga (apenas message_id)
ALTER TABLE message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_tenant_id_message_id_key;

-- 3. Adicionar constraint correta incluindo reactor_phone
ALTER TABLE message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_tenant_message_reactor_key;

ALTER TABLE message_reactions
  ADD CONSTRAINT message_reactions_tenant_message_reactor_key
  UNIQUE (tenant_id, message_id, reactor_phone);

-- 4. Index para busca por message_id
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions (tenant_id, message_id);

-- 5. RPC para atualizar contagem de participantes de grupos de forma atômica
CREATE OR REPLACE FUNCTION increment_group_participants(
  p_tenant_id UUID,
  p_group_jid TEXT,
  p_delta INTEGER
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE whatsapp_groups
  SET participantes = GREATEST(0, COALESCE(participantes, 0) + p_delta),
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND group_jid = p_group_jid;
END;
$$;
