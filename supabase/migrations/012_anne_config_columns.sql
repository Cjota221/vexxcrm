-- ============================================================
-- Migration 012 — Configurações Avançadas da Anne por Tenant
-- Adiciona colunas para armazenar: modelo de IA, system prompt
-- personalizado, provedor (OpenAI/Anthropic/Google/etc) e
-- URL base customizada para provedores alternativos.
-- ============================================================

-- 1. Modelo de IA escolhido pelo tenant (ex: gpt-4o, claude-3-5-sonnet-20241022)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_model TEXT DEFAULT 'gpt-4o-mini';

-- 2. System prompt personalizado (personalidade da Anne para a loja)
--    Se NULL → usa o prompt padrão embutido no código
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_system_prompt TEXT DEFAULT NULL;

-- 3. Provedor de IA: openai | anthropic | google | groq | deepseek | custom
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_provider TEXT DEFAULT 'openai';

-- 4. URL base customizada para provedores alternativos ou instâncias próprias
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_base_url TEXT DEFAULT NULL;

-- 5. Documentação inline
COMMENT ON COLUMN tenants.openai_model IS
  'Modelo de IA configurado pelo tenant. Ex: gpt-4o-mini, gpt-4o, claude-3-5-sonnet-20241022, gemini-pro.';

COMMENT ON COLUMN tenants.openai_system_prompt IS
  'System prompt personalizado da Anne para esta loja. Se NULL, usa o prompt padrão do VEXX CRM. Hierarquia: openai_system_prompt > defaultPrompt.';

COMMENT ON COLUMN tenants.openai_provider IS
  'Provedor de IA: openai | anthropic | google | groq | deepseek | custom. Controla qual endpoint e formato de requisição usar.';

COMMENT ON COLUMN tenants.openai_base_url IS
  'URL base da API para provedores alternativos ou deployments próprios (ex: Azure OpenAI, LM Studio). Ignorado se provider = openai.';
