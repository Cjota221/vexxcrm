-- Tabela de curadoria: quais produtos o tenant quer exibir no catálogo público
CREATE TABLE IF NOT EXISTS catalogo_produtos (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id    TEXT          NOT NULL,          -- ID do produto na tabela products
  produto_sku   TEXT,
  produto_nome  TEXT,                            -- cache do nome
  produto_foto_url TEXT,                         -- cache da foto
  produto_preco NUMERIC(10,2),                   -- cache do preço
  ordem         INT           DEFAULT 0,         -- ordenação manual no grid
  destaque      BOOLEAN       DEFAULT FALSE,     -- badge "Destaque" no card
  ativo         BOOLEAN       DEFAULT TRUE,
  criado_em     TIMESTAMPTZ   DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(tenant_id, produto_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_tenant ON catalogo_produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_ordem  ON catalogo_produtos(tenant_id, ordem);

-- RLS
ALTER TABLE catalogo_produtos ENABLE ROW LEVEL SECURITY;

-- Leitura pública (catálogo público sem login)
CREATE POLICY "public_read_catalogo_produtos"
  ON catalogo_produtos FOR SELECT
  USING (ativo = TRUE);

-- Tenant autenticado gerencia seus próprios produtos curados
CREATE POLICY "tenant_manage_curadoria"
  ON catalogo_produtos FOR ALL
  USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
  );
