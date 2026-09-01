-- Fix recursive RLS on user_accounts (the self-referencing policy causes 500 errors)
DROP POLICY IF EXISTS "Users see own memberships" ON public.user_accounts;

CREATE POLICY "Users see own memberships"
ON public.user_accounts FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR is_superadmin(auth.uid())
);

-- Allow superadmins to manage user_accounts
CREATE POLICY "Superadmin manages user_accounts"
ON public.user_accounts FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Allow superadmin to delete prompts
CREATE POLICY "Prompts delete"
ON public.prompts FOR DELETE
TO authenticated
USING (is_superadmin(auth.uid()) OR user_has_account_access(auth.uid(), account_id));

-- Allow superadmin to delete audio files
CREATE POLICY "Audio delete"
ON public.audio_files FOR DELETE
TO authenticated
USING (is_superadmin(auth.uid()) OR user_has_account_access(auth.uid(), account_id));