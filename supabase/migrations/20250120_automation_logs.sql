-- ══════════════════════════════════════════════════════════════
-- automation_logs — Trilha de auditoria de automações da Anne
-- Cada movimento de kanban e trigger detectado é registrado aqui.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS automation_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES clients(id) ON DELETE SET NULL,
  chat_id        text,                                        -- remoteJid WhatsApp
  trigger_type   text NOT NULL,                               -- 'pedido_recebido' | 'pagamento_aprovado' | etc.
  source         text NOT NULL DEFAULT 'whatsapp',            -- 'whatsapp' | 'facilzap' | 'manual'
  event_data     jsonb DEFAULT '{}',                          -- payload bruto do evento
  action_taken   text NOT NULL DEFAULT 'move_kanban',         -- 'move_kanban' | 'update_tracking' | 'update_name' | 'noop'
  de_coluna      text,                                        -- coluna anterior (null = card novo)
  para_coluna    text,                                        -- coluna destino
  order_number   text,                                        -- número do pedido extraído da mensagem
  tracking_code  text,                                        -- código de rastreio extraído
  success        boolean NOT NULL DEFAULT true,
  error_msg      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS automation_logs_tenant_id_idx      ON automation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS automation_logs_client_id_idx      ON automation_logs(client_id);
CREATE INDEX IF NOT EXISTS automation_logs_created_at_idx     ON automation_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_logs_trigger_type_idx   ON automation_logs(tenant_id, trigger_type);
CREATE INDEX IF NOT EXISTS automation_logs_source_idx         ON automation_logs(tenant_id, source);

-- RLS — cada tenant só vê seus próprios logs
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_logs_tenant_isolation"
  ON automation_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Comentários
COMMENT ON TABLE automation_logs IS 'Trilha de auditoria de automações da Anne (pipeline, tracking, nomes)';
COMMENT ON COLUMN automation_logs.source IS 'Origem do evento: whatsapp (mensagem), facilzap (webhook), manual (usuário)';
COMMENT ON COLUMN automation_logs.trigger_type IS 'Tipo de gatilho detectado (ver AnneTriggerType)';
COMMENT ON COLUMN automation_logs.event_data IS 'Dados adicionais do evento em JSON (texto da mensagem, etc.)';
COMMENT ON COLUMN automation_logs.order_number IS 'Número do pedido extraído da mensagem (ex: 5260270)';
