-- Migration 047: Cache de adsets Meta Ads + colunas Judite em meta_creatives_cache
-- Data: 2026-03-29
-- Adiciona tabela de cache de conjuntos de anúncios (adsets) e estende
-- meta_creatives_cache com avaliações da Judite (IA visual).

-- ─── 1. Cache de adsets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meta_adsets_cache (
  id               TEXT        NOT NULL,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (id, tenant_id),
  campaign_id      TEXT,
  nome             TEXT,
  status           TEXT,
  orcamento_diario BIGINT,
  targeting        JSONB,
  objetivo_otimizacao TEXT,
  evento_cobranca  TEXT,
  metricas         JSONB,
  raw_data         JSONB,
  sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Índice para busca por campanha ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_adsets_campaign') THEN
    CREATE INDEX idx_meta_adsets_campaign
      ON meta_adsets_cache (tenant_id, campaign_id);
  END IF;
END $$;

-- ─── 3. RLS para meta_adsets_cache ───────────────────────────────────────────

ALTER TABLE meta_adsets_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_adsets_cache_tenant" ON meta_adsets_cache;
CREATE POLICY "meta_adsets_cache_tenant" ON meta_adsets_cache
  FOR ALL USING (
    tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ─── 4. Estender meta_creatives_cache com avaliações da Judite ───────────────

ALTER TABLE meta_creatives_cache
  ADD COLUMN IF NOT EXISTS judite_nota      NUMERIC,
  ADD COLUMN IF NOT EXISTS judite_veredicto TEXT,
  ADD COLUMN IF NOT EXISTS judite_aprovado  BOOLEAN,
  ADD COLUMN IF NOT EXISTS judite_avaliado_em TIMESTAMPTZ;

-- ─── 5. Tabela ad_creatives (uploads feitos pelo usuário) ────────────────────
-- Separada de meta_creatives_cache que é somente sincronização do Meta.
-- ad_creatives armazena vídeos/imagens subidos pela operadora via VEXX.

CREATE TABLE IF NOT EXISTS ad_creatives (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome              TEXT        NOT NULL,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('video', 'imagem')),
  meta_video_id     TEXT,                     -- ID retornado pelo Meta após upload
  meta_image_hash   TEXT,                     -- hash retornado pelo Meta após upload
  url_preview       TEXT,                     -- URL pública do thumbnail/preview
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,
  judite_nota       NUMERIC,
  judite_veredicto  TEXT,
  judite_aprovado   BOOLEAN,
  judite_avaliado_em TIMESTAMPTZ,
  status            TEXT        NOT NULL DEFAULT 'pronto'
                    CHECK (status IN ('processando','pronto','arquivado','erro')),
  em_uso_em         INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. Índices ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ad_creatives_tenant') THEN
    CREATE INDEX idx_ad_creatives_tenant
      ON ad_creatives (tenant_id, tipo, status);
  END IF;
END $$;

-- ─── 7. RLS para ad_creatives ────────────────────────────────────────────────

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_creatives_tenant" ON ad_creatives;
CREATE POLICY "ad_creatives_tenant" ON ad_creatives
  FOR ALL USING (
    tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );
