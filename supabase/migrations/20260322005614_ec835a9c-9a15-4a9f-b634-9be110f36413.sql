
-- Fix #1 hardened: prevent is_superadmin change by non-superadmins
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (is_superadmin = false OR is_superadmin(auth.uid()))
  );
