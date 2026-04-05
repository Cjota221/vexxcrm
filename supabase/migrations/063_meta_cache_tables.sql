-- Migration: 063 — Garante estrutura completa das tabelas de cache Meta Ads
-- Todas as tabelas usam CREATE TABLE IF NOT EXISTS — seguro mesmo se já existirem.
-- Adiciona colunas ausentes e corrige políticas com nomes padronizados.

-- ─── meta_campaigns_cache ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_campaigns_cache (
  id                TEXT NOT NULL,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL DEFAULT '',
  status            TEXT,
  objetivo          TEXT,
  orcamento_diario  INTEGER,
  metricas          JSONB,
  data_inicio       TEXT,
  data_fim          TEXT,
  sincronizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

-- ─── meta_adsets_cache ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_adsets_cache (
  id                TEXT NOT NULL,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id       TEXT,
  nome              TEXT NOT NULL DEFAULT '',
  status            TEXT,
  orcamento_diario  INTEGER,
  targeting         JSONB,
  objetivo_otimizacao TEXT,
  metricas          JSONB,
  sincronizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

-- ─── meta_creatives_cache ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_creatives_cache (
  id               TEXT NOT NULL,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome             TEXT,
  tipo             TEXT,
  thumbnail_url    TEXT,
  body             TEXT,
  title            TEXT,
  sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

-- Adicionar colunas ausentes se a tabela já existia com estrutura antiga
ALTER TABLE meta_creatives_cache ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE meta_creatives_cache ADD COLUMN IF NOT EXISTS body          TEXT;
ALTER TABLE meta_creatives_cache ADD COLUMN IF NOT EXISTS title         TEXT;

-- ─── meta_ads_cache ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ads_cache (
  id               TEXT NOT NULL,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id      TEXT,
  adset_id         TEXT,
  nome             TEXT,
  status           TEXT,
  creative_id      TEXT,
  sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

-- Adicionar creative_id se tabela já existia sem ela
ALTER TABLE meta_ads_cache ADD COLUMN IF NOT EXISTS creative_id TEXT;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE meta_campaigns_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_adsets_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_creatives_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_cache       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cache_tenant_isolation_campaigns"  ON meta_campaigns_cache;
DROP POLICY IF EXISTS "cache_tenant_isolation_adsets"     ON meta_adsets_cache;
DROP POLICY IF EXISTS "cache_tenant_isolation_creatives"  ON meta_creatives_cache;
DROP POLICY IF EXISTS "cache_tenant_isolation_ads"        ON meta_ads_cache;

CREATE POLICY "cache_tenant_isolation_campaigns" ON meta_campaigns_cache FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cache_tenant_isolation_adsets" ON meta_adsets_cache FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cache_tenant_isolation_creatives" ON meta_creatives_cache FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cache_tenant_isolation_ads" ON meta_ads_cache FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaigns_cache_tenant_063 ON meta_campaigns_cache (tenant_id, sincronizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_adsets_cache_campaign_063  ON meta_adsets_cache (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_cache_campaign_063     ON meta_ads_cache (tenant_id, campaign_id);
