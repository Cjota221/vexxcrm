-- ══════════════════════════════════════════════════════════════
-- Migration 018 — Storage policies para bucket "criativos"
-- NOTA: O bucket foi criado via API (scripts/setup-storage-criativos.js)
--       pois INSERT INTO storage.buckets exige owner do schema storage.
--       Este arquivo contém apenas as RLS policies (executar como superuser).
-- ══════════════════════════════════════════════════════════════

-- ── 1. Policies RLS para o bucket "criativos" ────────────────
-- (Executar no SQL Editor do Supabase Dashboard)
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


