-- Adiciona 'catalogo' ao check constraint do campo tipo em meta_campaign_drafts

ALTER TABLE meta_campaign_drafts
  DROP CONSTRAINT IF EXISTS meta_campaign_drafts_tipo_check;

ALTER TABLE meta_campaign_drafts
  ADD CONSTRAINT meta_campaign_drafts_tipo_check
  CHECK (tipo IN ('frio', 'quente', 'whatsapp', 'catalogo'));
