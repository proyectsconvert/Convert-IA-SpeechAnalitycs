
-- Fix #1: Prevent is_superadmin self-escalation
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_superadmin = (SELECT p.is_superadmin FROM profiles p WHERE p.id = auth.uid())
  );

-- Fix #9: Audit log pollution - restrict INSERT to own account access
DROP POLICY IF EXISTS "Audit insert" ON audit_logs;
CREATE POLICY "Audit insert" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR is_superadmin(auth.uid()))
    AND (account_id IS NULL OR user_has_account_access(auth.uid(), account_id))
  );

-- Fix #10: user_permission_overrides write policies for superadmins
CREATE POLICY "Superadmin manages overrides" ON user_permission_overrides
  FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));
