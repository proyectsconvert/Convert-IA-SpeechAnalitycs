ALTER TABLE public.remote_import_files
  DROP CONSTRAINT IF EXISTS remote_import_files_account_id_remote_path_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remote_import_files_import_job_id_remote_path_key'
      AND conrelid = 'public.remote_import_files'::regclass
  ) THEN
    ALTER TABLE public.remote_import_files
      ADD CONSTRAINT remote_import_files_import_job_id_remote_path_key
      UNIQUE (import_job_id, remote_path);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_remote_import_files_account_remote_path
  ON public.remote_import_files(account_id, remote_path);

CREATE INDEX IF NOT EXISTS idx_remote_import_files_status_job
  ON public.remote_import_files(import_job_id, status);