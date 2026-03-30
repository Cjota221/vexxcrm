-- Migration 049: adicionar meta_pixel_id para CAPI + corrigir RLS policies com LIMIT 1
-- Data: 2026-03-29

-- ── 1. Adicionar meta_pixel_id em ai_provider_config ─────────────────────────
-- Necessário para disparar eventos Lead/Purchase via Conversions API
ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;

-- ── 2. Corrigir RLS policy de meta_audiences com LIMIT 1 sem ORDER BY ────────
-- LIMIT 1 sem ORDER BY é não-determinístico quando um usuário tem múltiplos
-- perfis. Adicionar ORDER BY p.created_at para comportamento previsível.

DROP POLICY IF EXISTS "meta_audiences tenant isolation" ON meta_audiences;
DROP POLICY IF EXISTS meta_audiences_tenant_isolation ON meta_audiences;

CREATE POLICY "meta_audiences tenant isolation" ON meta_audiences
  USING (
    tenant_id = (
      SELECT p.tenant_id
      FROM profiles p
      WHERE p.id = auth.uid()
      ORDER BY p.created_at
      LIMIT 1
    )
  );

-- ── 3. Corrigir policies similares em outras tabelas Meta ────────────────────

-- meta_campaigns_cache
DROP POLICY IF EXISTS "meta_campaigns_cache tenant isolation" ON meta_campaigns_cache;
DROP POLICY IF EXISTS meta_campaigns_cache_tenant_isolation ON meta_campaigns_cache;

CREATE POLICY "meta_campaigns_cache tenant isolation" ON meta_campaigns_cache
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      ORDER BY p.created_at LIMIT 1
    )
  );

-- meta_ads_cache
DROP POLICY IF EXISTS "meta_ads_cache tenant isolation" ON meta_ads_cache;
DROP POLICY IF EXISTS meta_ads_cache_tenant_isolation ON meta_ads_cache;

CREATE POLICY "meta_ads_cache tenant isolation" ON meta_ads_cache
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      ORDER BY p.created_at LIMIT 1
    )
  );

-- meta_creatives_cache
DROP POLICY IF EXISTS "meta_creatives_cache tenant isolation" ON meta_creatives_cache;
DROP POLICY IF EXISTS meta_creatives_cache_tenant_isolation ON meta_creatives_cache;

CREATE POLICY "meta_creatives_cache tenant isolation" ON meta_creatives_cache
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      ORDER BY p.created_at LIMIT 1
    )
  );

-- meta_adsets_cache
DROP POLICY IF EXISTS "meta_adsets_cache tenant isolation" ON meta_adsets_cache;
DROP POLICY IF EXISTS meta_adsets_cache_tenant_isolation ON meta_adsets_cache;

CREATE POLICY "meta_adsets_cache tenant isolation" ON meta_adsets_cache
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      ORDER BY p.created_at LIMIT 1
    )
  );
