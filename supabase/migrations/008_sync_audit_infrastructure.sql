-- =====================================================
-- VEXX CRM 2.0 — Migração 008: Infraestrutura de Sync, Auditoria e Reconciliação
-- =====================================================
-- Tabelas: sync_executions, sync_checkpoints, sync_divergences, orphaned_orders, background_jobs
-- Funções: update_sync_execution_progress, detect_orphaned_orders, acquire_next_job
-- Triggers: trigger_update_sync_progress
-- Idempotente: pode ser executada múltiplas vezes sem erro
-- =====================================================

-- =====================================================
-- 1. TABELA: sync_executions (Histórico de sincronizações)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id UUID UNIQUE DEFAULT gen_random_uuid(),

  -- Tipo e origem
  sync_type TEXT NOT NULL DEFAULT 'full',
  trigger_source TEXT DEFAULT 'manual',

  -- Configuração usada
  config JSONB DEFAULT '{}'::jsonb,

  -- Status e progresso
  status TEXT DEFAULT 'pending',
  current_phase TEXT,
  progress_percent NUMERIC(5,2) DEFAULT 0,

  -- Estatísticas de registros
  total_pages_processed INTEGER DEFAULT 0,
  total_records_fetched INTEGER DEFAULT 0,
  total_records_inserted INTEGER DEFAULT 0,
  total_records_updated INTEGER DEFAULT 0,
  total_records_skipped INTEGER DEFAULT 0,
  total_records_failed INTEGER DEFAULT 0,

  -- Estatísticas de clientes
  total_clients_created INTEGER DEFAULT 0,
  total_clients_updated INTEGER DEFAULT 0,
  total_clients_matched INTEGER DEFAULT 0,

  -- Performance
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  avg_records_per_second NUMERIC(8,2),

  -- Erros
  errors JSONB DEFAULT '[]'::jsonb,

  -- Resultado da verificação de integridade
  integrity_check JSONB,

  -- Ações recomendadas
  recommended_actions TEXT[],

  -- Metadados
  server_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices (idempotentes com IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_sync_executions_tenant ON sync_executions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_executions_status ON sync_executions(status);
CREATE INDEX IF NOT EXISTS idx_sync_executions_type ON sync_executions(sync_type, created_at DESC);

-- =====================================================
-- 2. TABELA: sync_checkpoints (Retomada após falha)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES sync_executions(execution_id) ON DELETE CASCADE,

  -- Ponto de retomada
  checkpoint_type TEXT DEFAULT 'page_completed',
  last_successful_page INTEGER,
  last_successful_record_id TEXT,

  -- Estado para retomada
  resume_state JSONB,

  -- Métricas no checkpoint
  records_processed_so_far INTEGER DEFAULT 0,
  errors_count_so_far INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_execution ON sync_checkpoints(execution_id, created_at DESC);

-- =====================================================
-- 3. TABELA: sync_divergences (Divergências detectadas)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_divergences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES sync_executions(execution_id),

  -- Tipo e severidade
  divergence_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',

  -- Registro afetado
  external_id TEXT,
  internal_id UUID,
  entity_type TEXT DEFAULT 'order',

  -- Detalhes
  expected_value JSONB,
  actual_value JSONB,
  difference JSONB,

  -- Resolução
  status TEXT DEFAULT 'open',
  resolution_action TEXT,
  resolved_at TIMESTAMPTZ,

  -- Auto-fix
  auto_fix_attempted BOOLEAN DEFAULT false,
  auto_fix_successful BOOLEAN,
  auto_fix_details JSONB,

  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divergences_tenant ON sync_divergences(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_divergences_type ON sync_divergences(divergence_type, severity);
CREATE INDEX IF NOT EXISTS idx_divergences_open ON sync_divergences(status) WHERE status = 'open';

-- =====================================================
-- 4. TABELA: orphaned_orders (Pedidos sem client_id)
-- =====================================================
CREATE TABLE IF NOT EXISTS orphaned_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  external_id TEXT,

  -- Dados do cliente extraídos do metadata
  customer_data JSONB,

  -- Tentativas de vinculação
  link_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  link_failure_reason TEXT,

  -- Resolução
  status TEXT DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  linked_client_id UUID REFERENCES clients(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orphaned_tenant ON orphaned_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orphaned_pending ON orphaned_orders(status) WHERE status = 'pending';

-- =====================================================
-- 5. TABELA: background_jobs (Fila de processamento)
-- =====================================================
CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  job_id UUID UNIQUE DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,

  priority INTEGER DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Agendamento
  scheduled_for TIMESTAMPTZ DEFAULT now(),

  -- Execução
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Retry
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  retry_delay_seconds INTEGER DEFAULT 60,
  last_error TEXT,

  -- Worker
  worker_id TEXT,
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,

  -- Resultado
  result JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON background_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON background_jobs(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_locked ON background_jobs(locked_at) WHERE status = 'running';

-- =====================================================
-- 6. FUNÇÕES
-- =====================================================

-- Função: Atualizar progresso da execução automaticamente
CREATE OR REPLACE FUNCTION update_sync_execution_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular progresso
  NEW.progress_percent := CASE
    WHEN NEW.total_records_fetched > 0 THEN
      LEAST(100, ((NEW.total_records_inserted + NEW.total_records_updated + NEW.total_records_skipped)::NUMERIC
       / NEW.total_records_fetched * 100))
    ELSE 0
  END;

  -- Calcular duração se completado
  IF NEW.status IN ('completed', 'failed', 'partial') AND NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INTEGER;

    IF NEW.duration_seconds > 0 THEN
      NEW.avg_records_per_second :=
        (NEW.total_records_inserted + NEW.total_records_updated)::NUMERIC / NEW.duration_seconds;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger (idempotente)
DROP TRIGGER IF EXISTS trigger_update_sync_progress ON sync_executions;
CREATE TRIGGER trigger_update_sync_progress
BEFORE UPDATE ON sync_executions
FOR EACH ROW
EXECUTE FUNCTION update_sync_execution_progress();

-- Função: Detectar pedidos órfãos e registrar
CREATE OR REPLACE FUNCTION detect_orphaned_orders(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO orphaned_orders (tenant_id, order_id, external_id, customer_data)
  SELECT
    p_tenant_id,
    o.id,
    o.external_id,
    jsonb_build_object(
      'nome', o.metadata->>'cliente_nome',
      'telefone', o.metadata->>'cliente_telefone',
      'whatsapp', o.metadata->>'cliente_whatsapp',
      'email', o.metadata->>'cliente_email',
      'cpf', o.metadata->>'cliente_cpf_cnpj',
      'facilzap_id', o.metadata->>'cliente_id_facilzap'
    )
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.client_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM orphaned_orders oo
      WHERE oo.order_id = o.id AND oo.status NOT IN ('failed')
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Função: Adquirir próximo job da fila (com lock)
CREATE OR REPLACE FUNCTION acquire_next_job(
  p_worker_id TEXT,
  p_lock_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  job_id UUID,
  tenant_id UUID,
  job_type TEXT,
  payload JSONB,
  retry_count INTEGER,
  max_retries INTEGER,
  retry_delay_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE background_jobs bj
  SET
    status = 'running',
    started_at = now(),
    worker_id = p_worker_id,
    locked_at = now(),
    lock_expires_at = now() + (p_lock_duration_minutes || ' minutes')::INTERVAL,
    updated_at = now()
  WHERE bj.id = (
    SELECT bj2.id FROM background_jobs bj2
    WHERE bj2.status = 'pending'
      AND bj2.scheduled_for <= now()
    ORDER BY bj2.priority DESC, bj2.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING
    bj.job_id,
    bj.tenant_id,
    bj.job_type,
    bj.payload,
    bj.retry_count,
    bj.max_retries,
    bj.retry_delay_seconds;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. RLS POLICIES (idempotente)
-- =====================================================
ALTER TABLE sync_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_divergences ENABLE ROW LEVEL SECURITY;
ALTER TABLE orphaned_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

-- sync_executions
DROP POLICY IF EXISTS sync_executions_tenant ON sync_executions;
CREATE POLICY sync_executions_tenant ON sync_executions
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- sync_divergences
DROP POLICY IF EXISTS sync_divergences_tenant ON sync_divergences;
CREATE POLICY sync_divergences_tenant ON sync_divergences
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- orphaned_orders
DROP POLICY IF EXISTS orphaned_orders_tenant ON orphaned_orders;
CREATE POLICY orphaned_orders_tenant ON orphaned_orders
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- background_jobs
DROP POLICY IF EXISTS background_jobs_tenant ON background_jobs;
CREATE POLICY background_jobs_tenant ON background_jobs
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- sync_checkpoints (via join com sync_executions)
DROP POLICY IF EXISTS sync_checkpoints_tenant ON sync_checkpoints;
CREATE POLICY sync_checkpoints_tenant ON sync_checkpoints
  USING (execution_id IN (
    SELECT execution_id FROM sync_executions
    WHERE tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  ));

-- =====================================================
-- 8. TABELA sync_audit_log: garantir que existe (usada pelo sync-logger.ts)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_secs INTEGER,
  pages_processed INTEGER DEFAULT 0,
  api_total_records INTEGER,
  records_imported INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_new INTEGER DEFAULT 0,
  records_duplicated INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  integrity_ok BOOLEAN,
  divergence_found BOOLEAN DEFAULT false,
  coverage_percent NUMERIC(6,2),
  date_from TEXT,
  date_to TEXT,
  page_from INTEGER,
  page_to INTEGER,
  errors JSONB,
  warnings JSONB,
  config_used JSONB,
  needs_manual BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_log_tenant ON sync_audit_log(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_status ON sync_audit_log(status);

ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_audit_log_tenant ON sync_audit_log;
CREATE POLICY sync_audit_log_tenant ON sync_audit_log
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- =====================================================
-- DONE
-- =====================================================
