CREATE TABLE IF NOT EXISTS public.remote_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('sftp', 'ftp')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password', 'private_key')),
  secret_ref TEXT,
  credentials_encrypted TEXT,
  remote_root_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'testing')),
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  import_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_prompt_id UUID REFERENCES public.prompts(id) ON DELETE SET NULL,
  auto_import_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (schedule_interval_minutes >= 5),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remote_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.remote_connections(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.prompts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanning', 'ready', 'importing', 'imported', 'processing', 'completed', 'error', 'cancelled')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  files_found INTEGER NOT NULL DEFAULT 0,
  files_eligible INTEGER NOT NULL DEFAULT 0,
  files_imported INTEGER NOT NULL DEFAULT 0,
  files_excluded INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remote_import_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES public.remote_import_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.remote_connections(id) ON DELETE CASCADE,
  audio_file_id UUID REFERENCES public.audio_files(id) ON DELETE SET NULL,
  remote_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  modified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_import' CHECK (status IN ('pending_import', 'excluded', 'importing', 'imported', 'transcribing', 'transcribed', 'analyzing', 'analyzed', 'duplicate', 'error')),
  excluded_reason TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, remote_path)
);

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

ALTER TABLE public.remote_connections DROP CONSTRAINT IF EXISTS remote_connections_schedule_interval_min;
ALTER TABLE public.remote_connections ADD CONSTRAINT remote_connections_schedule_interval_min CHECK (schedule_interval_minutes >= 5) NOT VALID;
ALTER TABLE public.remote_connections VALIDATE CONSTRAINT remote_connections_schedule_interval_min;

CREATE INDEX IF NOT EXISTS idx_remote_connections_account_id ON public.remote_connections(account_id);
CREATE INDEX IF NOT EXISTS idx_remote_connections_next_run ON public.remote_connections(next_run_at) WHERE auto_import_enabled = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_remote_import_jobs_account_id ON public.remote_import_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_remote_import_jobs_connection_status ON public.remote_import_jobs(connection_id, status);
CREATE INDEX IF NOT EXISTS idx_remote_import_files_job_id ON public.remote_import_files(import_job_id);
CREATE INDEX IF NOT EXISTS idx_remote_import_files_remote_path ON public.remote_import_files(account_id, remote_path);
CREATE INDEX IF NOT EXISTS idx_remote_import_files_status ON public.remote_import_files(account_id, status);
CREATE INDEX IF NOT EXISTS idx_remote_import_files_connection_status ON public.remote_import_files(connection_id, status);

ALTER TABLE public.remote_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_import_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remote_connections' AND policyname = 'Account users manage remote connections') THEN
    CREATE POLICY "Account users manage remote connections" ON public.remote_connections
    FOR ALL TO authenticated
    USING (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()))
    WITH CHECK (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remote_import_jobs' AND policyname = 'Account users manage remote import jobs') THEN
    CREATE POLICY "Account users manage remote import jobs" ON public.remote_import_jobs
    FOR ALL TO authenticated
    USING (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()))
    WITH CHECK (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remote_import_files' AND policyname = 'Account users manage remote import files') THEN
    CREATE POLICY "Account users manage remote import files" ON public.remote_import_files
    FOR ALL TO authenticated
    USING (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()))
    WITH CHECK (public.user_has_account_access(auth.uid(), account_id) OR public.is_superadmin(auth.uid()));
  END IF;
END $$;