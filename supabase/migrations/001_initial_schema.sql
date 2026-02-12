-- ============================================================
-- VEXX CRM 2.0 â€” Schema Inicial (Multi-Tenant)
-- ============================================================
-- Todas as tabelas possuem tenant_id para isolamento multi-tenant.
-- RLS (Row Level Security) aplicado em todas as tabelas.
-- ============================================================

-- â”€â”€â”€ EXTENSÃ•ES â”€â”€â”€
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- busca fuzzy

-- ============================================================
-- 1. TENANTS (OrganizaÃ§Ãµes / Lojas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  logo_url TEXT,
  
  -- ConfiguraÃ§Ãµes de integraÃ§Ã£o
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  evolution_instance TEXT,
  facilzap_token TEXT,
  openai_api_key TEXT,
  
  -- Limites do plano
  max_users INTEGER DEFAULT 1,
  max_contacts INTEGER DEFAULT 500,
  max_campaigns_month INTEGER DEFAULT 5,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PROFILES (UsuÃ¡rios vinculados ao Auth)
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
-- 3. CLIENTS (Contatos / Clientes WhatsApp)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- IdentificaÃ§Ã£o
  phone TEXT NOT NULL,               -- formato canÃ´nico: 5511999998888
  phone_normalized TEXT NOT NULL,    -- para busca rÃ¡pida
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  
  -- CRM
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked', 'vip')),
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'import', 'manual', 'campaign', 'facilzap')),
  
  -- MÃ©tricas
  ltv DECIMAL(12,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  avg_ticket DECIMAL(12,2) DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  
  -- EndereÃ§o
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  
  -- Metadata
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  first_contact_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: um telefone por tenant
  UNIQUE(tenant_id, phone_normalized)
);

-- ============================================================
-- 4. CONVERSATIONS (Conversas / Chats)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'closed', 'archived')),
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'instagram', 'telegram', 'webchat')),
  
  -- AtribuiÃ§Ã£o
  assigned_to UUID REFERENCES profiles(id),
  
  -- Ãšltima mensagem (desnormalizado para performance)
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_type TEXT DEFAULT 'text',
  
  -- Contadores
  unread_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  
  -- Metadata
  is_pinned BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. MESSAGES (Mensagens do Chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  
  -- ConteÃºdo
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'system')),
  content TEXT,                         -- texto ou caption
  media_url TEXT,                       -- URL do arquivo de mÃ­dia
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  
  -- DireÃ§Ã£o
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_name TEXT,
  sender_phone TEXT,
  
  -- Status de entrega (WhatsApp)
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'deleted')),
  
  -- ReferÃªncia externa
  external_id TEXT,                    -- ID da mensagem na Evolution API
  reply_to_id UUID REFERENCES messages(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  is_from_bot BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. PRODUCTS (Produtos do e-commerce)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- IdentificaÃ§Ã£o
  external_id TEXT,                    -- ID do produto no FacilZap/e-commerce
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  
  -- PreÃ§o
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  compare_at_price DECIMAL(12,2),      -- preÃ§o "de"
  cost DECIMAL(12,2),
  
  -- Estoque
  stock INTEGER DEFAULT 0,
  track_stock BOOLEAN DEFAULT true,
  
  -- CategorizaÃ§Ã£o
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- MÃ­dia
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  custom_fields JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. ORDERS (Pedidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  
  -- IdentificaÃ§Ã£o
  external_id TEXT,                    -- ID do pedido no FacilZap
  order_number TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partial')),
  payment_method TEXT,
  
  -- Valores
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  shipping DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  
  -- Envio
  tracking_code TEXT,
  tracking_url TEXT,
  shipping_address JSONB,
  
  -- Cupom
  coupon_id UUID,
  coupon_code TEXT,
  
  -- Metadata
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
-- 8. ORDER_ITEMS (Itens do Pedido)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  
  -- Dados do item
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. CAMPAIGNS (Campanhas de mensagem)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- IdentificaÃ§Ã£o
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo & Status
  type TEXT DEFAULT 'broadcast' CHECK (type IN ('broadcast', 'sequence', 'trigger', 'drip')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  
  -- SegmentaÃ§Ã£o
  target_filter JSONB DEFAULT '{}',    -- filtros de audiÃªncia
  target_count INTEGER DEFAULT 0,
  
  -- Progresso
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  
  -- Agendamento
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- SequÃªncia de mensagens
  messages JSONB DEFAULT '[]',         -- array de blocos da sequÃªncia
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. COUPONS (Cupons de desconto)
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- IdentificaÃ§Ã£o
  code TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de desconto
  type TEXT DEFAULT 'percentage' CHECK (type IN ('percentage', 'fixed', 'free_shipping')),
  value DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Regras
  min_order_value DECIMAL(12,2) DEFAULT 0,
  max_uses INTEGER,
  max_uses_per_client INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  
  -- Validade
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Um cÃ³digo por tenant
  UNIQUE(tenant_id, code)
);

-- ============================================================
-- 11. QUICK_REPLIES (Respostas rÃ¡pidas)
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- ConteÃºdo
  shortcut TEXT NOT NULL,              -- ex: /ola, /preco
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  
  -- Uso
  use_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, shortcut)
);

