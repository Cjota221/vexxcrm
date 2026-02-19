-- ============================================================
-- Migration 013: Kanban + Motor de Gatilhos da Anne
-- VEXX CRM 2.0 — Central de Atendimento Autônoma
-- ============================================================
-- Aplique em: https://supabase.com/dashboard/project/qjjflshqdaapwneeirdq/sql
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- ENUM: colunas do Kanban
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE kanban_column AS ENUM (
    'PRIMEIRO_CONTATO',
    'EM_NEGOCIACAO',
    'AGUARDANDO_PAGAMENTO',
    'PAGO',
    'REATIVAR',
    'CONCLUIDO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- ENUM: tipos de gatilho da Anne
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE anne_trigger_type AS ENUM (
    'primeiro_contato',
    'pedido_recebido',
    'pagamento_aprovado',
    'sinal_rejeicao',
    'engajamento_alto',
    'ghosting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- TABELA: kanban_cards
-- Um card por conversa (chat_id) por tenant.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kanban_cards (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_id                TEXT NOT NULL,
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coluna                 kanban_column NOT NULL DEFAULT 'PRIMEIRO_CONTATO',
  tags                   TEXT[] NOT NULL DEFAULT '{}',
  score_anne             NUMERIC(4, 3) DEFAULT NULL,    -- 0.000 – 1.000
  tentativas_reativacao  INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_kanban_cards_chat UNIQUE (tenant_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_tenant_coluna
  ON kanban_cards (tenant_id, coluna);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_updated
  ON kanban_cards (tenant_id, updated_at)
  WHERE coluna NOT IN ('PAGO', 'CONCLUIDO');

-- ──────────────────────────────────────────────────────────────
-- TABELA: kanban_transitions
-- Histórico completo de movimentações (rastreabilidade total).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kanban_transitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_id      TEXT NOT NULL,
  client_id    UUID NOT NULL,
  de_coluna    kanban_column,           -- NULL = card novo
  para_coluna  kanban_column NOT NULL,
  autor        TEXT NOT NULL CHECK (autor IN ('anne', 'human')),
  autor_id     UUID DEFAULT NULL,       -- id do atendente (quando human)
  motivo       TEXT DEFAULT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_transitions_chat
  ON kanban_transitions (tenant_id, chat_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- TABELA: anne_trigger_log
-- Log de auditoria de todos os gatilhos processados.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anne_trigger_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_id               TEXT NOT NULL,
  client_id             UUID NOT NULL,
  trigger               anne_trigger_type NOT NULL,
  score                 NUMERIC(4, 3) NOT NULL,   -- 0.000 – 1.000
  acao                  TEXT DEFAULT NULL,         -- ex: 'move_kanban', 'atualiza_tag'
  resultado             TEXT NOT NULL CHECK (resultado IN ('executado', 'sugerido', 'ignorado', 'escalado')),
  escalona_para_humano  BOOLEAN NOT NULL DEFAULT FALSE,
  canal                 TEXT NOT NULL DEFAULT 'whatsapp',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anne_trigger_log_tenant_date
  ON anne_trigger_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anne_trigger_log_trigger
  ON anne_trigger_log (tenant_id, trigger, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO: append_client_tag
-- Adiciona uma tag ao array de tags do cliente sem duplicar.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION append_client_tag(
  p_client_id UUID,
  p_tenant_id UUID,
  p_tag       TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE clients
  SET
    tags       = array_append(tags, p_tag),
    updated_at = NOW()
  WHERE id        = p_client_id
    AND tenant_id = p_tenant_id
    AND NOT (tags @> ARRAY[p_tag]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- RLS: kanban_cards
-- ──────────────────────────────────────────────────────────────
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_kanban_cards" ON kanban_cards;
CREATE POLICY "tenant_isolation_kanban_cards"
  ON kanban_cards
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- RLS: kanban_transitions
-- ──────────────────────────────────────────────────────────────
ALTER TABLE kanban_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_kanban_transitions" ON kanban_transitions;
CREATE POLICY "tenant_isolation_kanban_transitions"
  ON kanban_transitions
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- RLS: anne_trigger_log
-- ──────────────────────────────────────────────────────────────
ALTER TABLE anne_trigger_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_anne_trigger_log" ON anne_trigger_log;
CREATE POLICY "tenant_isolation_anne_trigger_log"
  ON anne_trigger_log
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- SERVICE ROLE: acesso irrestrito para API routes (server-side)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_kanban_cards" ON kanban_cards;
CREATE POLICY "service_role_kanban_cards"
  ON kanban_cards FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_kanban_transitions" ON kanban_transitions;
CREATE POLICY "service_role_kanban_transitions"
  ON kanban_transitions FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_anne_trigger_log" ON anne_trigger_log;
CREATE POLICY "service_role_anne_trigger_log"
  ON anne_trigger_log FOR ALL TO service_role USING (true);
