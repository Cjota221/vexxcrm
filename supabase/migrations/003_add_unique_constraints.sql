-- ============================================================
-- VEXX CRM 2.0 - Adiciona Constraints Únicos para Upsert
-- ============================================================

-- PRODUCTS: Constraint único para external_id por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_external 
  ON products(tenant_id, external_id) 
  WHERE external_id IS NOT NULL;

-- ORDERS: Constraint único para external_id por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_external 
  ON orders(tenant_id, external_id) 
  WHERE external_id IS NOT NULL;

-- Comentário explicativo
COMMENT ON INDEX idx_products_tenant_external IS 
  'Permite upsert de produtos por external_id do FacilZap';

COMMENT ON INDEX idx_orders_tenant_external IS 
  'Permite upsert de pedidos por external_id do FacilZap';
