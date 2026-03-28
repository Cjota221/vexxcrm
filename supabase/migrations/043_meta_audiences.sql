-- Públicos de segmentação criados pela IA (José + Cláudio) via Meta Marketing API

CREATE TABLE IF NOT EXISTS meta_audiences (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               TEXT        NOT NULL,
  nome                    TEXT        NOT NULL,
  descricao               TEXT,
  meta_audience_id        TEXT,                         -- ID do público no Meta (se criado lá)
  targeting               JSONB       NOT NULL,         -- configuração completa de targeting
  estimativa_alcance_min  BIGINT,
  estimativa_alcance_max  BIGINT,
  criado_por_ia           BOOLEAN     DEFAULT FALSE,
  jose_justificativa      TEXT,                         -- por que José recomendou
  claudio_copy            JSONB,                        -- copy sugerido pelo Cláudio
  tipo                    TEXT        DEFAULT 'interesse',  -- 'interesse' | 'remarketing' | 'lookalike'
  status                  TEXT        DEFAULT 'pronto',    -- 'rascunho' | 'pronto' | 'em_uso' | 'pausado'
  em_uso_em               INTEGER     DEFAULT 0,           -- quantas campanhas usam esse público
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_audiences_tenant
  ON meta_audiences (tenant_id, status);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_meta_audiences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_audiences_updated_at ON meta_audiences;
CREATE TRIGGER trg_meta_audiences_updated_at
  BEFORE UPDATE ON meta_audiences
  FOR EACH ROW EXECUTE FUNCTION update_meta_audiences_updated_at();

-- RLS: cada tenant só vê seus próprios públicos
ALTER TABLE meta_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_audiences_tenant_isolation" ON meta_audiences;
CREATE POLICY "meta_audiences_tenant_isolation" ON meta_audiences
  USING (tenant_id = (
    SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1
  ));
