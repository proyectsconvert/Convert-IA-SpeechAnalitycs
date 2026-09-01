DROP POLICY IF EXISTS "Account audio upload" ON storage.objects;

CREATE POLICY "Account audio upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-files'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id::text = (storage.foldername(name))[1]
      AND public.user_has_account_access(auth.uid(), a.id)
  )
);