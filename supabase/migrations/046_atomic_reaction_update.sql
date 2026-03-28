-- ============================================================
-- MIGRATION 046: RPC atômica para atualizar reactions em messages.metadata
-- ============================================================
-- Resolve race condition: antes, o webhook fazia SELECT + UPDATE separados.
-- Agora uma única função SQL atualiza metadata.reactions de forma atômica.
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_message_reactions(
  p_tenant_id UUID,
  p_external_id TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reactions JSONB;
BEGIN
  -- 1. Buscar todas as reactions da mensagem (leitura consistente)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'emoji', emoji,
    'from_me', from_me,
    'reactor_phone', reactor_phone
  )), '[]'::jsonb)
  INTO v_reactions
  FROM public.message_reactions
  WHERE tenant_id = p_tenant_id
    AND message_id = p_external_id;

  -- 2. Atualizar metadata.reactions atomicamente (jsonb_set preserva outros campos)
  UPDATE public.messages
  SET metadata = jsonb_set(
    COALESCE(metadata::jsonb, '{}'::jsonb),
    '{reactions}',
    v_reactions,
    true  -- create if missing
  )
  WHERE tenant_id = p_tenant_id
    AND external_id = p_external_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_message_reactions(UUID, TEXT) TO service_role;
