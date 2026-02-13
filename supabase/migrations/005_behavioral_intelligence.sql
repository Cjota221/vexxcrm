-- ============================================================
-- VEXX CRM 2.0 — Behavioral Intelligence Foundation
-- Migration: 005_behavioral_intelligence.sql
-- ============================================================
-- Fundação de IA comportamental: RFM, eventos, predições,
-- audit log de sync e feedback loop de ML.
-- Adaptado ao schema real: clients (UUID), orders (UUID), tenant_id.
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. EXTENSÕES DE CLIENTS PARA IA (colunas novas)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Métricas RFM
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_recency    INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_frequency  INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_monetary   INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_score      VARCHAR(3);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_segment    VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfm_calculated_at TIMESTAMPTZ;

-- Previsões e Tendências
ALTER TABLE clients ADD COLUMN IF NOT EXISTS expected_frequency   DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_purchase_at     TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS purchase_prob_30d    DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS churn_probability    DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS expected_next_ticket DECIMAL(12,2);

-- Padrões Comportamentais
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_weekday   INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_hour      INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_channel   VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_payment   VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_category  VARCHAR(100);

-- LTV Projetado
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ltv_projected_12m   DECIMAL(12,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ltv_projected_life  DECIMAL(12,2);

-- Engajamento
ALTER TABLE clients ADD COLUMN IF NOT EXISTS response_rate       DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avg_response_min    INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_interaction_at  TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_interactions   INTEGER DEFAULT 0;

-- Sentimento
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sentiment_general   VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nps_estimated       INTEGER;

-- Flags de IA
ALTER TABLE clients ADD COLUMN IF NOT EXISTS flag_needs_attention BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS flag_auto_vip       BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS flag_churn_risk     BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS flag_upsell_ready   BOOLEAN DEFAULT false;

-- Metadados de IA
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_model_version    VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_confidence       DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_last_trained_at  TIMESTAMPTZ;

-- Índices para performance de IA
CREATE INDEX IF NOT EXISTS idx_clients_rfm_score     ON clients(rfm_score);
CREATE INDEX IF NOT EXISTS idx_clients_rfm_segment   ON clients(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_clients_next_purchase  ON clients(next_purchase_at);
CREATE INDEX IF NOT EXISTS idx_clients_churn_prob     ON clients(churn_probability);
CREATE INDEX IF NOT EXISTS idx_clients_needs_attention ON clients(flag_needs_attention) WHERE flag_needs_attention = true;
CREATE INDEX IF NOT EXISTS idx_clients_churn_risk     ON clients(flag_churn_risk) WHERE flag_churn_risk = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. TABELA DE EVENTOS COMPORTAMENTAIS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS behavioral_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Tipo do evento
  event_type VARCHAR(50) NOT NULL,        -- 'purchase','message_sent','message_received','cart_abandoned','campaign_sent'
  category   VARCHAR(30),                  -- 'transaction','communication','navigation','support'

  -- Dados
  data           JSONB,
  monetary_value DECIMAL(12,2),
  product_ids    UUID[],

  -- Contexto
  channel        VARCHAR(20),              -- 'whatsapp','email','website'
  source         VARCHAR(50),              -- 'organic','campaign','manual'

  -- Resultado
  outcome        VARCHAR(50),              -- 'sale','reply','ignored','complaint','praise'
  is_conversion  BOOLEAN DEFAULT false,
  attributed_revenue DECIMAL(12,2),

  -- Sentimento (NLP)
  sentiment       VARCHAR(20),
  sentiment_score DECIMAL(5,2),
  keywords        TEXT[],

  -- Rastreamento
  campaign_id  UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  agent_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id   VARCHAR(100),

  -- Timestamps
  occurred_at   TIMESTAMPTZ DEFAULT now(),
  processed_at  TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bevents_tenant    ON behavioral_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bevents_client    ON behavioral_events(client_id);
CREATE INDEX IF NOT EXISTS idx_bevents_type      ON behavioral_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bevents_occurred   ON behavioral_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bevents_conversion ON behavioral_events(is_conversion) WHERE is_conversion = true;
CREATE INDEX IF NOT EXISTS idx_bevents_campaign   ON behavioral_events(campaign_id) WHERE campaign_id IS NOT NULL;

-- RLS
ALTER TABLE behavioral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "behavioral_events_tenant_isolation" ON behavioral_events
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. HISTÓRICO RFM
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS rfm_history (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Scores
  rfm_recency    INTEGER NOT NULL,
  rfm_frequency  INTEGER NOT NULL,
  rfm_monetary   INTEGER NOT NULL,
  rfm_score      VARCHAR(3) NOT NULL,
  rfm_segment    VARCHAR(50) NOT NULL,

  -- Métricas base
  days_since_purchase INTEGER,
  total_orders        INTEGER,
  total_spent         DECIMAL(12,2),
  avg_ticket          DECIMAL(12,2),

  -- Mudanças
  previous_segment VARCHAR(50),
  segment_changed  BOOLEAN DEFAULT false,
  change_direction VARCHAR(10),          -- 'upgrade','downgrade','stable'

  -- Auditoria
  algorithm_version VARCHAR(20),
  params_used       JSONB,

  calculated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfm_hist_client ON rfm_history(client_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfm_hist_segment ON rfm_history(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_rfm_hist_changed ON rfm_history(segment_changed) WHERE segment_changed = true;

ALTER TABLE rfm_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfm_history_tenant_isolation" ON rfm_history
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. LOG DE PREDIÇÕES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS predictions_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Tipo
  prediction_type VARCHAR(50) NOT NULL,   -- 'next_purchase','churn','ltv','product_interest'

  -- Valores
  predicted_value JSONB NOT NULL,
  confidence      DECIMAL(5,2),

  -- Validação
  actual_value     JSONB,
  prediction_correct BOOLEAN,
  absolute_error   DECIMAL(12,2),

  -- Contexto
  features_used    JSONB,
  model_id         VARCHAR(100),
  model_version    VARCHAR(20),

  -- Ação
  recommended_action TEXT,
  action_executed    BOOLEAN DEFAULT false,
  action_outcome     VARCHAR(50),

  -- Timestamps
  predicted_at  TIMESTAMPTZ DEFAULT now(),
  validated_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_predictions_client ON predictions_log(client_id);
CREATE INDEX IF NOT EXISTS idx_predictions_type   ON predictions_log(prediction_type);

ALTER TABLE predictions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_log_tenant_isolation" ON predictions_log
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. AUDIT LOG DE SINCRONIZAÇÃO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS sync_audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_id    UUID DEFAULT uuid_generate_v4(),

  -- Tipo
  sync_type  VARCHAR(20) NOT NULL,        -- 'incremental','deep','full'
  source     VARCHAR(50) NOT NULL,        -- 'facilzap','evolution','manual'

  -- Timing
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_secs INTEGER,

  -- Contadores
  pages_processed     INTEGER DEFAULT 0,
  api_total_records   INTEGER,
  records_imported    INTEGER DEFAULT 0,
  records_updated     INTEGER DEFAULT 0,
  records_new         INTEGER DEFAULT 0,
  records_duplicated  INTEGER DEFAULT 0,
  total_errors        INTEGER DEFAULT 0,

  -- Integridade
  integrity_ok         BOOLEAN,
  divergence_found     BOOLEAN DEFAULT false,
  coverage_percent     DECIMAL(5,2),

  -- Faixas
  date_from   DATE,
  date_to     DATE,
  page_from   INTEGER,
  page_to     INTEGER,

  -- Diagnóstico
  errors       JSONB,
  warnings     JSONB,
  deep_sync_triggered BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(20) DEFAULT 'running',  -- 'running','success','error','partial'

  -- Config
  config_used  JSONB,
  next_sync_at TIMESTAMPTZ,
  needs_manual BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_tenant ON sync_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_status ON sync_audit_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_audit_started ON sync_audit_log(started_at DESC);

ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_audit_log_tenant_isolation" ON sync_audit_log
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. ML FEEDBACK LOOP
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS ml_feedback (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Decisão
  decision_type  VARCHAR(50) NOT NULL,    -- 'campaign_send','product_recommend','rfm_classify'
  features       JSONB NOT NULL,
  action_taken   VARCHAR(100),
  action_params  JSONB,

  -- Resultado
  expected_outcome VARCHAR(50),
  actual_outcome   VARCHAR(50),
  success          BOOLEAN,
  performance      DECIMAL(10,4),

  -- Reinforcement
  reward DECIMAL(10,2),

  -- Timestamps
  decided_at  TIMESTAMPTZ DEFAULT now(),
  observed_at TIMESTAMPTZ,

  -- Treinamento
  used_in_training BOOLEAN DEFAULT false,
  training_batch   INTEGER,

  -- Modelo
  model_id          VARCHAR(100),
  decision_confidence DECIMAL(5,2)
);

CREATE INDEX IF NOT EXISTS idx_ml_feedback_client  ON ml_feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_type    ON ml_feedback(decision_type);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_success ON ml_feedback(success);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_untrained ON ml_feedback(used_in_training) WHERE used_in_training = false;

ALTER TABLE ml_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ml_feedback_tenant_isolation" ON ml_feedback
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
