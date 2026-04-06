-- Adiciona coluna jarvis_log na tabela meta_campaign_drafts
-- Registra as decisões tomadas pelo Jarvis durante a publicação da campanha
-- (qual público foi selecionado e por quê, se a copy foi gerada por IA ou fallback)

ALTER TABLE meta_campaign_drafts
  ADD COLUMN IF NOT EXISTS jarvis_log TEXT;
