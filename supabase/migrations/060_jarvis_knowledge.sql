-- Tabelas para a base de conhecimento e memória de campanhas do Jarvis

CREATE TABLE IF NOT EXISTS jarvis_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  categoria TEXT NOT NULL
    CHECK (categoria IN (
      'negocio', 'produto', 'publico',
      'campanha', 'mercado', 'concorrencia', 'aprendizado'
    )),
  fonte TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jarvis_memoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN (
      'campanha_resultado', 'publico_performance',
      'criativo_score', 'aprendizado', 'decisao'
    )),
  referencia_id TEXT,
  titulo TEXT NOT NULL,
  contexto JSONB NOT NULL,
  resultado JSONB,
  aprendizado TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jarvis_chat_historico (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  sessao_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_knowledge_tenant
  ON jarvis_knowledge (tenant_id, categoria, ativo);

CREATE INDEX IF NOT EXISTS idx_jarvis_memoria_tenant
  ON jarvis_memoria (tenant_id, tipo);

CREATE INDEX IF NOT EXISTS idx_jarvis_chat_sessao
  ON jarvis_chat_historico (tenant_id, sessao_id, criado_em);

ALTER TABLE jarvis_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_memoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_chat_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jarvis_knowledge_tenant" ON jarvis_knowledge
  FOR ALL USING (
    tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "jarvis_memoria_tenant" ON jarvis_memoria
  FOR ALL USING (
    tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "jarvis_chat_tenant" ON jarvis_chat_historico
  FOR ALL USING (
    tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );
