-- Migration: 030b — Índice em orders + coluna opt_out em clients
-- Usa DO blocks para não falhar caso as tabelas ainda não existam.

DO $$
BEGIN
  -- Índice de performance para buscar_clientes_pedido_alto
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'orders' AND indexname = 'idx_orders_tenant_total'
    ) THEN
      EXECUTE 'CREATE INDEX idx_orders_tenant_total
               ON orders (tenant_id, total DESC)
               WHERE client_id IS NOT NULL';
      RAISE NOTICE 'Índice idx_orders_tenant_total criado.';
    ELSE
      RAISE NOTICE 'Índice idx_orders_tenant_total já existe — ignorado.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela orders não encontrada — índice ignorado.';
  END IF;
END
$$;

DO $$
BEGIN
  -- Coluna opt_out em clients (LGPD)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = 'clients'
        AND column_name = 'opt_out'
    ) THEN
      EXECUTE 'ALTER TABLE clients
               ADD COLUMN opt_out BOOLEAN NOT NULL DEFAULT FALSE';
      EXECUTE 'CREATE INDEX idx_clients_opt_out
               ON clients (tenant_id, opt_out)
               WHERE opt_out = TRUE';
      EXECUTE $c$
        COMMENT ON COLUMN clients.opt_out IS
          'TRUE = cliente solicitou não receber mensagens em massa (LGPD art. 17).'
      $c$;
      RAISE NOTICE 'Coluna opt_out adicionada em clients.';
    ELSE
      RAISE NOTICE 'Coluna opt_out já existe em clients — ignorada.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela clients não encontrada — coluna opt_out ignorada.';
  END IF;
END
$$;
