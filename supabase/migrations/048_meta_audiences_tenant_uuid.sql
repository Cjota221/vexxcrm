-- Migration 048: converter meta_audiences.tenant_id de TEXT para UUID
-- para alinhar com o padrão do restante do sistema (profiles, tenants, etc.)
-- Data: 2026-03-29

-- Passo 1: adicionar coluna UUID temporária
ALTER TABLE meta_audiences
  ADD COLUMN IF NOT EXISTS tenant_id_uuid UUID;

-- Passo 2: popular a coluna UUID convertendo os valores existentes
UPDATE meta_audiences
SET tenant_id_uuid = tenant_id::uuid
WHERE tenant_id IS NOT NULL
  AND tenant_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Passo 3: remover políticas RLS antigas (recriaremos abaixo)
DROP POLICY IF EXISTS "tenant isolation meta_audiences" ON meta_audiences;
DROP POLICY IF EXISTS "meta_audiences tenant isolation" ON meta_audiences;
DROP POLICY IF EXISTS meta_audiences_tenant_isolation ON meta_audiences;

-- Passo 4: remover coluna TEXT antiga e renomear UUID
ALTER TABLE meta_audiences DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE meta_audiences RENAME COLUMN tenant_id_uuid TO tenant_id;

-- Passo 5: tornar obrigatória e adicionar FK para tenants
ALTER TABLE meta_audiences ALTER COLUMN tenant_id SET NOT NULL;

-- Passo 6: recriar índice e política RLS com o tipo correto
CREATE INDEX IF NOT EXISTS meta_audiences_tenant_id_idx ON meta_audiences (tenant_id);

ALTER TABLE meta_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_audiences tenant isolation" ON meta_audiences
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );
