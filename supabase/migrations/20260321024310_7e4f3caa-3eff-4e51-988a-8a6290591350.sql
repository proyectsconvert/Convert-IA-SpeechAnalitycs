
-- Fix overly permissive INSERT policies
DROP POLICY "Audit insert" ON public.audit_logs;
CREATE POLICY "Audit insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY "Insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.user_has_account_access(auth.uid(), account_id));
