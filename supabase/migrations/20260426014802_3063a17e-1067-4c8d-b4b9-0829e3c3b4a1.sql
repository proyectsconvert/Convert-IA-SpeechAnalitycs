CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'remote-import-every-minute';

SELECT cron.schedule(
  'remote-import-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://supabase-speech.testbot.click/functions/v1/remote-import',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4MTk3NTg3LCJleHAiOjIxMDM1NTc1ODd9.ghIJKL8fzYcnnOoUwMq9NCjcfad3urENUOqpRLOFfTk","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4MTk3NTg3LCJleHAiOjIxMDM1NTc1ODd9.ghIJKL8fzYcnnOoUwMq9NCjcfad3urENUOqpRLOFfTk","x-remote-import-scheduler":"pg_cron"}'::jsonb,
    body := '{"action":"scheduled"}'::jsonb
  ) AS request_id;
  $$
);