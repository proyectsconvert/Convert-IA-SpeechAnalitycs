
-- Allow delete on transcription_segments for account users (needed for cascade delete)
CREATE POLICY "Segments delete" ON transcription_segments
  FOR DELETE TO authenticated
  USING (transcription_id IN (
    SELECT id FROM transcriptions WHERE user_has_account_access(auth.uid(), account_id)
  ));

-- Allow delete on transcriptions for account users
CREATE POLICY "Transcriptions delete" ON transcriptions
  FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

-- Allow delete on analyses for account users
CREATE POLICY "Analyses delete" ON analyses
  FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

-- Allow delete on processing_jobs for account users
CREATE POLICY "Processing jobs delete" ON processing_jobs
  FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));
