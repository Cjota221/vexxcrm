-- ============================================================
-- VEXX CRM 2.0 — Migration 007: Contact Center + Sentinela Anne v3
-- ============================================================
-- Adiciona: Departamentos, Filas, Quick Actions, Mensagens Agendadas,
--           Sentinela Análises, Cupons IA, Learning Log
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. DEPARTAMENTOS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'building',

  -- Distribuição
  distribution_mode TEXT DEFAULT 'manual'
    CHECK (distribution_mode IN ('manual', 'round_robin', 'least_busy', 'skill_based')),

  -- SLA (segundos)
  sla_first_response INTEGER DEFAULT 300,   -- 5 min
  sla_resolution INTEGER DEFAULT 86400,     -- 24h

  -- Horário de funcionamento
  business_hours JSONB DEFAULT '{"mon":{"start":"08:00","end":"18:00"},"tue":{"start":"08:00","end":"18:00"},"wed":{"start":"08:00","end":"18:00"},"thu":{"start":"08:00","end":"18:00"},"fri":{"start":"08:00","end":"18:00"}}',

  -- Mensagens automáticas
  welcome_message TEXT,
  away_message TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. FILAS DE ATENDIMENTO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366F1',
  icon VARCHAR(50) DEFAULT 'inbox',

  -- Tipo e prioridade
  type TEXT DEFAULT 'general'
    CHECK (type IN ('general', 'vip', 'urgent', 'post_sale', 'recovery')),
  priority_level INTEGER DEFAULT 0,  -- 0=normal, 1=alta, 2=urgente

  -- Distribuição
  distribution_mode TEXT DEFAULT 'manual'
    CHECK (distribution_mode IN ('manual', 'round_robin', 'least_busy', 'skill_based')),
  auto_assign BOOLEAN DEFAULT false,

  -- Escalação
  max_wait_seconds INTEGER DEFAULT 600,
  escalate_to_queue_id UUID REFERENCES queues(id),

  -- Critérios de entrada automática
  entry_criteria JSONB DEFAULT '{}',

  -- Capacidade
  max_concurrent INTEGER,

  -- Mensagens automáticas
  entry_message TEXT,
  assignment_message TEXT,
  away_message TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  accepting_new BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_queues_tenant ON queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queues_active ON queues(is_active) WHERE is_active = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. ATRIBUIÇÃO AGENTE → FILA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS agent_queues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,

  priority INTEGER DEFAULT 0,
  max_concurrent INTEGER DEFAULT 5,
  expertise_level INTEGER DEFAULT 1 CHECK (expertise_level BETWEEN 1 AND 5),

  is_active BOOLEAN DEFAULT true,
  accepting_new BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(profile_id, queue_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_queues_profile ON agent_queues(profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_queues_queue ON agent_queues(queue_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. EXPANSÃO DA TABELA conversations
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_seconds INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolution_seconds INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transfer_history JSONB DEFAULT '[]';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entered_queue_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS follow_up_message TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_queue ON conversations(queue_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(tenant_id, priority DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. EXPANSÃO DA TABELA profiles (campos de agente)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepting_chats BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_concurrent_chats INTEGER DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_chats_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. QUICK ACTIONS (Ações Rápidas)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS quick_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(7),

  -- Tipo
  type TEXT NOT NULL CHECK (type IN (
    'send_message', 'send_product', 'apply_tag',
    'transfer_queue', 'schedule_followup', 'create_coupon'
  )),

  -- Config da ação
  config JSONB NOT NULL DEFAULT '{}',

  -- Permissões
  allowed_roles TEXT[] DEFAULT '{owner,admin,agent}',

  -- Atalho
  shortcut VARCHAR(30),

  -- Ordem
  sort_order INTEGER DEFAULT 0,
  category VARCHAR(50) DEFAULT 'general',

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_quick_actions_tenant ON quick_actions(tenant_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. MENSAGENS AGENDADAS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  conversation_id UUID REFERENCES conversations(id),
  destination_phone TEXT NOT NULL,

  -- Conteúdo
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'template')),
  content TEXT NOT NULL,
  media_url TEXT,

  -- Agendamento
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'America/Sao_Paulo',

  -- Recorrência
  is_recurring BOOLEAN DEFAULT false,
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  next_execution TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  error_message TEXT,

  -- Quem criou
  created_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled_messages(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_client ON scheduled_messages(client_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. SENTINELA ANÁLISES (Anne v3)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS sentinela_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Tipo
  analysis_type TEXT NOT NULL CHECK (analysis_type IN (
    'full_diagnostic', 'reactivation', 'cross_sell',
    'churn_alert', 'seasonal_opportunity', 'vip_risk'
  )),

  -- Diagnóstico completo
  diagnostic JSONB NOT NULL DEFAULT '{}',
  -- Estrutura: { status, urgency, priority_score, factors[], preferences, patterns, alerts[], opportunities[] }

  -- Recomendações
  recommendations JSONB NOT NULL DEFAULT '[]',

  -- Mensagens sugeridas
  suggested_messages JSONB DEFAULT '[]',

  -- Produtos recomendados
  recommended_products JSONB DEFAULT '[]',

  -- Execução
  execution_status TEXT DEFAULT 'pending'
    CHECK (execution_status IN ('pending', 'approved', 'sent', 'ignored', 'expired')),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Resultado
  result TEXT CHECK (result IN ('converted', 'responded', 'ignored', 'error')),
  generated_order_id UUID REFERENCES orders(id),
  generated_order_value DECIMAL(12,2),
  real_roi DECIMAL(12,2),

  -- Confiança
  confidence_score DECIMAL(5,2) DEFAULT 50,
  model_version TEXT DEFAULT 'v3.0',
  processing_time_ms INTEGER,

  -- Validade
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinela_tenant ON sentinela_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sentinela_client ON sentinela_analyses(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentinela_status ON sentinela_analyses(execution_status);
CREATE INDEX IF NOT EXISTS idx_sentinela_pending ON sentinela_analyses(execution_status, expires_at)
  WHERE execution_status = 'pending';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. SENTINELA REGRAS (Configuráveis por tenant)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS sentinela_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,

  -- Tipo
  type TEXT NOT NULL CHECK (type IN ('churn_detection', 'sales_opportunity', 'personalization', 'alert')),

  -- Condições de ativação (JSONB)
  conditions JSONB NOT NULL DEFAULT '{}',
  -- Ex: { "days_inactive_min": 30, "ltv_min": 200, "rfm_segments": ["At Risk"] }

  -- Ações automáticas
  auto_actions JSONB DEFAULT '{"create_analysis": true, "auto_send": false, "notify_team": true}',

  -- Frequência
  max_executions_per_client INTEGER DEFAULT 1,
  interval_days INTEGER DEFAULT 30,
  priority_level INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_test_mode BOOLEAN DEFAULT false,

  -- Performance
  total_executions INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  avg_roi DECIMAL(12,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_rules_tenant ON sentinela_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_active ON sentinela_rules(is_active) WHERE is_active = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. LEARNING LOG (Aprendizado Contínuo)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS sentinela_learning_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES sentinela_analyses(id),

  decision_type TEXT,
  features_input JSONB,
  prediction JSONB,
  actual_result JSONB,

  was_correct BOOLEAN,
  absolute_error DECIMAL(12,2),

  user_feedback TEXT CHECK (user_feedback IN ('useful', 'not_useful', 'incorrect')),
  user_comment TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_tenant ON sentinela_learning_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_analysis ON sentinela_learning_log(analysis_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 11. CUPONS GERADOS PELA ANNE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS sentinela_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES sentinela_analyses(id),
  client_id UUID REFERENCES clients(id),

  code VARCHAR(50) UNIQUE NOT NULL,

  -- Desconto
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
  discount_value DECIMAL(12,2) NOT NULL,

  -- Restrições
  min_order_value DECIMAL(12,2),
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,

  -- Personalização
  is_personalized BOOLEAN DEFAULT true,
  generation_reason TEXT,

  -- Validade
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_used BOOLEAN DEFAULT false,

  -- Resultado
  generated_order_id UUID REFERENCES orders(id),
  order_value DECIMAL(12,2),
  discount_applied DECIMAL(12,2),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON sentinela_coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_client ON sentinela_coupons(client_id);
CREATE INDEX IF NOT EXISTS idx_coupons_valid ON sentinela_coupons(valid_until) WHERE is_active = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 12. EXPANSÃO DA TABELA products (quick send no chat)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE products ADD COLUMN IF NOT EXISTS quick_send_enabled BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS chat_template TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS chat_send_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS chat_conversion_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS chat_conversion_rate DECIMAL(5,2) DEFAULT 0;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS para novas tabelas
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_learning_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_coupons ENABLE ROW LEVEL SECURITY;

-- Policies (DROP antes para idempotência)
DROP POLICY IF EXISTS "departments_tenant" ON departments;
CREATE POLICY "departments_tenant" ON departments FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "queues_tenant" ON queues;
CREATE POLICY "queues_tenant" ON queues FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "agent_queues_tenant" ON agent_queues;
CREATE POLICY "agent_queues_tenant" ON agent_queues FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "quick_actions_tenant" ON quick_actions;
CREATE POLICY "quick_actions_tenant" ON quick_actions FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "scheduled_messages_tenant" ON scheduled_messages;
CREATE POLICY "scheduled_messages_tenant" ON scheduled_messages FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "sentinela_analyses_tenant" ON sentinela_analyses;
CREATE POLICY "sentinela_analyses_tenant" ON sentinela_analyses FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "sentinela_rules_tenant" ON sentinela_rules;
CREATE POLICY "sentinela_rules_tenant" ON sentinela_rules FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "sentinela_learning_tenant" ON sentinela_learning_log;
CREATE POLICY "sentinela_learning_tenant" ON sentinela_learning_log FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "sentinela_coupons_tenant" ON sentinela_coupons;
CREATE POLICY "sentinela_coupons_tenant" ON sentinela_coupons FOR ALL USING (tenant_id = public.get_tenant_id());

-- Triggers updated_at (DROP + CREATE para idempotência)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'departments', 'queues', 'scheduled_messages',
    'sentinela_analyses', 'sentinela_rules'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 13. FUNÇÕES AUXILIARES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Gerar código de cupom único
CREATE OR REPLACE FUNCTION generate_coupon_code()
RETURNS VARCHAR AS $$
DECLARE
  v_code VARCHAR(50);
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'ANNE' || UPPER(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM sentinela_coupons WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Transferir conversa
CREATE OR REPLACE FUNCTION transfer_conversation(
  p_conversation_id UUID,
  p_to_profile_id UUID DEFAULT NULL,
  p_to_queue_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_conv RECORD;
  v_history JSONB;
BEGIN
  SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_history := jsonb_build_object(
    'from_profile_id', v_conv.assigned_to,
    'to_profile_id', p_to_profile_id,
    'from_queue_id', v_conv.queue_id,
    'to_queue_id', p_to_queue_id,
    'reason', p_reason,
    'timestamp', now()
  );

  UPDATE conversations SET
    assigned_to = COALESCE(p_to_profile_id, assigned_to),
    queue_id = COALESCE(p_to_queue_id, queue_id),
    status = CASE WHEN p_to_profile_id IS NOT NULL THEN 'open' ELSE 'waiting' END,
    transfer_history = COALESCE(transfer_history, '[]'::jsonb) || v_history,
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;
