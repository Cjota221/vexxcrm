-- ══════════════════════════════════════════════════════════════
-- Migration 016 — Anne OS v5.0 · Sistema Multi-Agente Autônomo
-- Tabelas: anne_agents, anne_logs_v2, anne_handovers
-- Colunas: clients.tier, clients.ltv_tier, chats.automacao_suspensa
-- ══════════════════════════════════════════════════════════════

-- ── 1. Agentes especialistas com base de conhecimento isolada ─
CREATE TABLE IF NOT EXISTS anne_agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  slug            text NOT NULL,     -- 'comercial' | 'logistica' | 'faq' | 'triagem'
  name            text NOT NULL,
  description     text,
  enabled         boolean NOT NULL DEFAULT true,

  -- Base de conhecimento isolada (editável pelo operador)
  knowledge_base  text,              -- texto livre colado pelo operador
  knowledge_tokens int DEFAULT 0,   -- contador de tokens estimado

  -- Prompt do agente (não editável pelo usuário comum)
  system_prompt   text,

  -- Estatísticas
  executions_total   int NOT NULL DEFAULT 0,
  executions_today   int NOT NULL DEFAULT 0,
  last_executed_at   timestamptz,
  avg_latency_ms     int DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, slug)
);

-- ── 2. Log de execução completo v2 (Anne OS v5) ───────────────
CREATE TABLE IF NOT EXISTS anne_logs_v2 (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES clients(id) ON DELETE SET NULL,
  chat_id                 text,

  -- Classificação do evento
  tipo                    text NOT NULL,  -- 'silenciosa' | 'ativa' | 'handover' | 'erro'
  agente_executor         text NOT NULL,  -- 'anne_central' | 'agente_comercial' | etc.
  gatilho_ativado         text,
  confianca_classificacao numeric(4,3),   -- 0.000 a 1.000

  -- Ações executadas (array de objetos)
  acoes_executadas        jsonb DEFAULT '[]',

  -- Mensagem enviada (se houver)
  mensagem_enviada        text,

  -- Performance
  duracao_total_ms        int,
  requer_revisao          boolean NOT NULL DEFAULT false,

  -- Chain of thought
  chain_of_thought        text[],

  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Handovers — registros de crise transferidos ────────────
CREATE TABLE IF NOT EXISTS anne_handovers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  chat_id         text NOT NULL,

  -- Causa
  motivo          text NOT NULL,          -- texto descritivo
  palavra_gatilho text,                   -- palavra exata que ativou
  tipo_gatilho    text NOT NULL DEFAULT 'keyword',  -- 'keyword' | 'sentiment' | 'system_failure' | 'repetition'
  score_sentimento numeric(4,3),

  -- Dossiê gerado para a vendedora
  dossie          jsonb DEFAULT '{}',     -- { nome, tier, historico_resumido, pedidos_em_aberto, ltv, ... }

  -- Status
  status          text NOT NULL DEFAULT 'aguardando', -- 'aguardando' | 'assumido' | 'resolvido'
  assumido_por    text,                   -- nome da vendedora que assumiu
  assumido_at     timestamptz,
  resolvido_at    timestamptz,

  -- Mensagem de transição enviada ao cliente
  mensagem_transicao text,
  mensagem_enviada_at timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Coluna tier e ltv_tier em clients ──────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'lead';
  -- 'lead' | 'ativo' | 'vip' | 'key_account'

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS canal_venda text;
  -- 'fisico' | 'online' | 'ambos'

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tom_historico text NOT NULL DEFAULT 'neutro';
  -- 'formal' | 'informal' | 'tecnico' | 'neutro'

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tentativas_reativacao int NOT NULL DEFAULT 0;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS onboarding_concluido boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS flags text[] DEFAULT '{}';
  -- ['vip_prioridade', 'historico_reclamacao', 'pagamento_atrasado']

-- ── 5. Coluna automacao_suspensa em chats ─────────────────────
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS automacao_suspensa boolean NOT NULL DEFAULT false;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS automacao_suspensa_motivo text;

-- ── 6. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS anne_agents_tenant_slug_idx
  ON anne_agents(tenant_id, slug);

CREATE INDEX IF NOT EXISTS anne_logs_v2_tenant_created_idx
  ON anne_logs_v2(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS anne_logs_v2_client_idx
  ON anne_logs_v2(tenant_id, client_id);

CREATE INDEX IF NOT EXISTS anne_logs_v2_tipo_idx
  ON anne_logs_v2(tenant_id, tipo);

CREATE INDEX IF NOT EXISTS anne_handovers_tenant_status_idx
  ON anne_handovers(tenant_id, status)
  WHERE status = 'aguardando';

CREATE INDEX IF NOT EXISTS anne_handovers_chat_idx
  ON anne_handovers(tenant_id, chat_id);

-- ── 7. RLS ────────────────────────────────────────────────────
ALTER TABLE anne_agents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anne_logs_v2    ENABLE ROW LEVEL SECURITY;
ALTER TABLE anne_handovers  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anne_agents_tenant_isolation"
  ON anne_agents FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "anne_logs_v2_tenant_isolation"
  ON anne_logs_v2 FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "anne_handovers_tenant_isolation"
  ON anne_handovers FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ── 8. Comentários ────────────────────────────────────────────
COMMENT ON TABLE anne_agents IS
  'Os 4 agentes especialistas da Anne OS v5: comercial, logistica, faq, triagem. Cada um tem base de conhecimento isolada editável pelo operador.';
COMMENT ON TABLE anne_logs_v2 IS
  'Log completo de execução do pipeline Anne OS v5. Cada ação, agente, latência e chain-of-thought são registrados aqui.';
COMMENT ON TABLE anne_handovers IS
  'Registros de transferência para atendimento humano. Inclui dossiê de contexto, causa e status de resolução.';
COMMENT ON COLUMN anne_agents.knowledge_base IS
  'Texto livre editável pelo operador. Cole aqui: tabela de preços, regras de frete, FAQ, etc. Injetado no prompt do agente.';
COMMENT ON COLUMN anne_logs_v2.acoes_executadas IS
  'Array de objetos: [{ acao, endpoint, payload, resultado, latencia_ms }]';
COMMENT ON COLUMN anne_handovers.dossie IS
  'Dossiê completo gerado para a vendedora: { nome, tier, historico_resumido, pedidos_em_aberto, ltv, flag_historico_reclamacao }';
