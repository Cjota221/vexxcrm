-- Adiciona coluna executado_em em jarvis_memoria para rastrear última execução do Jarvis.
ALTER TABLE jarvis_memoria
  ADD COLUMN IF NOT EXISTS executado_em TIMESTAMPTZ DEFAULT NOW();
