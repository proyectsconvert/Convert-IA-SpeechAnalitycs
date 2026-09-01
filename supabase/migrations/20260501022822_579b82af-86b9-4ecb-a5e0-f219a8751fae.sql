
-- Enable required extensions for scheduled background jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any previous version of the job (idempotent)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'remote-import-scheduled-runner';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- Schedule the runner every minute. It calls the edge function with the
-- supabase anon key + x-remote-import-scheduler header, which the edge
-- function explicitly recognizes as a valid scheduled trigger.
SELECT cron.schedule(
  'remote-import-scheduled-runner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://supabase-speech.testbot.click/functions/v1/remote-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4MTk3NTg3LCJleHAiOjIxMDM1NTc1ODd9.ghIJKL8fzYcnnOoUwMq9NCjcfad3urENUOqpRLOFfTk',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4MTk3NTg3LCJleHAiOjIxMDM1NTc1ODd9.ghIJKL8fzYcnnOoUwMq9NCjcfad3urENUOqpRLOFfTk',
      'x-remote-import-scheduler', 'pg_cron'
    ),
    body := jsonb_build_object('action', 'scheduled', 'triggered_at', now()::text),
    timeout_milliseconds := 60000
  );
  $$
);
