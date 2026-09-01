-- ============================================================
-- 1. Fix presentations RLS — replace overly permissive policy
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage presentations" ON public.presentations;

CREATE POLICY "Presentations select" ON public.presentations
  FOR SELECT TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Presentations insert" ON public.presentations
  FOR INSERT TO authenticated
  WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Presentations update" ON public.presentations
  FOR UPDATE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Presentations delete" ON public.presentations
  FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

-- ============================================================
-- 2. Fix presentation_versions RLS — scope to account via parent
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage presentation_versions" ON public.presentation_versions;

CREATE POLICY "Presentation versions select" ON public.presentation_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_id
      AND user_has_account_access(auth.uid(), p.account_id)
  ));

CREATE POLICY "Presentation versions insert" ON public.presentation_versions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_id
      AND user_has_account_access(auth.uid(), p.account_id)
  ));

CREATE POLICY "Presentation versions update" ON public.presentation_versions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_id
      AND user_has_account_access(auth.uid(), p.account_id)
  ));

CREATE POLICY "Presentation versions delete" ON public.presentation_versions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_id
      AND user_has_account_access(auth.uid(), p.account_id)
  ));

-- ============================================================
-- 3. Fix storage policies — add account ownership checks
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read audio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete audio files" ON storage.objects;

CREATE POLICY "Account audio read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio-files' AND
    EXISTS (
      SELECT 1 FROM public.audio_files af
      WHERE af.file_path = name
        AND public.user_has_account_access(auth.uid(), af.account_id)
    )
  );

CREATE POLICY "Account audio delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio-files' AND
    EXISTS (
      SELECT 1 FROM public.audio_files af
      WHERE af.file_path = name
        AND public.user_has_account_access(auth.uid(), af.account_id)
    )
  );