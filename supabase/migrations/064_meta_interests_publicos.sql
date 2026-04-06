-- Migration: 064 — Biblioteca de Interesses Meta + Públicos Aprovados
-- Cria tabelas para curadoria de interesses classificados pelo Jarvis
-- e públicos aprovados por tenant para uso em campanhas.

-- ─── 1. Biblioteca de interesses (escopo global) ─────────────────────────────
-- Catálogo compartilhado entre todos os tenants. Interesses buscados via
-- Meta API, classificados pelo Jarvis e reutilizáveis por qualquer tenant.

CREATE TABLE IF NOT EXISTS meta_interests_biblioteca (
  id                TEXT PRIMARY KEY,               -- ID numérico da Meta API (sempre TEXT)
  nome              TEXT NOT NULL,
  categoria         TEXT,                            -- 'moda' | 'beleza' | 'estilo_de_vida' | etc.
  audiencia_global  BIGINT,                          -- tamanho estimado global retornado pela Meta
  audiencia_br      BIGINT,                          -- tamanho estimado no Brasil
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  aprovado_jarvis   BOOLEAN,                         -- NULL=pendente, TRUE=aprovado, FALSE=rejeitado
  justificativa     TEXT,                            -- análise gerada pelo Jarvis
  sincronizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Públicos aprovados por tenant ────────────────────────────────────────
-- Conjuntos de targeting aprovados para uso direto em campanhas.
-- Podem ser criados manualmente ou pelo Jarvis automaticamente.

CREATE TABLE IF NOT EXISTS meta_publicos_aprovados (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  tipo              TEXT NOT NULL
                    CHECK (tipo IN ('frio', 'quente', 'whatsapp', 'lookalike', 'retargeting')),
  descricao         TEXT,
  meta_audience_id  TEXT,                            -- ID do saved_audience criado na Meta API
  status            TEXT NOT NULL DEFAULT 'rascunho'
                    CHECK (status IN ('rascunho', 'publicado', 'erro', 'arquivado')),
  erro_msg          TEXT,
  targeting         JSONB,                           -- objeto targeting completo (pronto para uso)
  interest_ids      TEXT[],                          -- IDs dos interesses que compõem o público
  estimativa_alcance BIGINT,                         -- reach estimado retornado pela Meta API
  criado_por_ia     BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE quando gerado automaticamente pelo Jarvis
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Índices ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_interests_categoria') THEN
    CREATE INDEX idx_meta_interests_categoria
      ON meta_interests_biblioteca (categoria, aprovado_jarvis, ativo);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_meta_publicos_tenant') THEN
    CREATE INDEX idx_meta_publicos_tenant
      ON meta_publicos_aprovados (tenant_id, status, tipo);
  END IF;
END $$;

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────

-- Biblioteca: leitura para todos os usuários autenticados; escrita apenas via service_role.
ALTER TABLE meta_interests_biblioteca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_interests_biblioteca_read" ON meta_interests_biblioteca;
CREATE POLICY "meta_interests_biblioteca_read" ON meta_interests_biblioteca
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Públicos aprovados: isolados por tenant (cada tenant vê só os seus).
ALTER TABLE meta_publicos_aprovados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_publicos_aprovados_tenant" ON meta_publicos_aprovados;
CREATE POLICY "meta_publicos_aprovados_tenant" ON meta_publicos_aprovados
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- ─── 5. Trigger updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_meta_publicos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_publicos_updated_at ON meta_publicos_aprovados;
CREATE TRIGGER trg_meta_publicos_updated_at
  BEFORE UPDATE ON meta_publicos_aprovados
  FOR EACH ROW EXECUTE FUNCTION update_meta_publicos_updated_at();
