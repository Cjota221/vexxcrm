-- ============================================================
-- VEXX CRM 2.0 – Fix Policies (Idempotente)
-- ============================================================
-- Remove e recria todas as policies para evitar erros de duplicação
-- ============================================================

-- â"€â"€â"€ POLICIES: TENANTS â"€â"€â"€
DROP POLICY IF EXISTS "Tenant: users can view own tenant" ON tenants;
CREATE POLICY "Tenant: users can view own tenant"
  ON tenants FOR SELECT
  USING (id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: PROFILES â"€â"€â"€
DROP POLICY IF EXISTS "Profiles: users can view own tenant profiles" ON profiles;
CREATE POLICY "Profiles: users can view own tenant profiles"
  ON profiles FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Profiles: users can update own profile" ON profiles;
CREATE POLICY "Profiles: users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- â"€â"€â"€ POLICIES: CLIENTS â"€â"€â"€
DROP POLICY IF EXISTS "Clients: tenant isolation SELECT" ON clients;
CREATE POLICY "Clients: tenant isolation SELECT"
  ON clients FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Clients: tenant isolation INSERT" ON clients;
CREATE POLICY "Clients: tenant isolation INSERT"
  ON clients FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Clients: tenant isolation UPDATE" ON clients;
CREATE POLICY "Clients: tenant isolation UPDATE"
  ON clients FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Clients: tenant isolation DELETE" ON clients;
CREATE POLICY "Clients: tenant isolation DELETE"
  ON clients FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: CONVERSATIONS â"€â"€â"€
DROP POLICY IF EXISTS "Conversations: tenant isolation SELECT" ON conversations;
CREATE POLICY "Conversations: tenant isolation SELECT"
  ON conversations FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Conversations: tenant isolation INSERT" ON conversations;
CREATE POLICY "Conversations: tenant isolation INSERT"
  ON conversations FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Conversations: tenant isolation UPDATE" ON conversations;
CREATE POLICY "Conversations: tenant isolation UPDATE"
  ON conversations FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: MESSAGES â"€â"€â"€
DROP POLICY IF EXISTS "Messages: tenant isolation SELECT" ON messages;
CREATE POLICY "Messages: tenant isolation SELECT"
  ON messages FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Messages: tenant isolation INSERT" ON messages;
CREATE POLICY "Messages: tenant isolation INSERT"
  ON messages FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: PRODUCTS â"€â"€â"€
DROP POLICY IF EXISTS "Products: tenant isolation SELECT" ON products;
CREATE POLICY "Products: tenant isolation SELECT"
  ON products FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Products: tenant isolation INSERT" ON products;
CREATE POLICY "Products: tenant isolation INSERT"
  ON products FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Products: tenant isolation UPDATE" ON products;
CREATE POLICY "Products: tenant isolation UPDATE"
  ON products FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Products: tenant isolation DELETE" ON products;
CREATE POLICY "Products: tenant isolation DELETE"
  ON products FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: ORDERS â"€â"€â"€
DROP POLICY IF EXISTS "Orders: tenant isolation SELECT" ON orders;
CREATE POLICY "Orders: tenant isolation SELECT"
  ON orders FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Orders: tenant isolation INSERT" ON orders;
CREATE POLICY "Orders: tenant isolation INSERT"
  ON orders FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Orders: tenant isolation UPDATE" ON orders;
CREATE POLICY "Orders: tenant isolation UPDATE"
  ON orders FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: ORDER_ITEMS â"€â"€â"€
DROP POLICY IF EXISTS "OrderItems: tenant isolation SELECT" ON order_items;
CREATE POLICY "OrderItems: tenant isolation SELECT"
  ON order_items FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "OrderItems: tenant isolation INSERT" ON order_items;
CREATE POLICY "OrderItems: tenant isolation INSERT"
  ON order_items FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: CAMPAIGNS â"€â"€â"€
DROP POLICY IF EXISTS "Campaigns: tenant isolation SELECT" ON campaigns;
CREATE POLICY "Campaigns: tenant isolation SELECT"
  ON campaigns FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Campaigns: tenant isolation INSERT" ON campaigns;
CREATE POLICY "Campaigns: tenant isolation INSERT"
  ON campaigns FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Campaigns: tenant isolation UPDATE" ON campaigns;
CREATE POLICY "Campaigns: tenant isolation UPDATE"
  ON campaigns FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Campaigns: tenant isolation DELETE" ON campaigns;
CREATE POLICY "Campaigns: tenant isolation DELETE"
  ON campaigns FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: COUPONS â"€â"€â"€
DROP POLICY IF EXISTS "Coupons: tenant isolation SELECT" ON coupons;
CREATE POLICY "Coupons: tenant isolation SELECT"
  ON coupons FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Coupons: tenant isolation INSERT" ON coupons;
CREATE POLICY "Coupons: tenant isolation INSERT"
  ON coupons FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Coupons: tenant isolation UPDATE" ON coupons;
CREATE POLICY "Coupons: tenant isolation UPDATE"
  ON coupons FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Coupons: tenant isolation DELETE" ON coupons;
CREATE POLICY "Coupons: tenant isolation DELETE"
  ON coupons FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: QUICK_REPLIES â"€â"€â"€
DROP POLICY IF EXISTS "QuickReplies: tenant isolation SELECT" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation SELECT"
  ON quick_replies FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "QuickReplies: tenant isolation INSERT" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation INSERT"
  ON quick_replies FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "QuickReplies: tenant isolation UPDATE" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation UPDATE"
  ON quick_replies FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "QuickReplies: tenant isolation DELETE" ON quick_replies;
CREATE POLICY "QuickReplies: tenant isolation DELETE"
  ON quick_replies FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: CLIENT_NOTES â"€â"€â"€
DROP POLICY IF EXISTS "ClientNotes: tenant isolation SELECT" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation SELECT"
  ON client_notes FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "ClientNotes: tenant isolation INSERT" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation INSERT"
  ON client_notes FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "ClientNotes: tenant isolation UPDATE" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation UPDATE"
  ON client_notes FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "ClientNotes: tenant isolation DELETE" ON client_notes;
CREATE POLICY "ClientNotes: tenant isolation DELETE"
  ON client_notes FOR DELETE
  USING (tenant_id = public.get_tenant_id());

-- â"€â"€â"€ POLICIES: TENANT_CONFIG â"€â"€â"€
DROP POLICY IF EXISTS "TenantConfig: tenant isolation SELECT" ON tenant_config;
CREATE POLICY "TenantConfig: tenant isolation SELECT"
  ON tenant_config FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "TenantConfig: tenant isolation UPDATE" ON tenant_config;
CREATE POLICY "TenantConfig: tenant isolation UPDATE"
  ON tenant_config FOR UPDATE
  USING (tenant_id = public.get_tenant_id());

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Media: authenticated upload" ON storage.objects;
CREATE POLICY "Media: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('media', 'avatars'));

DROP POLICY IF EXISTS "Media: public read" ON storage.objects;
CREATE POLICY "Media: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('media', 'avatars'));

DROP POLICY IF EXISTS "Media: owner delete" ON storage.objects;
CREATE POLICY "Media: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id IN ('media', 'avatars'));
