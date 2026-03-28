-- Migration: 036 — Tráfego Pago + Instagram na Central
-- Cria tabela de criativos, adiciona canal nas mensagens/conversas
-- e nova coluna meta_page_id para roteamento de webhook.

-- ─── 1. Criativos de anúncio (gerenciados pela Judite + operadora) ───────────

CREATE TABLE IF NOT EXISTS ad_creatives (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('video','imagem')),
  formato           TEXT,             -- 'stories_916' | 'feed_11' | 'feed_43' | 'reels'
  meta_video_id     TEXT,             -- video_id retornado pela Meta API após upload
  meta_image_hash   TEXT,             -- hash retornado pela Meta API
  url_preview       TEXT,             -- URL de preview/thumbnail
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,
  judite_nota       NUMERIC CHECK (judite_nota BETWEEN 1 AND 10),
  judite_veredicto  TEXT,
  judite_aprovado   BOOLEAN,
  status            TEXT NOT NULL DEFAULT 'pronto'
                    CHECK (status IN ('uploading','pronto','em_uso','arquivado')),
  em_uso_em         INTEGER NOT NULL DEFAULT 0,  -- quantidade de anúncios ativos usando este criativo
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Identificação de canal nas mensagens ────────────────────────────────

ALTER TABLE messages ADD COLUMN IF NOT EXISTS
  canal TEXT NOT NULL DEFAULT 'whatsapp';
  -- 'whatsapp' | 'instagram' | 'meta_leads'

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS
  canal TEXT NOT NULL DEFAULT 'whatsapp';

-- ─── 3. Meta page ID para roteamento do webhook ─────────────────────────────
-- Identifica qual tenant é dono de qual Página do Meta.

ALTER TABLE ai_provider_config ADD COLUMN IF NOT EXISTS
  meta_page_id TEXT;

-- ─── 4. Índices ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ad_creatives_tenant') THEN
    CREATE INDEX idx_ad_creatives_tenant
      ON ad_creatives (tenant_id, status, created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_canal') THEN
    CREATE INDEX idx_messages_canal
      ON messages (tenant_id, canal, created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_canal') THEN
    CREATE INDEX idx_conversations_canal
      ON conversations (tenant_id, canal);
  END IF;
END $$;

-- ─── 5. RLS para ad_creatives ────────────────────────────────────────────────

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_creatives_tenant_isolation" ON ad_creatives;

CREATE POLICY "ad_creatives_tenant_isolation" ON ad_creatives
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );
