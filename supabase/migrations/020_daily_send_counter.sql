-- ══════════════════════════════════════════════════════════════
-- Migration 020 — Contador de envios diários (Anti-Ban 2.0)
-- Tabela para rastrear volume de envios por tenant em janelas 24h.
-- Reset automático via computed column date_key.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Tabela de contadores diários ──────────────────────────
CREATE TABLE IF NOT EXISTS tenant_daily_send_counts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date_key    date NOT NULL DEFAULT CURRENT_DATE,
  send_count  int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(tenant_id, date_key)
);

-- ── 2. RPC para incrementar contador ─────────────────────────
CREATE OR REPLACE FUNCTION increment_daily_send_count(p_tenant_id uuid, p_count int DEFAULT 1)
RETURNS int AS $$
DECLARE
  v_current int;
BEGIN
  INSERT INTO tenant_daily_send_counts (tenant_id, date_key, send_count)
  VALUES (p_tenant_id, CURRENT_DATE, p_count)
  ON CONFLICT (tenant_id, date_key)
  DO UPDATE SET
    send_count = tenant_daily_send_counts.send_count + p_count,
    updated_at = now()
  RETURNING send_count INTO v_current;
  
  RETURN v_current;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. RPC para buscar contagem atual ────────────────────────
CREATE OR REPLACE FUNCTION get_daily_send_count(p_tenant_id uuid)
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  SELECT send_count INTO v_count
  FROM tenant_daily_send_counts
  WHERE tenant_id = p_tenant_id AND date_key = CURRENT_DATE;
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. RLS ────────────────────────────────────────────────────
ALTER TABLE tenant_daily_send_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_daily_sends_tenant_isolation"
  ON tenant_daily_send_counts
  FOR ALL
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ── 5. Campos de recorrência em campaigns ────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_recurring      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type   text CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_time   time,
  ADD COLUMN IF NOT EXISTS recurrence_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_recurrence_at timestamptz;

-- ── 6. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_sends_tenant_date 
  ON tenant_daily_send_counts(tenant_id, date_key);

CREATE INDEX IF NOT EXISTS idx_campaigns_recurring 
  ON campaigns(is_recurring, recurrence_active, recurrence_type) 
  WHERE is_recurring = true AND recurrence_active = true;

-- ── 7. Comentários ────────────────────────────────────────────
COMMENT ON TABLE tenant_daily_send_counts IS 'Rastreia envios diários por tenant para trava de volume (Anti-Ban 2.0 / Regra da Carol)';
COMMENT ON FUNCTION increment_daily_send_count IS 'Incrementa contador diário de envios. Retorna contagem atual.';
COMMENT ON FUNCTION get_daily_send_count IS 'Retorna envios já feitos hoje para o tenant.';
