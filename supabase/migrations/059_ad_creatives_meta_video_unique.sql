-- Migration 059: Constraint única para evitar duplicatas ao espelhar sync Meta
-- Necessária para o upsert onConflict: 'tenant_id,meta_video_id' funcionar.

-- Remover duplicatas antes de criar a constraint (mantém o registro mais recente)
DELETE FROM ad_creatives a
USING ad_creatives b
WHERE a.id < b.id
  AND a.tenant_id = b.tenant_id
  AND a.meta_video_id IS NOT NULL
  AND a.meta_video_id = b.meta_video_id;

CREATE UNIQUE INDEX IF NOT EXISTS ad_creatives_tenant_video_unique
  ON ad_creatives (tenant_id, meta_video_id)
  WHERE meta_video_id IS NOT NULL;
