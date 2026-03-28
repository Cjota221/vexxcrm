-- Migration 040 — Unique constraints for catalog upsert (Meta sync)

-- Allow upsert on meta_catalog by (tenant_id, meta_catalog_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_meta_catalog_tenant_meta_id'
  ) THEN
    ALTER TABLE meta_catalog
      ADD CONSTRAINT uq_meta_catalog_tenant_meta_id
      UNIQUE (tenant_id, meta_catalog_id);
  END IF;
END $$;

-- Allow upsert on meta_catalog_products by (tenant_id, meta_item_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_catalog_products_tenant_item'
  ) THEN
    ALTER TABLE meta_catalog_products
      ADD CONSTRAINT uq_catalog_products_tenant_item
      UNIQUE (tenant_id, meta_item_id);
  END IF;
END $$;
