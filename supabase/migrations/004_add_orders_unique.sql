-- Migration: Add UNIQUE constraint on orders(tenant_id, external_id)
-- This allows efficient upsert operations

-- First remove any duplicates (keep the most recent one)
DELETE FROM orders a USING orders b
WHERE a.tenant_id = b.tenant_id 
  AND a.external_id = b.external_id 
  AND a.id < b.id;

-- Add unique constraint
ALTER TABLE orders ADD CONSTRAINT orders_tenant_external_unique UNIQUE (tenant_id, external_id);
