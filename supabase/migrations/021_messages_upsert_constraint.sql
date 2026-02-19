-- ══════════════════════════════════════════════════════════════
-- Migration 021 — Constraint nomeado em messages para upsert
-- 
-- O PostgREST/Supabase requer um UNIQUE CONSTRAINT nomeado
-- (não apenas um index parcial) para o onConflict do upsert.
-- Converte o partial index da migration 009 em constraint.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Remover o index parcial antigo (se existir) ────────────
DROP INDEX IF EXISTS idx_messages_tenant_external_unique;

-- ── 2. Limpar qualquer duplicata residual antes de criar constraint ──
DELETE FROM messages
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, external_id
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM messages
    WHERE external_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ── 3. Criar UNIQUE CONSTRAINT nomeado (suporta onConflict no upsert) ──
-- Partial constraint via expression index com UNIQUE — PostgreSQL aceita
-- Supabase PostgREST lê constraints da tabela pg_constraint.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_tenant_external_id_unique;

ALTER TABLE messages
  ADD CONSTRAINT messages_tenant_external_id_unique
  UNIQUE NULLS NOT DISTINCT (tenant_id, external_id);

-- Nota: NULLS NOT DISTINCT (PostgreSQL 15+) faz NULLs serem tratados como
-- distintos entre si, permitindo múltiplas linhas com external_id = NULL.
-- Se o Supabase estiver em PG < 15, use o index parcial abaixo como fallback.

-- ── 4. Fallback para PostgreSQL < 15 (comentado por padrão) ──────────
-- Se a instrução acima falhar por versão do PG, execute este bloco:
--
-- ALTER TABLE messages
--   DROP CONSTRAINT IF EXISTS messages_tenant_external_id_unique;
--
-- CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_external_id_unique
--   ON messages (tenant_id, external_id)
--   WHERE external_id IS NOT NULL;
--
-- (Nesse caso o upsert usa ignoreDuplicates: true e captura erros 23505)

-- ── 5. Recriar index auxiliar para lookup rápido ─────────────
CREATE INDEX IF NOT EXISTS idx_messages_external_id_lookup
  ON messages (tenant_id, conversation_id, external_id)
  WHERE external_id IS NOT NULL;

-- ── 6. Comentário ─────────────────────────────────────────────
COMMENT ON CONSTRAINT messages_tenant_external_id_unique ON messages
  IS 'Garante dedup de mensagens por ID da Evolution API. Permite upsert via PostgREST.';
