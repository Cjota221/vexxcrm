-- ============================================================
-- VEXX CRM 2.0 — SCHEMA COMPLETO
-- Execute este arquivo no Supabase SQL Editor de uma vez.
-- Inclui: schema inicial + todas as migrations + extensão Chrome
-- ============================================================

-- ━━━ EXTENSÕES ━━━
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  logo_url TEXT,
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  evolution_instance TEXT,
  facilzap_token TEXT,
  openai_api_key TEXT,
  max_users INTEGER DEFAULT 1,
  max_contacts INTEGER DEFAULT 500,
  max_campaigns_month INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  -- config JSONB (migration 022)
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  name TEXT,
  name_manual TEXT,
  email TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked', 'vip')),
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'import', 'manual', 'campaign', 'facilzap')),
  ltv DECIMAL(12,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  avg_ticket DECIMAL(12,2) DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  cpf TEXT,
  birthday DATE,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  first_contact_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  -- RFM (migration 005/006)
  rfm_score INTEGER,
  rfm_segment TEXT,
  churn_probability DECIMAL(5,4),
  clv_predicted DECIMAL(12,2),
  is_vip BOOLEAN DEFAULT false,
  at_risk BOOLEAN DEFAULT false,
  -- history (migration 20260221)
  history_loaded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, phone_normalized)
);

-- ============================================================
-- 4. CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'closed', 'archived')),
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'instagram', 'telegram', 'webchat')),
  assigned_to UUID REFERENCES profiles(id),
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_type TEXT DEFAULT 'text',
  unread_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'system')),
  content TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_name TEXT,
  sender_phone TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'deleted')),
  external_id TEXT,
  reply_to_id UUID REFERENCES messages(id),
  metadata JSONB DEFAULT '{}',
  is_from_bot BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Constraint única external_id (migration 021)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_tenant_external_unique;
ALTER TABLE messages ADD CONSTRAINT messages_tenant_external_unique
  UNIQUE(tenant_id, external_id);

-- ============================================================
-- 6. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  compare_at_price DECIMAL(12,2),
  cost DECIMAL(12,2),
  stock INTEGER DEFAULT 0,
  track_stock BOOLEAN DEFAULT true,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  custom_fields JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  external_id TEXT,
  order_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partial')),
  payment_method TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  shipping DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  tracking_code TEXT,
  tracking_url TEXT,
  shipping_address JSONB,
  coupon_id UUID,
  coupon_code TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'broadcast' CHECK (type IN ('broadcast', 'sequence', 'trigger', 'drip')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  target_filter JSONB DEFAULT '{}',
  target_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  messages JSONB DEFAULT '[]',
  -- daily counter (migration 020)
  daily_send_count INTEGER DEFAULT 0,
  daily_send_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'percentage' CHECK (type IN ('percentage', 'fixed', 'free_shipping')),
  value DECIMAL(12,2) NOT NULL DEFAULT 0,
  min_order_value DECIMAL(12,2) DEFAULT 0,
  max_uses INTEGER,
  max_uses_per_client INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- ============================================================
-- 11. QUICK_REPLIES
-- ============================================================
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

-- ============================================================
-- 12. CLIENT_NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'call', 'email', 'meeting', 'task')),
  -- source (migration 027/028): 'web' | 'extension' | 'import'
  source TEXT DEFAULT 'web',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 13. TENANT_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_auto_reply BOOLEAN DEFAULT false,
  whatsapp_welcome_message TEXT,
  whatsapp_away_message TEXT,
  whatsapp_business_hours JSONB DEFAULT '{"start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}',
  anne_enabled BOOLEAN DEFAULT false,
  anne_system_prompt TEXT,
  anne_model TEXT DEFAULT 'gpt-4o-mini',
  anne_max_tokens INTEGER DEFAULT 500,
  facilzap_auto_sync BOOLEAN DEFAULT false,
  facilzap_sync_interval INTEGER DEFAULT 30,
  notification_new_message BOOLEAN DEFAULT true,
  notification_new_order BOOLEAN DEFAULT true,
  notification_sound BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 14. KANBAN_CARDS (migration 013)
-- ============================================================
CREATE TABLE IF NOT EXISTS kanban_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  column_id TEXT NOT NULL DEFAULT 'NOVO',
  title TEXT,
  position INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 15. ANNE_AUTOMATIONS (migration 015)
