-- Migration: 035 — Time de IAs (Multi-AI Architecture)
-- Cria tabelas para configuração de provedores, fila de aprovação,
-- copies gerados, histórico de análises e alertas do Sentinela Meta Ads.

-- ─── 1. Configuração de provedores por tenant ────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_provider_config (
  tenant_id TEXT PRIMARY KEY,

  -- ANNE — Atendimento WhatsApp
  auto_reply_provider    TEXT NOT NULL DEFAULT 'groq',   -- groq | openai | anthropic | google
  auto_reply_model       TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  auto_reply_api_key     TEXT,                           -- se null, usa GROQ_API_KEY do servidor

  -- JOSÉ — Analista de métricas (GPT-4o-mini)
  analytics_provider     TEXT NOT NULL DEFAULT 'openai',
  analytics_model        TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  analytics_api_key      TEXT,                           -- se null, usa OPENAI_API_KEY do servidor

  -- CLÁUDIO — Estrategista + Copies (Claude Haiku)
  strategy_provider      TEXT NOT NULL DEFAULT 'anthropic',
  strategy_model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  strategy_api_key       TEXT,                           -- se null, usa ANTHROPIC_API_KEY do servidor

  -- PEDRO — Pesquisador de tendências (Perplexity)
  research_provider      TEXT NOT NULL DEFAULT 'perplexity',
  research_model         TEXT NOT NULL DEFAULT 'llama-3.1-sonar-small-128k-online',
  research_api_key       TEXT,                           -- se null, usa PERPLEXITY_API_KEY do servidor

  -- JUDITE — Avaliação visual de criativos (Google Gemini)
  visual_provider        TEXT NOT NULL DEFAULT 'google',
  visual_model           TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  visual_api_key         TEXT,                           -- se null, usa GEMINI_API_KEY do servidor

  -- Meta Ads (compartilhado por José e Cláudio)
  meta_ad_account_id     TEXT,                           -- act_XXXXXXXXX
  meta_access_token      TEXT,                           -- token 60 dias (criptografar em produção)
  meta_token_expires_at  TIMESTAMPTZ,
  meta_app_id            TEXT DEFAULT '1282233763495572',

  -- Controles de segurança (NUNCA alterar sem solicitação explícita)
  require_approval       BOOLEAN NOT NULL DEFAULT TRUE,
  max_budget_increase_pct NUMERIC NOT NULL DEFAULT 0.30, -- máx 30% de aumento por ação
  pause_roas_threshold   NUMERIC NOT NULL DEFAULT 1.5,   -- pausar se ROAS < 1.5
  scale_roas_threshold   NUMERIC NOT NULL DEFAULT 3.0,   -- escalar se ROAS > 3.0

  -- Feature flags (desligado por padrão até configurar credenciais)
  analysis_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  sentinel_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  research_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  visual_enabled         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Contexto da marca (usado pelo Claude estrategista)
  brand_produto          TEXT,                           -- ex: "rasteirinhas femininas"
  brand_publico          TEXT,                           -- ex: "mulheres 25-45, renda C/B"
  brand_ticket           TEXT,                           -- ex: "R$ 120-350"
  brand_objetivo         TEXT,                           -- ex: "geração de leads para revendedoras"

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Fila de aprovação de ações (REGRA DE OURO: aprovação sempre) ─────────

CREATE TABLE IF NOT EXISTS ai_action_queue (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  agent            TEXT NOT NULL,       -- 'jose' | 'claudio' | 'pedro' | 'judite' | 'sentinela'
  action_type      TEXT NOT NULL,       -- 'pausar_anuncio' | 'escalar_orcamento' | 'criar_copy' | etc
  alvo_id          TEXT,                -- ID do anúncio/campanha no Meta
  alvo_nome        TEXT,
  parametros       JSONB,
  motivo           TEXT NOT NULL,       -- linguagem simples para a operadora
  impacto_esperado TEXT,
  urgencia         TEXT NOT NULL DEFAULT 'proximas_24h', -- 'imediata' | 'proximas_24h' | 'proxima_semana'
  status           TEXT NOT NULL DEFAULT 'pending_approval'
                   CHECK (status IN ('pending_approval','approved','rejected','executed','failed')),
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  executed_at      TIMESTAMPTZ,
  error_message    TEXT,
  analysis_run_id  UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Copies gerados pelo Cláudio ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_generated_copies (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  headline            TEXT NOT NULL,        -- máx 40 chars
  texto_principal     TEXT NOT NULL,        -- máx 125 chars
  cta                 TEXT NOT NULL,        -- ex: "Comprar agora"
  publico_sugerido    TEXT,
  para_substituir_id  TEXT,                 -- ad_id no Meta que será substituído
  justificativa       TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','approved','used','discarded')),
  analysis_run_id     UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Histórico de análises ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_analysis_runs (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  date_range         TEXT NOT NULL DEFAULT 'last_7d',
  metrics_snapshot   JSONB,                  -- dados brutos do Meta
  analyst_output     JSONB,                  -- análise do José (GPT-4o-mini)
  strategist_output  JSONB,                  -- estratégia do Cláudio (Claude)
  researcher_output  JSONB,                  -- tendências do Pedro (Perplexity)
  actions_generated  INTEGER NOT NULL DEFAULT 0,
  copies_generated   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('running','completed','failed')),
  error_message      TEXT,
  duration_ms        INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Alertas do Sentinela (monitoramento 24/7) ───────────────────────────

CREATE TABLE IF NOT EXISTS sentinela_meta_alerts (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  tipo                  TEXT NOT NULL,  -- 'gasto_alto' | 'roas_baixo' | 'ctr_baixo' | 'budget_proximo' | 'erro_api'
  severidade            TEXT NOT NULL DEFAULT 'media'
                        CHECK (severidade IN ('critica','alta','media','baixa')),
  descricao             TEXT NOT NULL,  -- linguagem simples
  campaign_id           TEXT,
  campaign_name         TEXT,
  dados                 JSONB,
  notificado_whatsapp   BOOLEAN NOT NULL DEFAULT FALSE,
  resolvido             BOOLEAN NOT NULL DEFAULT FALSE,
  resolvido_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. Avaliações da Judite (criativos visuais) ────────────────────────────

CREATE TABLE IF NOT EXISTS ai_visual_evaluations (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  ad_id             TEXT,               -- ad_id no Meta (se aplicável)
  ad_name           TEXT,
  image_url         TEXT NOT NULL,
  nota              INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 10),
  pontos_positivos  TEXT[],
  pontos_negativos  TEXT[],
  sugestoes         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','reviewed','discarded')),
  analysis_run_id   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. Índices ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_action_queue_tenant_status') THEN
    CREATE INDEX idx_ai_action_queue_tenant_status
      ON ai_action_queue (tenant_id, status, created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_action_queue_run') THEN
    CREATE INDEX idx_ai_action_queue_run
      ON ai_action_queue (analysis_run_id)
      WHERE analysis_run_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sentinela_meta_alerts_tenant') THEN
    CREATE INDEX idx_sentinela_meta_alerts_tenant
      ON sentinela_meta_alerts (tenant_id, resolvido, created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_analysis_runs_tenant') THEN
    CREATE INDEX idx_ai_analysis_runs_tenant
      ON ai_analysis_runs (tenant_id, created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_generated_copies_tenant') THEN
    CREATE INDEX idx_ai_generated_copies_tenant
      ON ai_generated_copies (tenant_id, status, created_at DESC);
  END IF;
END $$;

-- ─── 8. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE ai_provider_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_queue          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generated_copies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_meta_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visual_evaluations    ENABLE ROW LEVEL SECURITY;

-- Policies: service_role bypass (já implícito) + tenant isolation via profiles
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'ai_provider_config','ai_action_queue','ai_generated_copies',
    'ai_analysis_runs','sentinela_meta_alerts','ai_visual_evaluations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_tenant_isolation" ON %s',
      t, t
    );
  END LOOP;
END $$;

CREATE POLICY "ai_provider_config_tenant_isolation" ON ai_provider_config
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "ai_action_queue_tenant_isolation" ON ai_action_queue
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "ai_generated_copies_tenant_isolation" ON ai_generated_copies
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "ai_analysis_runs_tenant_isolation" ON ai_analysis_runs
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "sentinela_meta_alerts_tenant_isolation" ON sentinela_meta_alerts
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "ai_visual_evaluations_tenant_isolation" ON ai_visual_evaluations
  FOR ALL USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );
