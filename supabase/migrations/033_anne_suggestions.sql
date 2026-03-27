-- Migration: 033 — Tabela anne_suggestions
-- Persiste sugestões da Anne em modo 'suggest' para exibição no frontend.
-- Sem SSE (serverless), essa tabela + Realtime é o canal de entrega.

CREATE TABLE IF NOT EXISTS anne_suggestions (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  conversation_id TEXT        NOT NULL,
  client_id      UUID,
  agent          TEXT,
  intent         TEXT,
  confidence     NUMERIC(4,3),
  mensagem       TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'sent', 'dismissed')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anne_suggestions_conv
  ON anne_suggestions (tenant_id, conversation_id, status, created_at DESC);

ALTER TABLE anne_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'anne_suggestions'
      AND policyname = 'Tenant vê suas próprias sugestões'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Tenant vê suas próprias sugestões"
        ON anne_suggestions FOR ALL
        USING (
          tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        )
    $policy$;
  END IF;
END $$;
