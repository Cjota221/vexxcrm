-- Migration 051: adicionar ad_account_id nas tabelas de cache Meta
-- Necessário para filtrar dados quando há múltiplas contas por tenant
-- Data: 2026-03-30

ALTER TABLE meta_campaigns_cache
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

ALTER TABLE meta_ads_cache
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

ALTER TABLE meta_creatives_cache
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

ALTER TABLE meta_adsets_cache
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

-- Índices para busca por conta
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account
  ON meta_campaigns_cache (tenant_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_ads_account
  ON meta_ads_cache (tenant_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_creatives_account
  ON meta_creatives_cache (tenant_id, ad_account_id);
