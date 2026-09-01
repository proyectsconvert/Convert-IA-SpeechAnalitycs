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
  remote_root_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'testing')),
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_remote_connections_account_id ON public.remote_connections(account_id);
CREATE INDEX IF NOT EXISTS idx_remote_import_jobs_account_id ON public.remote_import_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_remote_import_files_job_id ON public.remote_import_files(import_job_id);

ALTER TABLE public.remote_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_import_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account users manage remote connections" ON public.remote_connections FOR ALL TO authenticated USING (public.user_has_account_access(auth.uid(), account_id)) WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Account users manage remote import jobs" ON public.remote_import_jobs FOR ALL TO authenticated USING (public.user_has_account_access(auth.uid(), account_id)) WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Account users manage remote import files" ON public.remote_import_files FOR ALL TO authenticated USING (public.user_has_account_access(auth.uid(), account_id)) WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
