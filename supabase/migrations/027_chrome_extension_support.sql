-- ============================================================
-- Migration 027: Suporte à Extensão Chrome VEXX CRM
-- ============================================================

-- 1. Função para incrementar contador de uso de respostas rápidas
--    Chamada pela extensão quando o atendente usa uma resposta rápida
CREATE OR REPLACE FUNCTION increment_quick_reply_use(p_id UUID, p_tenant_id UUID)
RETURNS void AS $$
  UPDATE quick_replies
  SET use_count  = use_count + 1,
      updated_at = now()
  WHERE id = p_id AND tenant_id = p_tenant_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Coluna source em client_notes
--    Registra de onde veio a nota: 'web' | 'extension' | 'import'
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';

-- 3. Índice para busca de respostas rápidas por tenant + uso
--    A extensão busca ordenando por use_count DESC — este índice acelera
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant_use
  ON quick_replies(tenant_id, use_count DESC);

-- 4. Índice para busca de notas por cliente (extensão carrega ao abrir contato)
CREATE INDEX IF NOT EXISTS idx_client_notes_client
  ON client_notes(client_id, created_at DESC);