-- ============================================================
CREATE TABLE IF NOT EXISTS anne_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 16. AUTOMATION_LOGS (migration 20250120)
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES anne_automations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  trigger_type TEXT,
  action_type TEXT,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(tenant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_last_message ON clients(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_rfm ON clients(tenant_id, rfm_segment);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(tenant_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_external ON messages(tenant_id, external_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_external ON orders(tenant_id, external_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(tenant_id, order_number);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_external ON products(tenant_id, external_id);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_kanban_tenant ON kanban_cards(tenant_id, column_id);
CREATE INDEX IF NOT EXISTS idx_kanban_order ON kanban_cards(order_id);

-- Extensão Chrome (migration 027/028)
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant_use ON quick_replies(tenant_id, use_count DESC);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id, created_at DESC);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'tenants', 'profiles', 'clients', 'conversations',
    'products', 'orders', 'campaigns', 'coupons',
    'quick_replies', 'client_notes', 'tenant_config',
    'kanban_cards', 'anne_automations'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- Métricas do cliente ao criar/atualizar pedido
CREATE OR REPLACE FUNCTION update_client_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients SET
    total_orders = (SELECT COUNT(*) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    ltv          = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    avg_ticket   = (SELECT COALESCE(AVG(total), 0) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    last_order_at = now(),
    updated_at   = now()
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_update_client_metrics ON orders;
CREATE TRIGGER trg_orders_update_client_metrics
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_client_metrics();

-- Atualizar conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_text = NEW.content,
    last_message_at   = NEW.created_at,
    last_message_type = NEW.type,
    message_count     = message_count + 1,
    unread_count      = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    updated_at        = now()
  WHERE id = NEW.conversation_id;

  UPDATE clients SET last_message_at = NEW.created_at WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_update_conversation ON messages;
CREATE TRIGGER trg_messages_update_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Incrementar uso de resposta rápida (extensão Chrome)
CREATE OR REPLACE FUNCTION increment_quick_reply_use(p_id UUID, p_tenant_id UUID)
RETURNS void AS $$
  UPDATE quick_replies
  SET use_count  = use_count + 1,
      updated_at = now()
  WHERE id = p_id AND tenant_id = p_tenant_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper tenant_id
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE anne_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- TENANTS
DROP POLICY IF EXISTS "Tenant: users can view own tenant" ON tenants;
CREATE POLICY "Tenant: users can view own tenant"
  ON tenants FOR SELECT USING (id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant: service role full access" ON tenants;
CREATE POLICY "Tenant: service role full access"
  ON tenants FOR ALL TO service_role USING (true);

-- PROFILES
DROP POLICY IF EXISTS "Profiles: users can view own tenant profiles" ON profiles;
CREATE POLICY "Profiles: users can view own tenant profiles"
  ON profiles FOR SELECT USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Profiles: users can update own profile" ON profiles;
CREATE POLICY "Profiles: users can update own profile"
  ON profiles FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Profiles: service role full access" ON profiles;
CREATE POLICY "Profiles: service role full access"
  ON profiles FOR ALL TO service_role USING (true);

-- Macro para tabelas com tenant_id simples
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'clients', 'conversations', 'messages', 'products', 'orders',
    'order_items', 'campaigns', 'coupons', 'quick_replies',
    'client_notes', 'tenant_config', 'kanban_cards',
    'anne_automations', 'automation_logs'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s: tenant SELECT" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s: tenant SELECT" ON %I FOR SELECT USING (tenant_id = public.get_tenant_id())',
      tbl, tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s: tenant INSERT" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s: tenant INSERT" ON %I FOR INSERT WITH CHECK (tenant_id = public.get_tenant_id())',
      tbl, tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s: tenant UPDATE" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s: tenant UPDATE" ON %I FOR UPDATE USING (tenant_id = public.get_tenant_id())',
      tbl, tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s: tenant DELETE" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s: tenant DELETE" ON %I FOR DELETE USING (tenant_id = public.get_tenant_id())',
      tbl, tbl
    );
    -- service_role bypass
    EXECUTE format('DROP POLICY IF EXISTS "%s: service role" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s: service role" ON %I FOR ALL TO service_role USING (true)',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('criativos', 'criativos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Storage: authenticated upload" ON storage.objects;
CREATE POLICY "Storage: authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('media', 'avatars', 'criativos'));

DROP POLICY IF EXISTS "Storage: public read" ON storage.objects;
CREATE POLICY "Storage: public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id IN ('media', 'avatars', 'criativos'));

DROP POLICY IF EXISTS "Storage: owner delete" ON storage.objects;
CREATE POLICY "Storage: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('media', 'avatars', 'criativos'));

-- ============================================================
-- FIM — Schema completo aplicado com sucesso!
-- ============================================================
