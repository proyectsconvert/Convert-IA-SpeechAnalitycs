-- Add target_module to remote_import_automations
ALTER TABLE public.remote_import_automations 
  ADD COLUMN IF NOT EXISTS target_module TEXT NOT NULL DEFAULT 'audio';

-- Add target_module to remote_import_jobs to track where the files went
ALTER TABLE public.remote_import_jobs 
  ADD COLUMN IF NOT EXISTS target_module TEXT NOT NULL DEFAULT 'audio';
