-- Adiciona 'plano_campanha' como tipo válido em jarvis_memoria
ALTER TABLE jarvis_memoria
  DROP CONSTRAINT IF EXISTS jarvis_memoria_tipo_check;

ALTER TABLE jarvis_memoria
  ADD CONSTRAINT jarvis_memoria_tipo_check
  CHECK (tipo IN (
    'campanha_resultado', 'publico_performance',
    'criativo_score', 'aprendizado', 'decisao', 'plano_campanha'
  ));
