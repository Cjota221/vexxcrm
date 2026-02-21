-- Migration 022: Adiciona coluna config JSONB na tabela tenants
-- e colunas de perfil que podem estar faltando.
--
-- Esta coluna armazena configurações flexíveis por tenant:
--   config.facilzap.site_url  → URL base do site para links de produto
--   config.pix                → Dados da chave Pix (key, keyType, holderName)
--
-- Também garante que as colunas de perfil (cnpj, contact_email, contact_phone)
-- existam na tabela tenants.

-- ── Coluna principal: config JSONB ──────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- ── Colunas de perfil da loja ────────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cnpj           TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_email  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone  TEXT DEFAULT NULL;

-- ── Comentários ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN tenants.config IS
  'Configurações JSONB flexíveis do tenant. Ex: facilzap.site_url, pix.key, pix.keyType, pix.holderName';

COMMENT ON COLUMN tenants.cnpj IS
  'CNPJ da loja (opcional)';

COMMENT ON COLUMN tenants.contact_email IS
  'E-mail de contato da loja';

COMMENT ON COLUMN tenants.contact_phone IS
  'Telefone de contato da loja';
