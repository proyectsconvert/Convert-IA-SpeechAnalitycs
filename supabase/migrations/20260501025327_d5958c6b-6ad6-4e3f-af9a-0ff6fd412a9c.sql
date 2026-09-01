ALTER TABLE public.remote_connections
  ADD COLUMN IF NOT EXISTS automation_lock_id uuid,
  ADD COLUMN IF NOT EXISTS automation_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS automation_lock_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS automation_last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS automation_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS schedule_lead_seconds integer NOT NULL DEFAULT 20;

ALTER TABLE public.remote_connections DROP CONSTRAINT IF EXISTS remote_connections_schedule_lead_seconds_range;
ALTER TABLE public.remote_connections
  ADD CONSTRAINT remote_connections_schedule_lead_seconds_range
  CHECK (schedule_lead_seconds >= 0 AND schedule_lead_seconds <= 55) NOT VALID;
ALTER TABLE public.remote_connections VALIDATE CONSTRAINT remote_connections_schedule_lead_seconds_range;

ALTER TABLE public.remote_import_jobs
  ADD COLUMN IF NOT EXISTS run_key text,
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS lock_id uuid,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS runner_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS runner_finished_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_remote_import_jobs_run_key
ON public.remote_import_jobs(connection_id, run_key)
WHERE run_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remote_connections_due_lock
ON public.remote_connections(next_run_at, automation_locked_until)
WHERE auto_import_enabled = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_remote_import_jobs_connection_run_key
ON public.remote_import_jobs(connection_id, run_key, status);

CREATE OR REPLACE FUNCTION public.claim_due_remote_connections(
  p_limit integer DEFAULT 10,
  p_lock_seconds integer DEFAULT 900,
  p_lead_seconds integer DEFAULT 20
)
RETURNS SETOF public.remote_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_lock_id uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT rc.id
    FROM public.remote_connections rc
    WHERE rc.status = 'active'
      AND rc.auto_import_enabled = true
      AND (rc.next_run_at IS NULL OR rc.next_run_at <= v_now + make_interval(secs => LEAST(GREATEST(COALESCE(rc.schedule_lead_seconds, p_lead_seconds), 0), 55)))
      AND (rc.automation_locked_until IS NULL OR rc.automation_locked_until < v_now)
    ORDER BY rc.next_run_at NULLS FIRST, rc.updated_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
  )
  UPDATE public.remote_connections rc
     SET automation_lock_id = v_lock_id,
         automation_locked_until = v_now + make_interval(secs => GREATEST(60, LEAST(COALESCE(p_lock_seconds, 900), 3600))),
         automation_lock_started_at = v_now,
         automation_last_heartbeat_at = v_now,
         automation_status = 'claimed'
    FROM due
   WHERE rc.id = due.id
   RETURNING rc.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_remote_connection_lock(
  p_connection_id uuid,
  p_lock_id uuid,
  p_status text DEFAULT 'idle'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.remote_connections
     SET automation_lock_id = NULL,
         automation_locked_until = NULL,
         automation_last_heartbeat_at = now(),
         automation_status = COALESCE(NULLIF(p_status, ''), 'idle')
   WHERE id = p_connection_id
     AND (automation_lock_id = p_lock_id OR p_lock_id IS NULL);
  RETURN FOUND;
END;
$$;