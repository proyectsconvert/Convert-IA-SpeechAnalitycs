ALTER TABLE public.remote_connections
  ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS import_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_prompt_id UUID REFERENCES public.prompts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_import_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status TEXT,
  ADD COLUMN IF NOT EXISTS last_run_message TEXT;

CREATE INDEX IF NOT EXISTS idx_remote_connections_next_run
ON public.remote_connections(next_run_at)
WHERE auto_import_enabled = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_remote_import_files_remote_path
ON public.remote_import_files(account_id, remote_path);

CREATE INDEX IF NOT EXISTS idx_remote_import_files_status
ON public.remote_import_files(account_id, status);
