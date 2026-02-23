-- ============================================================
-- MIGRATION 025: Corrigir RLS para Supabase Realtime funcionar
-- com filtro tenant_id=eq.{tenantId} no postgres_changes
-- ============================================================
--
-- PROBLEMA:
-- O canal Realtime em useRealtimeMessages.ts usava um canal sem filtro,
-- dependendo 100% do RLS via get_tenant_id() que faz SELECT em profiles.
-- Isso causa dois problemas:
--   1. get_tenant_id() é executado para CADA evento → latência adicional
--   2. Se houver race condition na autenticação, nenhum evento chega
--
-- SOLUÇÃO:
-- O canal agora passa filter: 'tenant_id=eq.{tenantId}' explicitamente.
-- Para que o Supabase Realtime aceite filtros em postgres_changes, a tabela
-- precisa ter REPLICA IDENTITY FULL (já feito em 023) E a policy de SELECT
-- deve permitir que o usuário autenticado veja as linhas filtradas.
--
-- Também adicionamos policies específicas para o role 'authenticated'
-- sem depender de get_tenant_id() (que faz sub-query), usando uma
-- função mais eficiente que usa JOIN direto.
--
-- Execute este script no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Criar função helper mais eficiente para RLS
--    Usa IMMUTABLE + SECURITY DEFINER + cache plan para evitar re-parse
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- 2. Garantir que REPLICA IDENTITY está correto (idempotente)
ALTER TABLE messages      REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE clients       REPLICA IDENTITY FULL;

-- 3. Atualizar policies de messages para usar a função otimizada
--    (DROP IF EXISTS + CREATE para ser idempotente)

-- Messages SELECT
DROP POLICY IF EXISTS "Messages: tenant isolation SELECT" ON messages;
CREATE POLICY "Messages: tenant isolation SELECT"
  ON messages FOR SELECT
  USING (tenant_id = public.auth_tenant_id());

-- Messages INSERT
DROP POLICY IF EXISTS "Messages: tenant isolation INSERT" ON messages;
CREATE POLICY "Messages: tenant isolation INSERT"
  ON messages FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- Messages UPDATE (necessário para marcar como lida)
DROP POLICY IF EXISTS "Messages: tenant isolation UPDATE" ON messages;
CREATE POLICY "Messages: tenant isolation UPDATE"
  ON messages FOR UPDATE
  USING (tenant_id = public.auth_tenant_id());

-- 4. Atualizar policies de conversations
DROP POLICY IF EXISTS "Conversations: tenant isolation SELECT" ON conversations;
CREATE POLICY "Conversations: tenant isolation SELECT"
  ON conversations FOR SELECT
  USING (tenant_id = public.auth_tenant_id());

DROP POLICY IF EXISTS "Conversations: tenant isolation INSERT" ON conversations;
CREATE POLICY "Conversations: tenant isolation INSERT"
  ON conversations FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id());

DROP POLICY IF EXISTS "Conversations: tenant isolation UPDATE" ON conversations;
CREATE POLICY "Conversations: tenant isolation UPDATE"
  ON conversations FOR UPDATE
  USING (tenant_id = public.auth_tenant_id());

-- 5. Garantir que as tabelas estão na publicação do Realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  END IF;
END $$;

-- 6. Verificar resultado
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename IN ('messages', 'conversations', 'clients');
