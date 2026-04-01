-- Migration: 052 — Consolidar provedores de IA para OpenAI e Groq
-- Remove Anthropic, Google/Gemini, Perplexity, DeepSeek, Custom.
-- Atualiza rows existentes e defaults de colunas.

-- ─── 1. Atualizar rows existentes ────────────────────────────────────────────

-- Cláudio: anthropic → openai, modelo atualizado
UPDATE ai_provider_config
SET
  strategy_provider = 'openai',
  strategy_model    = 'gpt-4o-mini'
WHERE strategy_provider IN ('anthropic', 'deepseek', 'custom', 'google');

-- Pedro: perplexity → openai, modelo atualizado
UPDATE ai_provider_config
SET
  research_provider = 'openai',
  research_model    = 'gpt-4o-mini'
WHERE research_provider IN ('perplexity', 'anthropic', 'deepseek', 'custom', 'google');

-- Judite: google → openai, modelo atualizado
UPDATE ai_provider_config
SET
  visual_provider = 'openai',
  visual_model    = 'gpt-4o-mini'
WHERE visual_provider IN ('google', 'anthropic', 'perplexity', 'deepseek', 'custom');

-- Anne auto-reply: manter groq; migrar outros para openai (exceto groq)
UPDATE ai_provider_config
SET
  auto_reply_provider = 'openai',
  auto_reply_model    = 'gpt-4o-mini'
WHERE auto_reply_provider IN ('anthropic', 'google', 'perplexity', 'deepseek', 'custom');

-- ─── 2. Atualizar defaults das colunas ───────────────────────────────────────

ALTER TABLE ai_provider_config
  ALTER COLUMN strategy_provider SET DEFAULT 'openai',
  ALTER COLUMN strategy_model    SET DEFAULT 'gpt-4o-mini',
  ALTER COLUMN research_provider SET DEFAULT 'openai',
  ALTER COLUMN research_model    SET DEFAULT 'gpt-4o-mini',
  ALTER COLUMN visual_provider   SET DEFAULT 'openai',
  ALTER COLUMN visual_model      SET DEFAULT 'gpt-4o-mini';
