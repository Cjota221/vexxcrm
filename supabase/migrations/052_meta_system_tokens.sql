-- Migration 052: System User Token e configuração completa Meta por tenant
-- Substitui variáveis de ambiente globais por configuração por tenant
-- Data: 2026-04-01

ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS meta_system_user_token  TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_id        TEXT,
  ADD COLUMN IF NOT EXISTS meta_app_id             TEXT,
  ADD COLUMN IF NOT EXISTS meta_app_secret         TEXT,
  ADD COLUMN IF NOT EXISTS meta_verify_token       TEXT,
  ADD COLUMN IF NOT EXISTS meta_token_type         TEXT DEFAULT 'page'
    CHECK (meta_token_type IN ('page', 'system_user')),
  ADD COLUMN IF NOT EXISTS meta_token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_token_valid        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meta_token_last_checked TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_token_error        TEXT;

COMMENT ON COLUMN ai_provider_config.meta_system_user_token IS
  'System User Token gerado no Meta Business Manager — não expira';
COMMENT ON COLUMN ai_provider_config.meta_business_id IS
  'ID do Business Manager da Meta';
COMMENT ON COLUMN ai_provider_config.meta_app_id IS
  'ID do App Meta (para geração de token de longa duração)';
COMMENT ON COLUMN ai_provider_config.meta_app_secret IS
  'App Secret da Meta (para validar assinatura HMAC do webhook)';
COMMENT ON COLUMN ai_provider_config.meta_verify_token IS
  'Token de verificação do webhook Meta (por tenant)';
COMMENT ON COLUMN ai_provider_config.meta_token_type IS
  'page = token de página (expira em 60 dias), system_user = token permanente (recomendado)';
COMMENT ON COLUMN ai_provider_config.meta_token_expires_at IS
  'Data de expiração do token (NULL = não expira, ex: system_user)';
COMMENT ON COLUMN ai_provider_config.meta_token_valid IS
  'Resultado da última verificação do token via Graph API';
COMMENT ON COLUMN ai_provider_config.meta_token_last_checked IS
  'Timestamp da última verificação do token';
COMMENT ON COLUMN ai_provider_config.meta_token_error IS
  'Último erro retornado pela Graph API ao verificar o token';
