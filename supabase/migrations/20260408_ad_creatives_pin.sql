-- Migration: adiciona coluna is_pinned em ad_creatives
-- Um criativo pinado = criativo preferido para campanhas automáticas

ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial para busca eficiente do criativo pinado por tenant
CREATE INDEX IF NOT EXISTS idx_ad_creatives_pinned
  ON ad_creatives (tenant_id)
  WHERE is_pinned = true;

COMMENT ON COLUMN ad_creatives.is_pinned IS
  'Criativo marcado como preferido para campanhas automáticas. Apenas um por tenant.';
