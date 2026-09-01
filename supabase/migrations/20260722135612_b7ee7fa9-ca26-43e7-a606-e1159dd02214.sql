
-- Flexibilizar el RPC del cron para que solo excluya conexiones marcadas explícitamente como 'inactive'.
-- Antes, cualquier estado distinto de 'active' (por ej. 'error' tras un fallo transitorio) bloqueaba la automatización.
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
      AND COALESCE(c.status, 'active') <> 'inactive'
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
