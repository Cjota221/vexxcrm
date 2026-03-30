-- Migration 050: Múltiplas contas Meta Ads por tenant
-- Data: 2026-03-30

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome            TEXT        NOT NULL,
  ad_account_id   TEXT        NOT NULL,              -- ex: "act_123456789"
  ativa           BOOLEAN     NOT NULL DEFAULT true,
  cor             TEXT        DEFAULT '#3b82f6',
  ordem           INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_tenant
  ON meta_ad_accounts (tenant_id, ativa, ordem);

ALTER TABLE meta_ad_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ad_accounts_tenant" ON meta_ad_accounts;
CREATE POLICY "meta_ad_accounts_tenant" ON meta_ad_accounts
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      ORDER BY p.created_at LIMIT 1
    )
  );

CREATE OR REPLACE FUNCTION update_meta_ad_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ad_accounts_updated_at ON meta_ad_accounts;
CREATE TRIGGER trg_meta_ad_accounts_updated_at
  BEFORE UPDATE ON meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_meta_ad_accounts_updated_at();
