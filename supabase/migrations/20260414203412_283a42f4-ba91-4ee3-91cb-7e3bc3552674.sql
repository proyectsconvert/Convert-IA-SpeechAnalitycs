-- ============================================================
-- 1. Remove old conflicting audio-files storage policies
-- ============================================================
DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload audio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read audio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete audio files" ON storage.objects;

-- Add account-verified upload policy for audio-files
CREATE POLICY "Account audio upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio-files' AND
    EXISTS (
      SELECT 1 FROM public.user_accounts ua
      WHERE ua.user_id = auth.uid()
        AND ua.is_active = true
        AND name LIKE ua.account_id::text || '/%'
    )
  );

-- Make audio-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'audio-files';

-- ============================================================
-- 2. Fix presentaciones storage policies
-- ============================================================
DROP POLICY IF EXISTS "Presentaciones Viewer" ON storage.objects;
DROP POLICY IF EXISTS "Presentaciones Uploader" ON storage.objects;
DROP POLICY IF EXISTS "Presentaciones Deleter" ON storage.objects;

CREATE POLICY "Presentaciones account read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'presentaciones' AND
    EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.bucket_path IS NOT NULL
        AND name LIKE p.bucket_path || '%'
        AND public.user_has_account_access(auth.uid(), p.account_id)
    )
  );

CREATE POLICY "Presentaciones account upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'presentaciones' AND
    EXISTS (
      SELECT 1 FROM public.user_accounts ua
      WHERE ua.user_id = auth.uid()
        AND ua.is_active = true
    )
  );

CREATE POLICY "Presentaciones account delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'presentaciones' AND
    EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.bucket_path IS NOT NULL
        AND name LIKE p.bucket_path || '%'
        AND public.user_has_account_access(auth.uid(), p.account_id)
    )
  );

-- Make presentaciones bucket private
UPDATE storage.buckets SET public = false WHERE id = 'presentaciones';

-- ============================================================
-- 3. Fix call_extractions INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "System insert call extractions" ON public.call_extractions;

CREATE POLICY "System insert call extractions" ON public.call_extractions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audio_files af
      WHERE af.id = audio_file_id
        AND public.user_has_account_access(auth.uid(), af.account_id)
    )
  );