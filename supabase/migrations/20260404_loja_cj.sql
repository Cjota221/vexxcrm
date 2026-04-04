-- Tabela de pedidos da loja CJ Rasteirinhas
CREATE TABLE IF NOT EXISTS loja_pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'aguardando_pagamento' | 'pago' | 'em_separacao' | 'enviado' | 'entregue' | 'cancelado'

  -- Dados da revendedora
  revendedora_nome TEXT NOT NULL,
  revendedora_cpf_cnpj TEXT,
  revendedora_telefone TEXT NOT NULL,
  revendedora_email TEXT,
  revendedora_instagram TEXT,

  -- Endereço de entrega
  cep TEXT,
  logradouro TEXT,
  numero_end TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  frete_valor NUMERIC(10,2) DEFAULT 0,
  frete_prazo TEXT,
  frete_servico TEXT,

  -- Valores
  subtotal NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,

  -- Pagamento
  forma_pagamento TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  pago_em TIMESTAMPTZ,

  -- Controle
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Itens do pedido
CREATE TABLE IF NOT EXISTS loja_pedido_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES loja_pedidos(id) ON DELETE CASCADE,
  produto_id TEXT NOT NULL,
  produto_sku TEXT,
  produto_nome TEXT NOT NULL,
  produto_foto_url TEXT,
  cor TEXT,
  tamanho TEXT,
  quantidade INT NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

-- Sequência para número do pedido
CREATE SEQUENCE IF NOT EXISTS loja_pedido_seq START 1;

-- Índices
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_status ON loja_pedidos(status);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_criado ON loja_pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_loja_pedido_itens_pedido ON loja_pedido_itens(pedido_id);

-- RLS
ALTER TABLE loja_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_pedido_itens ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo
CREATE POLICY "admin_all_pedidos" ON loja_pedidos FOR ALL
  USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_itens" ON loja_pedido_itens FOR ALL
  USING (auth.role() = 'authenticated');

-- Inserção pública (revendedora sem conta)
CREATE POLICY "public_insert_pedido" ON loja_pedidos FOR INSERT
  WITH CHECK (true);
CREATE POLICY "public_insert_item" ON loja_pedido_itens FOR INSERT
  WITH CHECK (true);

-- Leitura pública (consulta por telefone + número feita na aplicação)
CREATE POLICY "public_read_pedido" ON loja_pedidos FOR SELECT
  USING (true);
