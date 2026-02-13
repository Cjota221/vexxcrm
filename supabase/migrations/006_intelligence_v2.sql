-- ============================================================
-- VEXX CRM 2.0 — Intelligence v2: Seasonal + Product + Sales
-- Migration: 006_intelligence_v2.sql
-- ============================================================
-- Extensões de IA: análise sazonal, inteligência de produto,
-- afinidade, tendências e preferências de grade.
-- Complementa migration 005 (RFM/behavioral_events).
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. EVENTOS SAZONAIS (calendário de datas comerciais)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS seasonal_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name        VARCHAR(100) NOT NULL,          -- 'Dia das Mães', 'Black Friday', 'Natal'
  slug        VARCHAR(50) NOT NULL,           -- 'dia_maes', 'black_friday', 'natal'
  event_type  VARCHAR(30) DEFAULT 'seasonal', -- 'seasonal','promotional','custom'

  -- Período do evento
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  warmup_days INTEGER DEFAULT 14,             -- dias antes para começar prep

  -- Performance histórica
  total_revenue     DECIMAL(14,2) DEFAULT 0,
  total_orders      INTEGER DEFAULT 0,
  avg_ticket        DECIMAL(12,2) DEFAULT 0,
  conversion_rate   DECIMAL(5,2) DEFAULT 0,
  top_products      JSONB DEFAULT '[]',       -- [{product_id, name, qty, revenue}]
  top_categories    JSONB DEFAULT '[]',       -- [{category, qty, revenue}]

  -- Comparação YoY
  revenue_prev_year    DECIMAL(14,2),
  growth_rate_pct      DECIMAL(5,2),

  -- Segmentos que mais compraram
  top_segments      JSONB DEFAULT '[]',       -- [{segment, count, revenue}]

  -- Status
  is_active   BOOLEAN DEFAULT true,
  year        INTEGER NOT NULL,

  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seasonal_tenant ON seasonal_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_dates ON seasonal_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_seasonal_slug ON seasonal_events(tenant_id, slug, year);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasonal_unique ON seasonal_events(tenant_id, slug, year);

ALTER TABLE seasonal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasonal_events_tenant_isolation" ON seasonal_events
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. PERFIL SAZONAL DO CLIENTE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS client_seasonal_profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Padrões de compra por estação
  buys_dia_maes       BOOLEAN DEFAULT false,
  buys_dia_namorados  BOOLEAN DEFAULT false,
  buys_dia_pais       BOOLEAN DEFAULT false,
  buys_black_friday   BOOLEAN DEFAULT false,
  buys_natal          BOOLEAN DEFAULT false,
  buys_ano_novo       BOOLEAN DEFAULT false,

  -- Métricas sazonais agregadas
  seasonal_events_count    INTEGER DEFAULT 0,
  seasonal_total_spent     DECIMAL(14,2) DEFAULT 0,
  seasonal_avg_ticket      DECIMAL(12,2) DEFAULT 0,
  seasonal_recency_days    INTEGER,                   -- dias desde última compra sazonal
  preferred_season         VARCHAR(50),               -- 'dia_maes','black_friday', etc.

  -- Score sazonal (0-100)
  seasonal_score           DECIMAL(5,2) DEFAULT 0,

  -- Histórico detalhado
  history JSONB DEFAULT '{}',  -- {dia_maes: [{year, orders, spent}], ...}

  calculated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_csprofiles_client ON client_seasonal_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_csprofiles_score ON client_seasonal_profiles(seasonal_score DESC);

