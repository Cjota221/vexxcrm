-- ──────────────────────────────────────────────────────────────
-- Migration 014: Adiciona DESPACHADO e CANCELADO ao enum kanban_column
--
-- Necessário para suportar o pipeline FacilZap completo:
--   PAGO → DESPACHADO → CONCLUIDO
--   * → CANCELADO → REATIVAR
--
-- ALTER TYPE ... ADD VALUE é idempotente com IF NOT EXISTS (Postgres 12+)
-- ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE kanban_column ADD VALUE IF NOT EXISTS 'DESPACHADO' AFTER 'PAGO';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE kanban_column ADD VALUE IF NOT EXISTS 'CANCELADO' AFTER 'DESPACHADO';
EXCEPTION WHEN others THEN NULL;
END $$;
