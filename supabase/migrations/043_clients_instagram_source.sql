-- Migration: 043 — Suporte a clientes Instagram
-- Adiciona 'instagram' como valor válido em clients.source
-- e índice em custom_fields->>'instagram_id' para lookup eficiente.

SET search_path TO public;

-- 1. Ampliar CHECK constraint de clients.source para incluir 'instagram'
--    (precisamos dropar e recriar pois ALTER CONSTRAINT não suporta CHECK em PostgreSQL)
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_source_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_source_check
  CHECK (source IN ('whatsapp', 'import', 'manual', 'campaign', 'facilzap', 'instagram'));

-- 2. Índice funcional para buscar clientes pelo instagram_id armazenado em custom_fields
--    Permite: WHERE custom_fields->>'instagram_id' = '12345...'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clients_instagram_id') THEN
    CREATE INDEX idx_clients_instagram_id
      ON public.clients ((custom_fields->>'instagram_id'))
      WHERE custom_fields->>'instagram_id' IS NOT NULL;
  END IF;
END $$;
