-- Migration: 030_campanha_melhorias
-- ══════════════════════════════════════════════════════════════════════════════
-- EXECUTE EM DOIS PASSOS no SQL Editor do Supabase:
--
--   PASSO 1 (cole e rode): linhas abaixo até o marcador ── FIM PASSO 1 ──
--   PASSO 2 (cole e rode): linhas após o marcador ── INÍCIO PASSO 2 ──
--
-- O Passo 1 cria a tabela campanha_disparos (sem dependências externas).
-- O Passo 2 adiciona índice em orders e coluna em clients.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── PASSO 1 ── Criar tabela campanha_disparos ─────────────────────────────────

CREATE TABLE IF NOT EXISTS campanha_disparos (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  cliente_id    TEXT,
  telefone      TEXT,
  mensagem      TEXT,
  status        TEXT        NOT NULL DEFAULT 'enviado'
                            CHECK (status IN ('enviado', 'erro', 'simulado')),
  motivo        TEXT,
  campanha_nome TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campanha_disparos_tenant
  ON campanha_disparos (tenant_id, created_at DESC);

ALTER TABLE campanha_disparos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campanha_disparos'
      AND policyname = 'Tenant vê seus próprios disparos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Tenant vê seus próprios disparos"
        ON campanha_disparos FOR ALL
        USING (
          tenant_id = (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$$;

COMMENT ON COLUMN campanha_disparos.motivo IS
  'Motivo da falha no envio. Ex: telefone inválido, opt-out, erro Evolution API.';

-- ── FIM PASSO 1 ───────────────────────────────────────────────────────────────




-- ── PASSO 2 ── Índice em orders + coluna opt_out em clients ───────────────────
-- (só rode após confirmar que as tabelas orders e clients existem)

CREATE INDEX IF NOT EXISTS idx_orders_tenant_total
  ON orders (tenant_id, total DESC)
  WHERE client_id IS NOT NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opt_out BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_clients_opt_out
  ON clients (tenant_id, opt_out)
  WHERE opt_out = TRUE;

COMMENT ON COLUMN clients.opt_out IS
  'TRUE = cliente solicitou não receber mensagens em massa (LGPD art. 17). '
  'Verificar antes de qualquer disparo de campanha.';

-- ── FIM PASSO 2 ───────────────────────────────────────────────────────────────
