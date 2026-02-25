-- ============================================================
-- Migration 028: Criar tabelas quick_replies e client_notes
-- (caso não existam) + suporte à Extensão Chrome
-- ============================================================

-- 1. Tabela quick_replies
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, shortcut)
);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "QuickReplies: tenant isolation SELECT" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation SELECT"
  ON quick_replies FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "QuickReplies: tenant isolation INSERT" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation INSERT"
  ON quick_replies FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "QuickReplies: tenant isolation UPDATE" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation UPDATE"
  ON quick_replies FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "QuickReplies: tenant isolation DELETE" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation DELETE"
  ON quick_replies FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- 2. Tabela client_notes
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'call', 'email', 'meeting', 'task')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ClientNotes: tenant isolation SELECT" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation SELECT"
  ON client_notes FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ClientNotes: tenant isolation INSERT" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation INSERT"
  ON client_notes FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ClientNotes: tenant isolation UPDATE" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation UPDATE"
  ON client_notes FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ClientNotes: tenant isolation DELETE" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation DELETE"
  ON client_notes FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- 3. Coluna source em client_notes (extensão Chrome)
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';

-- 4. Função para incrementar contador de respostas rápidas
CREATE OR REPLACE FUNCTION increment_quick_reply_use(p_id UUID, p_tenant_id UUID)
RETURNS void AS $$
  UPDATE quick_replies
  SET use_count  = use_count + 1,
      updated_at = now()
  WHERE id = p_id AND tenant_id = p_tenant_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant_use
  ON quick_replies(tenant_id, use_count DESC);

CREATE INDEX IF NOT EXISTS idx_client_notes_client
  ON client_notes(client_id, created_at DESC);