ALTER TABLE client_seasonal_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_seasonal_profiles_tenant_isolation" ON client_seasonal_profiles
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. TENDÊNCIAS DE PRODUTO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS product_trends (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,

  product_name   VARCHAR(255),
  category       VARCHAR(100),

  -- Período de análise
  period_type    VARCHAR(20) NOT NULL,    -- 'weekly','monthly','quarterly'
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,

  -- Métricas
  total_quantity    INTEGER DEFAULT 0,
  total_revenue     DECIMAL(14,2) DEFAULT 0,
  unique_buyers     INTEGER DEFAULT 0,
  avg_ticket        DECIMAL(12,2) DEFAULT 0,
  repeat_rate       DECIMAL(5,2) DEFAULT 0,   -- % de recompra

  -- Tendência comparativa
  prev_period_qty      INTEGER,
  prev_period_revenue  DECIMAL(14,2),
  qty_growth_pct       DECIMAL(7,2),
  revenue_growth_pct   DECIMAL(7,2),
  trend_direction      VARCHAR(20),    -- 'growing','stable','declining'

  -- Velocidade de venda
  velocity_score       DECIMAL(5,2) DEFAULT 0,  -- 0-100

  -- Estoque vs demanda
  stock_days_remaining INTEGER,
  restock_urgency      VARCHAR(20),    -- 'critical','low','ok','excess'

  metadata    JSONB DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ptrends_tenant ON product_trends(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ptrends_product ON product_trends(product_id);
CREATE INDEX IF NOT EXISTS idx_ptrends_period ON product_trends(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_ptrends_velocity ON product_trends(velocity_score DESC);

ALTER TABLE product_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_trends_tenant_isolation" ON product_trends
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. AFINIDADE ENTRE PRODUTOS (Market Basket Analysis)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS product_affinity (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  product_a_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  product_b_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  product_a_name VARCHAR(255),
  product_b_name VARCHAR(255),

  -- Métricas de afinidade
  co_purchase_count   INTEGER DEFAULT 0,     -- quantas vezes comprados juntos
  support             DECIMAL(5,4) DEFAULT 0, -- freq(A∩B)/total_orders
  confidence_a_to_b   DECIMAL(5,4) DEFAULT 0, -- P(B|A) = freq(A∩B)/freq(A)
  confidence_b_to_a   DECIMAL(5,4) DEFAULT 0, -- P(A|B) = freq(A∩B)/freq(B)
  lift                DECIMAL(7,4) DEFAULT 0, -- support/(support_a*support_b)

  -- Score consolidado 0-100
  affinity_score      DECIMAL(5,2) DEFAULT 0,

  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, product_a_id, product_b_id)
);

CREATE INDEX IF NOT EXISTS idx_paffinity_tenant ON product_affinity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paffinity_a ON product_affinity(product_a_id);
CREATE INDEX IF NOT EXISTS idx_paffinity_b ON product_affinity(product_b_id);
CREATE INDEX IF NOT EXISTS idx_paffinity_score ON product_affinity(affinity_score DESC);

ALTER TABLE product_affinity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_affinity_tenant_isolation" ON product_affinity
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. PREFERÊNCIAS DE GRADE DO CLIENTE (tamanho, cor, etc.)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS client_grade_preferences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Preferências extraídas dos pedidos
  preferred_sizes      JSONB DEFAULT '[]',    -- ["P","M","G"] ranked
  preferred_colors     JSONB DEFAULT '[]',    -- ["preto","branco"] ranked
  preferred_categories JSONB DEFAULT '[]',    -- ["camisetas","vestidos"] ranked
  preferred_brands     JSONB DEFAULT '[]',    -- ranked

  -- Faixa de preço
  avg_price_paid       DECIMAL(12,2),
  min_price_paid       DECIMAL(12,2),
  max_price_paid       DECIMAL(12,2),
  price_sensitivity    VARCHAR(20),           -- 'low','medium','high' (compra com/sem desconto)

  -- Produtos favoritos
  top_products JSONB DEFAULT '[]',            -- [{product_id, name, qty}]

  -- Comportamento de recompra
  reorder_rate         DECIMAL(5,2) DEFAULT 0,
  variety_score        DECIMAL(5,2) DEFAULT 0, -- diversidade de produtos

  -- Estilo (baseado em categories/produtos)
  style_tags JSONB DEFAULT '[]',              -- ["casual","esportivo","social"]

  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_cgrade_client ON client_grade_preferences(client_id);
CREATE INDEX IF NOT EXISTS idx_cgrade_tenant ON client_grade_preferences(tenant_id);

ALTER TABLE client_grade_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_grade_preferences_tenant_isolation" ON client_grade_preferences
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. EXTENSÕES DO CLIENTS PARA INTELLIGENCE V2
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Sazonalidade
ALTER TABLE clients ADD COLUMN IF NOT EXISTS seasonal_buyer    BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS seasonal_score    DECIMAL(5,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_season  VARCHAR(50);

-- Inteligência de produto
ALTER TABLE clients ADD COLUMN IF NOT EXISTS variety_score     DECIMAL(5,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS price_sensitivity VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reorder_rate      DECIMAL(5,2) DEFAULT 0;

-- Insights de vendedor
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sales_script_hint TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_insight_at   TIMESTAMPTZ;

-- Índices
CREATE INDEX IF NOT EXISTS idx_clients_seasonal_buyer ON clients(seasonal_buyer) WHERE seasonal_buyer = true;
CREATE INDEX IF NOT EXISTS idx_clients_seasonal_score ON clients(seasonal_score DESC);
