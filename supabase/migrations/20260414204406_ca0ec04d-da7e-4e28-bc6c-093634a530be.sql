-- Remove the redundant overly-permissive storage SELECT policy for audio-files
-- This policy only checks bucket_id without account ownership, granting all authenticated users read access
DROP POLICY IF EXISTS "Users can read own account audio" ON storage.objects;