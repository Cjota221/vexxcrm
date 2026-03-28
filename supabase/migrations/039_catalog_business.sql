-- Migration 039 — Product Catalog + Business Manager cache

-- Product catalog local cache
CREATE TABLE IF NOT EXISTS meta_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_catalog_id TEXT,
  nome            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_catalog_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  catalog_id      UUID REFERENCES meta_catalog(id) ON DELETE CASCADE,
  meta_item_id    TEXT,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  preco           BIGINT, -- em centavos
  disponibilidade TEXT NOT NULL DEFAULT 'in stock' CHECK (disponibilidade IN ('in stock','out of stock','preorder')),
  condicao        TEXT NOT NULL DEFAULT 'new' CHECK (condicao IN ('new','used','refurbished')),
  image_url       TEXT,
  link_produto    TEXT,
  marca           TEXT,
  sku             TEXT,
  sincronizado_em TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_catalog_tenant') THEN
    CREATE INDEX idx_meta_catalog_tenant ON meta_catalog (tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_catalog_products_tenant') THEN
    CREATE INDEX idx_catalog_products_tenant ON meta_catalog_products (tenant_id, catalog_id);
  END IF;
END $$;

ALTER TABLE meta_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_catalog_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_catalog_tenant" ON meta_catalog;
DROP POLICY IF EXISTS "meta_catalog_products_tenant" ON meta_catalog_products;

CREATE POLICY "meta_catalog_tenant" ON meta_catalog
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
CREATE POLICY "meta_catalog_products_tenant" ON meta_catalog_products
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
