-- Migration 054: Transcrição e classificação de criativos de vídeo

ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS transcricao          TEXT,
  ADD COLUMN IF NOT EXISTS transcricao_status   TEXT DEFAULT 'pendente'
    CHECK (transcricao_status IN ('pendente', 'processando', 'concluida', 'erro', 'sem_audio')),
  ADD COLUMN IF NOT EXISTS classificacao        JSONB,
  ADD COLUMN IF NOT EXISTS transcricao_erro     TEXT,
  ADD COLUMN IF NOT EXISTS transcricao_modelo   TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_modelo TEXT;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_transcricao_status
  ON ad_creatives (tenant_id, transcricao_status)
  WHERE tipo = 'video';

COMMENT ON COLUMN ad_creatives.classificacao IS
  'JSON com: tipo_conteudo, tom, tem_cta, cta_texto, adequacao_publico_frio,
   adequacao_publico_quente, adequacao_whatsapp, palavras_chave, resumo, recomendacao_uso';
