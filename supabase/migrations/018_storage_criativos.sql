-- ══════════════════════════════════════════════════════════════
-- Migration 018 — Storage bucket "criativos"
-- Bucket para upload de imagens, vídeos e áudios de campanhas.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Criar bucket público "criativos" ──────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'criativos',
  'criativos',
  true,
  52428800,  -- 50 MB (maior limite, validação real está no código)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Policy: autenticados podem fazer upload ───────────────
DROP POLICY IF EXISTS "Criativos: authenticated upload" ON storage.objects;
CREATE POLICY "Criativos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'criativos');

-- ── 3. Policy: leitura pública (URLs são públicas) ───────────
DROP POLICY IF EXISTS "Criativos: public read" ON storage.objects;
CREATE POLICY "Criativos: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'criativos');

-- ── 4. Policy: autenticados podem atualizar seus arquivos ────
DROP POLICY IF EXISTS "Criativos: authenticated update" ON storage.objects;
CREATE POLICY "Criativos: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'criativos');

-- ── 5. Policy: autenticados podem deletar seus arquivos ──────
DROP POLICY IF EXISTS "Criativos: authenticated delete" ON storage.objects;
CREATE POLICY "Criativos: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'criativos');

-- ── 6. Comentário ─────────────────────────────────────────────
COMMENT ON TABLE storage.buckets IS
  'Buckets de storage: media (chat/orders), avatars (profile pics), criativos (campaign assets)';
