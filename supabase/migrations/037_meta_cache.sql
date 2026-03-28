-- Migration: 037 — Cache local das campanhas Meta Ads
-- Armazena campanhas, anúncios e criativos para carregamento rápido.

-- ─── 1. Cache de campanhas ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meta_campaigns_cache (
  id              TEXT NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (id, tenant_id),
  nome            TEXT,
  status          TEXT,
  objetivo        TEXT,
  orcamento_diario BIGINT,
  data_inicio     TIMESTAMPTZ,
  data_fim        TIMESTAMPTZ,
  metricas        JSONB,
  raw_data        JSONB,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Cache de anúncios ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meta_ads_cache (
  id              TEXT NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (id, tenant_id),
  campaign_id     TEXT,
  adset_id        TEXT,
  nome            TEXT,
  status          TEXT,
  criativo        JSONB,
  metricas        JSONB,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Cache de criativos (vídeos e imagens) ────────────────────────────────

CREATE TABLE IF NOT EXISTS meta_creatives_cache (
  id              TEXT NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (id, tenant_id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('video','imagem')),
  nome            TEXT,
  url_thumb       TEXT,
  url_full        TEXT,
  duracao         INTEGER,
  em_uso_em       INTEGER NOT NULL DEFAULT 0,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Índices ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_campaigns_tenant') THEN
    CREATE INDEX idx_meta_campaigns_tenant ON meta_campaigns_cache (tenant_id, status);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_ads_tenant') THEN
    CREATE INDEX idx_meta_ads_tenant ON meta_ads_cache (tenant_id, campaign_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_creatives_tenant') THEN
    CREATE INDEX idx_meta_creatives_tenant ON meta_creatives_cache (tenant_id, tipo);
  END IF;
END $$;

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE meta_campaigns_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_cache        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_creatives_cache  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_campaigns_cache_tenant" ON meta_campaigns_cache;
DROP POLICY IF EXISTS "meta_ads_cache_tenant"       ON meta_ads_cache;
DROP POLICY IF EXISTS "meta_creatives_cache_tenant" ON meta_creatives_cache;

CREATE POLICY "meta_campaigns_cache_tenant" ON meta_campaigns_cache
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "meta_ads_cache_tenant" ON meta_ads_cache
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "meta_creatives_cache_tenant" ON meta_creatives_cache
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
