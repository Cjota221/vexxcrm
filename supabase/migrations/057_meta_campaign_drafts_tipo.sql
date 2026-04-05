-- ============================================================
-- Migration 057 — Coluna tipo em meta_campaign_drafts
-- O agente stream insere 'tipo' mas a migration 055 não criou
-- essa coluna. Adiciona a coluna e preenche retroativamente.
-- ============================================================

ALTER TABLE meta_campaign_drafts
  ADD COLUMN IF NOT EXISTS tipo TEXT
    CHECK (tipo IN ('frio', 'quente', 'whatsapp'));

UPDATE meta_campaign_drafts
SET tipo = CASE
  WHEN objetivo = 'BRAND_AWARENESS'                      THEN 'frio'
  WHEN copy_cta = 'WHATSAPP_MESSAGE'                     THEN 'whatsapp'
  ELSE 'quente'
END
WHERE tipo IS NULL;
