-- ============================================================
-- VERIFICAÇÃO DE TABELAS DO VEXX CRM 2.0
-- ============================================================
-- Execute este script no Supabase SQL Editor para verificar
-- se todas as tabelas necessárias existem
-- ============================================================

-- Verificar se as tabelas existem
SELECT 
  tablename as "Tabela",
  CASE 
    WHEN tablename IN ('tenants', 'profiles', 'clients', 'conversations', 
                       'messages', 'products', 'orders', 'order_items',
                       'campaigns', 'coupons', 'quick_replies', 
                       'client_notes', 'tenant_config') 
    THEN '✅ Existe'
    ELSE '❌ Não existe'
  END as "Status"
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants', 'profiles', 'clients', 'conversations', 
    'messages', 'products', 'orders', 'order_items',
    'campaigns', 'coupons', 'quick_replies', 
    'client_notes', 'tenant_config'
  )
ORDER BY tablename;

-- Contar registros em cada tabela (se existirem)
DO $$
DECLARE
  tbl TEXT;
  cnt INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CONTAGEM DE REGISTROS:';
  RAISE NOTICE '========================================';
  
  FOR tbl IN 
    SELECT tablename 
    FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public'
      AND tablename IN ('tenants', 'profiles', 'clients')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO cnt;
    RAISE NOTICE '%: % registros', tbl, cnt;
  END LOOP;
END $$;

-- Verificar se a função get_tenant_id() existe
SELECT 
  'get_tenant_id()' as "Função",
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'get_tenant_id' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) 
    THEN '✅ Existe'
    ELSE '❌ Não existe (ERRO CRÍTICO!)'
  END as "Status";

-- Verificar usuários cadastrados no Auth
SELECT 
  COUNT(*) as "Total de Usuários no Auth",
  COUNT(CASE WHEN email_confirmed_at IS NOT NULL THEN 1 END) as "E-mails Confirmados"
FROM auth.users;
