-- Migration 055: Rascunhos de campanhas Meta criadas pelo CriadorCampanha
-- Armazena o estado completo do wizard antes e depois da publicação no Meta.

CREATE TABLE IF NOT EXISTS meta_campaign_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  nome              TEXT NOT NULL,
  objetivo          TEXT NOT NULL CHECK (objetivo IN ('LEAD_GENERATION','MESSAGES','LINK_CLICKS','CONVERSIONS','BRAND_AWARENESS')),
  status            TEXT NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho','publicando','publicado','erro')),

  -- Criativo selecionado
  criativo_id       UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,

  -- Copy do anúncio
  copy_headline     TEXT,
  copy_texto        TEXT,
  copy_cta          TEXT DEFAULT 'LEARN_MORE',
  url_destino       TEXT,

  -- Targeting
  paises            TEXT[]  NOT NULL DEFAULT ARRAY['BR'],
  idade_min         INTEGER NOT NULL DEFAULT 18,
  idade_max         INTEGER NOT NULL DEFAULT 65,
  genero            TEXT    NOT NULL DEFAULT 'all' CHECK (genero IN ('all','male','female')),
  interesses        JSONB,           -- [{id, name}]
  publico_id        TEXT,            -- meta custom audience id (opcional)

  -- Orçamento e período
  orcamento_diario  INTEGER NOT NULL DEFAULT 3000,  -- em centavos
  data_inicio       DATE,
  data_fim          DATE,

  -- Resultado da publicação
  meta_campaign_id  TEXT,
  meta_adset_id     TEXT,
  meta_ad_id        TEXT,
  erro              TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_meta_campaign_drafts_tenant
  ON meta_campaign_drafts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_drafts_status
  ON meta_campaign_drafts(tenant_id, status);

-- RLS
ALTER TABLE meta_campaign_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant isolado" ON meta_campaign_drafts
  USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER meta_campaign_drafts_updated_at
  BEFORE UPDATE ON meta_campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
