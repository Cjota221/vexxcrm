-- Ampliar check constraint de categoria em jarvis_knowledge
-- Adiciona 'vendas' e 'geral' que estavam faltando

ALTER TABLE jarvis_knowledge
  DROP CONSTRAINT IF EXISTS jarvis_knowledge_categoria_check;

ALTER TABLE jarvis_knowledge
  ADD CONSTRAINT jarvis_knowledge_categoria_check
  CHECK (categoria IN (
    'negocio', 'produto', 'publico',
    'campanha', 'mercado', 'concorrencia', 'aprendizado',
    'vendas', 'geral'
  ));
