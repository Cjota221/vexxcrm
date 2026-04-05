-- Migration 058: Adiciona criativo_url_preview em meta_campaign_drafts
-- Armazena a URL do thumbnail diretamente no draft para evitar dependência
-- do join com ad_creatives (que pode ser nulo se o criativo for deletado).

ALTER TABLE meta_campaign_drafts
  ADD COLUMN IF NOT EXISTS criativo_url_preview TEXT;

-- Também adiciona 'aprovado' ao CHECK de status (foi inserido pelo agente stream mas não estava no enum)
ALTER TABLE meta_campaign_drafts
  DROP CONSTRAINT IF EXISTS meta_campaign_drafts_status_check;

ALTER TABLE meta_campaign_drafts
  ADD CONSTRAINT meta_campaign_drafts_status_check
    CHECK (status IN ('rascunho','aprovado','publicando','publicado','rejeitado','erro'));
