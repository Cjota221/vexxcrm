-- ══════════════════════════════════════════════════════════════
-- Migration 015 — Central de Comando da Anne
-- Tabelas para: configurações de automação por tenant,
-- fila de recuperação de carrinho e logs de pensamento.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Automações configuráveis por tenant ────────────────────
-- Armazena cada regra like n8n: gatilho, delay, ação, modo de envio.
CREATE TABLE IF NOT EXISTS anne_automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identificação da regra
  rule_key        text NOT NULL,   -- 'cart_recovery' | 'welcome_lead' | 'payment_confirm' | 'tracking_reply'
  name            text NOT NULL,   -- Label exibido na UI
  description     text,

  -- Comportamento
  enabled         boolean NOT NULL DEFAULT true,
  delay_minutes   int NOT NULL DEFAULT 120,          -- delay em minutos antes de disparar
  send_mode       text NOT NULL DEFAULT 'suggest',   -- 'auto' | 'suggest' (human-in-the-loop)
  message_template text,                             -- template com {{nome}}, {{produto}}, etc.

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, rule_key)
);

-- ── 2. Fila de recuperação de carrinho ────────────────────────
-- Um registro por cliente em EM_NEGOCIACAO sem pagamento.
-- O job de background lê isso e dispara o "Up" quando due_at < now().
CREATE TABLE IF NOT EXISTS anne_recovery_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chat_id         text NOT NULL,
  automation_id   uuid REFERENCES anne_automations(id) ON DELETE SET NULL,

  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'suggested' | 'cancelled' | 'converted'
  due_at          timestamptz NOT NULL,              -- quando disparar
  sent_at         timestamptz,
  converted_at    timestamptz,                       -- quando o cliente pagou (se ainda na fila)

  message_preview text,                              -- mensagem que será/foi enviada
  send_mode       text NOT NULL DEFAULT 'suggest',   -- herdado da automação

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Um cliente só pode ter 1 entrada pendente por tenant
  UNIQUE(tenant_id, client_id, status)
);

-- ── 3. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS anne_automations_tenant_idx
  ON anne_automations(tenant_id);

CREATE INDEX IF NOT EXISTS anne_recovery_queue_tenant_due_idx
  ON anne_recovery_queue(tenant_id, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS anne_recovery_queue_client_idx
  ON anne_recovery_queue(tenant_id, client_id);

-- ── 4. RLS ────────────────────────────────────────────────────
ALTER TABLE anne_automations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE anne_recovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anne_automations_tenant_isolation"
  ON anne_automations FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "anne_recovery_queue_tenant_isolation"
  ON anne_recovery_queue FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ── 5. Regras padrão para novos tenants ──────────────────────
-- (Inserir via seed após criação do tenant, não aqui)

-- ── 6. Coluna anne_send_mode em tenants (global fallback) ─────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS anne_send_mode text NOT NULL DEFAULT 'suggest';
-- 'auto' = envia direto | 'suggest' = só sugere (human-in-the-loop)

COMMENT ON TABLE anne_automations IS
  'Regras de automação configuráveis da Anne por tenant (estilo n8n: gatilho → delay → ação).';
COMMENT ON TABLE anne_recovery_queue IS
  'Fila de carrinhos pendentes para recuperação. O job processa entradas com due_at <= now() e status=pending.';
COMMENT ON COLUMN anne_automations.send_mode IS
  'auto = Anne envia direto; suggest = mensagem fica pendente até humano aprovar (human-in-the-loop).';
COMMENT ON COLUMN anne_automations.message_template IS
  'Template com variáveis: {{nome}}, {{produto}}, {{link_carrinho}}, {{codigo_rastreio}}.';
