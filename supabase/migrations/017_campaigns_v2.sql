-- ══════════════════════════════════════════════════════════════
-- Migration 017 — Campanhas v2.0 · Motor de Disparo Anti-Ban
-- Novas tabelas: message_templates, campaign_jobs
-- Expansão: campaigns (adicionar colunas anti-ban, blocos, métricas)
-- ══════════════════════════════════════════════════════════════

-- ── 1. Templates de mensagem (CRUD completo) ──────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,

  nome             varchar(120) NOT NULL,
  descricao        text,
  tags             text[]  DEFAULT '{}',
  tipo             varchar(20) NOT NULL DEFAULT 'texto'
                   CHECK (tipo IN ('texto', 'midia', 'composto')),

  -- Blocos de conteúdo (imagem, texto, cta em sequência)
  blocos           jsonb   NOT NULL DEFAULT '[]',

  -- Variáveis detectadas automaticamente ex: ['{{nome}}', '{{cidade}}']
  variaveis        text[]  DEFAULT '{}',

  status           varchar(20) DEFAULT 'ativo'
                   CHECK (status IN ('ativo', 'arquivado', 'rascunho')),

  uso_count        int     DEFAULT 0,
  ultima_vez_usado timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Expansão da tabela campaigns ───────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS template_id     uuid REFERENCES message_templates(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS blocos_snapshot jsonb DEFAULT '[]';
  -- snapshot dos blocos no momento do disparo (imutável após início)

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS destinatarios   jsonb DEFAULT '[]';
  -- [{ tipo: 'contato'|'grupo_whatsapp', id, telefone?, nome }]

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS tipo_destinatario varchar(20) DEFAULT 'contatos'
                            CHECK (tipo_destinatario IN ('contatos','grupos','misto'));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS config_antiban  jsonb DEFAULT '{}';
  -- { delay_min_ms, delay_max_ms, cooloff_a_cada, cooloff_duracao_ms,
  --   janela_horaria_inicio, janela_horaria_fim }

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS origem          varchar(30) DEFAULT 'manual';
  -- 'manual' | 'inteligencia' | 'agendador'

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS origem_grupo_nome text;
  -- Nome do grupo da Inteligência se origem = 'inteligencia'

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS cool_off_ate    timestamptz;
  -- Quando está em cool-off, até quando dura

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS status_detalhe  text;
  -- 'cool_off' | 'aguardando_janela' | 'rate_limited' | null

-- ── 3. Jobs individuais da fila de disparo ────────────────────
CREATE TABLE IF NOT EXISTS campaign_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id       uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  contato_id        uuid REFERENCES clients(id) ON DELETE SET NULL,
  contato_telefone  varchar(30) NOT NULL,
  contato_nome      text,

  blocos            jsonb NOT NULL DEFAULT '[]',
  ordem             int   NOT NULL,  -- posição na fila (determina ordem de envio)

  status            varchar(20) DEFAULT 'pendente'
                    CHECK (status IN ('pendente','enviando','enviado','erro','cancelado')),

  tentativas        int DEFAULT 0,
  proximo_envio_em  timestamptz,
  iniciado_em       timestamptz,
  enviado_em        timestamptz,
  erro_mensagem     text,
  erro_codigo       varchar(50),

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_templates_tenant_status
  ON message_templates(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_templates_tags
  ON message_templates USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_templates_uso
  ON message_templates(tenant_id, uso_count DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_campanha_status
  ON campaign_jobs(campanha_id, status, ordem);

CREATE INDEX IF NOT EXISTS idx_jobs_pendentes
  ON campaign_jobs(tenant_id, status, proximo_envio_em)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status
  ON campaign_jobs(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_agendado
  ON campaigns(tenant_id, status, scheduled_at)
  WHERE status IN ('scheduled','running','paused');

-- ── 5. RLS ────────────────────────────────────────────────────
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_jobs     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_tenant_isolation"
  ON message_templates FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "campaign_jobs_tenant_isolation"
  ON campaign_jobs FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ── 6. Trigger updated_at em message_templates ────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_templates_updated_at
      BEFORE UPDATE ON message_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── 7. Função RPC para incrementar uso de template ────────────
CREATE OR REPLACE FUNCTION incrementar_uso_template(template_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE message_templates
  SET uso_count = uso_count + 1,
      ultima_vez_usado = NOW()
  WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Comentários ────────────────────────────────────────────
COMMENT ON TABLE message_templates IS
  'Templates reutilizáveis de mensagem com blocos (imagem, texto, CTA). Editável pelo operador.';

COMMENT ON TABLE campaign_jobs IS
  'Fila de jobs individuais para cada destinatário de uma campanha. Processada pelo motor anti-ban.';

COMMENT ON COLUMN campaign_jobs.ordem IS
  'Posição na fila de disparo. Determina a sequência de envio com delays humanizados.';

COMMENT ON COLUMN campaigns.config_antiban IS
  'Configuração do motor anti-ban: delays, cooloff, janela horária. Imutável após início do disparo.';

COMMENT ON COLUMN campaigns.blocos_snapshot IS
  'Snapshot dos blocos do template no momento do disparo. Preservado mesmo se o template for editado depois.';