-- ============================================================
-- 12. CLIENT_NOTES (Notas sobre clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- ConteÃºdo
  content TEXT NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'call', 'email', 'meeting', 'task')),
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 13. TENANT_CONFIG (ConfiguraÃ§Ãµes do tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- WhatsApp
  whatsapp_auto_reply BOOLEAN DEFAULT false,
  whatsapp_welcome_message TEXT,
  whatsapp_away_message TEXT,
  whatsapp_business_hours JSONB DEFAULT '{"start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}',
  
  -- Anne IA
  anne_enabled BOOLEAN DEFAULT false,
  anne_system_prompt TEXT,
  anne_model TEXT DEFAULT 'gpt-4o-mini',
  anne_max_tokens INTEGER DEFAULT 500,
  
  -- FacilZap
  facilzap_auto_sync BOOLEAN DEFAULT false,
  facilzap_sync_interval INTEGER DEFAULT 30, -- minutos
  
  -- NotificaÃ§Ãµes
  notification_new_message BOOLEAN DEFAULT true,
  notification_new_order BOOLEAN DEFAULT true,
  notification_sound BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÃNDICES PARA PERFORMANCE
-- ============================================================

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(tenant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_last_message ON clients(tenant_id, last_message_at DESC);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(tenant_id, assigned_to);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_external ON messages(tenant_id, external_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(tenant_id, created_at DESC);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_external ON products(tenant_id, external_id);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(tenant_id, status);

-- ============================================================
-- FUNÃ‡Ã•ES AUXILIARES
-- ============================================================

-- FunÃ§Ã£o para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at em todas as tabelas
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'tenants', 'profiles', 'clients', 'conversations', 
    'products', 'orders', 'campaigns', 'coupons', 
    'quick_replies', 'client_notes', 'tenant_config'
  ])
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- FunÃ§Ã£o para atualizar mÃ©tricas do cliente ao criar pedido
CREATE OR REPLACE FUNCTION update_client_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients SET
    total_orders = (SELECT COUNT(*) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    ltv = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    avg_ticket = (SELECT COALESCE(AVG(total), 0) FROM orders WHERE client_id = NEW.client_id AND status != 'cancelled'),
    last_order_at = now(),
    updated_at = now()
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_orders_update_client_metrics
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_client_metrics();

-- FunÃ§Ã£o para atualizar contadores da conversa ao criar mensagem
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_text = NEW.content,
    last_message_at = NEW.created_at,
    last_message_type = NEW.type,
    message_count = message_count + 1,
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1 
      ELSE unread_count 
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  
  -- Atualizar last_message_at do cliente tambÃ©m
  UPDATE clients SET 
    last_message_at = NEW.created_at
  WHERE id = NEW.client_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_messages_update_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- FunÃ§Ã£o helper para pegar o tenant_id do usuÃ¡rio logado
-- Nota: criada no schema public (sem permissÃ£o para criar em auth)
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- â”€â”€â”€ POLICIES: TENANTS â”€â”€â”€
CREATE POLICY "Tenant: users can view own tenant"
  ON tenants FOR SELECT
  USING (id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: PROFILES â”€â”€â”€
CREATE POLICY "Profiles: users can view own tenant profiles"
  ON profiles FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Profiles: users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- â”€â”€â”€ POLICIES: CLIENTS â”€â”€â”€
CREATE POLICY "Clients: tenant isolation SELECT"
  ON clients FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Clients: tenant isolation INSERT"
  ON clients FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Clients: tenant isolation UPDATE"
  ON clients FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Clients: tenant isolation DELETE"
  ON clients FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: CONVERSATIONS â”€â”€â”€
CREATE POLICY "Conversations: tenant isolation SELECT"
  ON conversations FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Conversations: tenant isolation INSERT"
  ON conversations FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Conversations: tenant isolation UPDATE"
  ON conversations FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: MESSAGES â”€â”€â”€
CREATE POLICY "Messages: tenant isolation SELECT"
  ON messages FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Messages: tenant isolation INSERT"
  ON messages FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: PRODUCTS â”€â”€â”€
CREATE POLICY "Products: tenant isolation SELECT"
  ON products FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Products: tenant isolation INSERT"
  ON products FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Products: tenant isolation UPDATE"
  ON products FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Products: tenant isolation DELETE"
  ON products FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: ORDERS â”€â”€â”€
CREATE POLICY "Orders: tenant isolation SELECT"
  ON orders FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Orders: tenant isolation INSERT"
  ON orders FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Orders: tenant isolation UPDATE"
  ON orders FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: ORDER_ITEMS â”€â”€â”€
CREATE POLICY "OrderItems: tenant isolation SELECT"
  ON order_items FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "OrderItems: tenant isolation INSERT"
  ON order_items FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: CAMPAIGNS â”€â”€â”€
CREATE POLICY "Campaigns: tenant isolation SELECT"
  ON campaigns FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Campaigns: tenant isolation INSERT"
  ON campaigns FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Campaigns: tenant isolation UPDATE"
  ON campaigns FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Campaigns: tenant isolation DELETE"
  ON campaigns FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: COUPONS â”€â”€â”€
CREATE POLICY "Coupons: tenant isolation SELECT"
  ON coupons FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Coupons: tenant isolation INSERT"
  ON coupons FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "Coupons: tenant isolation UPDATE"
  ON coupons FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "Coupons: tenant isolation DELETE"
  ON coupons FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: QUICK_REPLIES â”€â”€â”€
CREATE POLICY "QuickReplies: tenant isolation SELECT"
  ON quick_replies FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "QuickReplies: tenant isolation INSERT"
  ON quick_replies FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "QuickReplies: tenant isolation UPDATE"
  ON quick_replies FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "QuickReplies: tenant isolation DELETE"
  ON quick_replies FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: CLIENT_NOTES â”€â”€â”€
CREATE POLICY "ClientNotes: tenant isolation SELECT"
  ON client_notes FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "ClientNotes: tenant isolation INSERT"
  ON client_notes FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "ClientNotes: tenant isolation UPDATE"
  ON client_notes FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "ClientNotes: tenant isolation DELETE"
  ON client_notes FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â”€â”€â”€ POLICIES: TENANT_CONFIG â”€â”€â”€
CREATE POLICY "TenantConfig: tenant isolation SELECT"
  ON tenant_config FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "TenantConfig: tenant isolation UPDATE"
  ON tenant_config FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- ============================================================
-- STORAGE BUCKETS (para arquivos de mÃ­dia)
-- ============================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage
CREATE POLICY "Media: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('media', 'avatars'));

CREATE POLICY "Media: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('media', 'avatars'));

CREATE POLICY "Media: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id IN ('media', 'avatars'));
