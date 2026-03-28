-- Migration 041 — Tabelas para eventos Evolution API
-- whatsapp_labels, conversation_labels, message_reactions,
-- contact_presence, calls_log, whatsapp_groups, whatsapp_label_colors
-- + colunas deleted/edited na messages

-- ─── 1. Whatsapp Labels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_label_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT,
  cor_hex TEXT,
  predefined_id TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, whatsapp_label_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_labels_tenant
  ON whatsapp_labels (tenant_id, ativo);

ALTER TABLE whatsapp_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_labels_tenant" ON whatsapp_labels;
CREATE POLICY "whatsapp_labels_tenant" ON whatsapp_labels
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 2. Conversation Labels ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  phone TEXT,
  label_id TEXT NOT NULL,
  label_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone, label_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_labels_phone
  ON conversation_labels (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_conversation_labels_label
  ON conversation_labels (tenant_id, label_id);

ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversation_labels_tenant" ON conversation_labels;
CREATE POLICY "conversation_labels_tenant" ON conversation_labels
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 3. Message Reactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  from_me BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, message_id)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_reactions_tenant" ON message_reactions;
CREATE POLICY "message_reactions_tenant" ON message_reactions
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 4. Contact Presence ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_presence (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, phone)
);

ALTER TABLE contact_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_presence_tenant" ON contact_presence;
CREATE POLICY "contact_presence_tenant" ON contact_presence
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 5. Calls Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT,
  call_id TEXT,
  tipo TEXT DEFAULT 'voz',
  status TEXT DEFAULT 'perdida',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calls_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls_log_tenant" ON calls_log;
CREATE POLICY "calls_log_tenant" ON calls_log
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 6. WhatsApp Groups ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  nome TEXT,
  descricao TEXT,
  foto TEXT,
  participantes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, group_jid)
);

ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_groups_tenant" ON whatsapp_groups;
CREATE POLICY "whatsapp_groups_tenant" ON whatsapp_groups
  FOR ALL USING (tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- ─── 7. Cores de etiquetas WhatsApp ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_label_colors (
  color_index INTEGER PRIMARY KEY,
  hex_color TEXT NOT NULL,
  nome TEXT
);

INSERT INTO whatsapp_label_colors VALUES
  (0,  '#FF6900', 'Laranja'),
  (1,  '#FCB900', 'Amarelo'),
  (2,  '#7BDCB5', 'Verde claro'),
  (3,  '#00D084', 'Verde'),
  (4,  '#8ED1FC', 'Azul claro'),
  (5,  '#0693E3', 'Azul'),
  (6,  '#ABB8C3', 'Cinza'),
  (7,  '#EB144C', 'Vermelho'),
  (8,  '#F78DA7', 'Rosa'),
  (9,  '#9900EF', 'Roxo'),
  (10, '#FF6900', 'Laranja escuro'),
  (11, '#FCB900', 'Dourado'),
  (12, '#00D084', 'Esmeralda'),
  (13, '#0693E3', 'Azul royal'),
  (14, '#EB144C', 'Carmim'),
  (15, '#9900EF', 'Violeta'),
  (16, '#FF6900', 'Âmbar'),
  (17, '#7BDCB5', 'Menta'),
  (18, '#ABB8C3', 'Prata'),
  (19, '#EB144C', 'Rosa forte')
ON CONFLICT DO NOTHING;

-- ─── 8. Colunas deleted/edited na messages ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted') THEN
    ALTER TABLE messages ADD COLUMN deleted BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted_at') THEN
    ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'edited') THEN
    ALTER TABLE messages ADD COLUMN edited BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'edited_at') THEN
    ALTER TABLE messages ADD COLUMN edited_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── 9. Coluna foto_perfil e nome_whatsapp em clients ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'nome_whatsapp') THEN
    ALTER TABLE clients ADD COLUMN nome_whatsapp TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'foto_perfil') THEN
    ALTER TABLE clients ADD COLUMN foto_perfil TEXT;
  END IF;
END $$;
