-- Adiciona campo para armazenar a API key da Anthropic por tenant

ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
