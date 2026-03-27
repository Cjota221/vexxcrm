-- Migration: 030a — Criar tabela campanha_disparos
-- Sem dependências externas. Execute este arquivo primeiro.

CREATE TABLE IF NOT EXISTS campanha_disparos (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  cliente_id    TEXT,
  telefone      TEXT,
  mensagem      TEXT,
  status        TEXT        NOT NULL DEFAULT 'enviado'
                            CHECK (status IN ('enviado', 'erro', 'simulado')),
  motivo        TEXT,
  campanha_nome TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campanha_disparos_tenant
  ON campanha_disparos (tenant_id, created_at DESC);

ALTER TABLE campanha_disparos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campanha_disparos'
      AND policyname = 'Tenant vê seus próprios disparos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Tenant vê seus próprios disparos"
        ON campanha_disparos FOR ALL
        USING (
          tenant_id = (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$$;

COMMENT ON COLUMN campanha_disparos.motivo IS
  'Motivo da falha no envio. Ex: telefone inválido, opt-out, erro Evolution API.';
