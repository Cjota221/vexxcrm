-- Migration 038 — Social Media (posts agendados, métricas de página)

CREATE TABLE IF NOT EXISTS social_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'post' CHECK (tipo IN ('post','reel','story','carrossel')),
  titulo          TEXT,
  legenda         TEXT,
  hashtags        TEXT,
  media_url       TEXT,
  meta_post_id    TEXT,
  meta_page_id    TEXT,
  status          TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','agendado','publicado','falhou')),
  agendado_para   TIMESTAMPTZ,
  publicado_em    TIMESTAMPTZ,
  metricas        JSONB,
  erro            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add meta_page_id to ai_provider_config if missing
ALTER TABLE ai_provider_config ADD COLUMN IF NOT EXISTS meta_page_id TEXT;
ALTER TABLE ai_provider_config ADD COLUMN IF NOT EXISTS meta_instagram_id TEXT;

-- Indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_posts_tenant_status') THEN
    CREATE INDEX idx_social_posts_tenant_status ON social_posts (tenant_id, status);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_social_posts_agendado') THEN
    CREATE INDEX idx_social_posts_agendado ON social_posts (tenant_id, agendado_para) WHERE status = 'agendado';
  END IF;
END $$;

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_posts_tenant" ON social_posts;
CREATE POLICY "social_posts_tenant" ON social_posts
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
