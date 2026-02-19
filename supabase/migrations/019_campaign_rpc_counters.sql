-- ══════════════════════════════════════════════════════════════
-- Migration 019 — RPCs de contadores para campaigns
-- Funções chamadas pelo campaign-dispatcher ao enviar mensagens.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Incrementar contador de enviados ──────────────────────
CREATE OR REPLACE FUNCTION increment_campaign_sent(campanha_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET sent_count = COALESCE(sent_count, 0) + 1
  WHERE id = campanha_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Incrementar contador de falhas ────────────────────────
CREATE OR REPLACE FUNCTION increment_campaign_failed(campanha_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET failed_count = COALESCE(failed_count, 0) + 1
  WHERE id = campanha_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Garantir que as colunas existem em campaigns ──────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sent_count   int DEFAULT 0;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS failed_count int DEFAULT 0;

-- ── 4. Comentários ────────────────────────────────────────────
COMMENT ON FUNCTION increment_campaign_sent   IS 'Incrementa sent_count da campanha. Chamado pelo campaign-dispatcher a cada envio bem-sucedido.';
COMMENT ON FUNCTION increment_campaign_failed IS 'Incrementa failed_count da campanha. Chamado pelo campaign-dispatcher quando esgotam as tentativas.';
