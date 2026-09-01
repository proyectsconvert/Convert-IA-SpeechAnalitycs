-- Create remote_import_automations table
CREATE TABLE IF NOT EXISTS public.remote_import_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.remote_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  import_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_prompt_id UUID REFERENCES public.prompts(id) ON DELETE SET NULL,
  schedule_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_message TEXT,
  automation_lock_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add automation_id to jobs
ALTER TABLE public.remote_import_jobs 
  ADD COLUMN IF NOT EXISTS automation_id UUID REFERENCES public.remote_import_automations(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.remote_import_automations ENABLE ROW LEVEL SECURITY;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'remote_import_automations' AND policyname = 'Account users manage automations'
  ) THEN
    CREATE POLICY "Account users manage automations" ON public.remote_import_automations 
    FOR ALL TO authenticated 
    USING (public.user_has_account_access(auth.uid(), account_id) OR (SELECT is_superadmin FROM profiles WHERE id = auth.uid())) 
    WITH CHECK (public.user_has_account_access(auth.uid(), account_id) OR (SELECT is_superadmin FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Migrate existing automation data from remote_connections to remote_import_automations
INSERT INTO public.remote_import_automations (
  account_id, connection_id, name, is_enabled, import_filters, default_prompt_id, 
  schedule_interval_minutes, last_run_at, next_run_at, last_run_status, last_run_message
)
SELECT 
  account_id, id, 'Automatización por defecto', auto_import_enabled, import_filters, default_prompt_id,
  schedule_interval_minutes, last_run_at, next_run_at, last_run_status, last_run_message
FROM public.remote_connections
WHERE auto_import_enabled = true OR (import_filters IS NOT NULL AND import_filters != '{}'::jsonb);

-- RPC for the scheduler
CREATE OR REPLACE FUNCTION public.claim_due_remote_automations(
  p_limit integer DEFAULT 10,
  p_lock_seconds integer DEFAULT 900,
  p_lead_seconds integer DEFAULT 20
)
RETURNS SETOF public.remote_import_automations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_id uuid := gen_random_uuid();
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH target_automations AS (
    SELECT a.id
    FROM public.remote_import_automations a
    JOIN public.remote_connections c ON a.connection_id = c.id
    WHERE a.is_enabled = true
      AND c.status = 'active'
      AND (a.next_run_at IS NULL OR a.next_run_at <= (v_now + (p_lead_seconds || ' seconds')::interval))
      AND (a.automation_lock_id IS NULL OR a.updated_at < (v_now - (p_lock_seconds || ' seconds')::interval))
    ORDER BY a.next_run_at ASC NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.remote_import_automations a
  SET 
    automation_lock_id = v_lock_id,
    updated_at = v_now
  FROM target_automations
  WHERE a.id = target_automations.id
  RETURNING a.*;
END;
$$;

-- RPC to release lock
CREATE OR REPLACE FUNCTION public.release_remote_automation_lock(
  p_automation_id uuid,
  p_lock_id uuid,
  p_status text DEFAULT 'idle'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.remote_import_automations
  SET 
    automation_lock_id = NULL,
    updated_at = now()
  WHERE id = p_automation_id 
    AND (automation_lock_id = p_lock_id OR p_lock_id IS NULL);
END;
$$;
