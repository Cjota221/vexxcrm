-- Espelho das etiquetas WhatsApp aplicadas em cada cliente
CREATE TABLE IF NOT EXISTS client_labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label_name text NOT NULL,
  applied_by text DEFAULT 'anne', -- 'anne' | 'manual'
  applied_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, client_id, label_name)
);

CREATE INDEX IF NOT EXISTS idx_client_labels_tenant ON client_labels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_labels_label  ON client_labels(tenant_id, label_name);

ALTER TABLE client_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labels_tenant" ON client_labels FOR ALL
  USING (tenant_id = public.get_tenant_id());
