-- Create audio storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audio-files', 'audio-files', false, 524288000, ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac']);

-- RLS policies for audio bucket
CREATE POLICY "Authenticated users can upload audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio-files');

CREATE POLICY "Users can read own account audio"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio-files');

CREATE POLICY "Users can delete own audio"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio-files');

-- Add INSERT policies for tables that need it
CREATE POLICY "Transcriptions insert"
ON public.transcriptions FOR INSERT TO authenticated
WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Transcriptions update"
ON public.transcriptions FOR UPDATE TO authenticated
USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Segments insert"
ON public.transcription_segments FOR INSERT TO authenticated
WITH CHECK (transcription_id IN (SELECT id FROM transcriptions WHERE user_has_account_access(auth.uid(), account_id)));

CREATE POLICY "Analyses insert"
ON public.analyses FOR INSERT TO authenticated
WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Analyses update"
ON public.analyses FOR UPDATE TO authenticated
USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Processing jobs insert"
ON public.processing_jobs FOR INSERT TO authenticated
WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Processing jobs update"
ON public.processing_jobs FOR UPDATE TO authenticated
USING (user_has_account_access(auth.uid(), account_id));