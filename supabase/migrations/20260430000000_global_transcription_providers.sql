-- ============================================================
-- Migration: global_transcription_providers
-- Simplifies transcription_providers to be global (one set for all accounts)
-- ============================================================

-- 1. Remove account-specific rows and keep only one set of providers
-- We'll just truncate and re-insert to be sure
TRUNCATE public.transcription_providers;

-- 2. Modify the table structure
ALTER TABLE public.transcription_providers 
  DROP COLUMN IF EXISTS account_id CASCADE;

-- 3. Update unique constraint to be per provider only
ALTER TABLE public.transcription_providers
  DROP CONSTRAINT IF EXISTS transcription_providers_account_id_provider_key,
  ADD CONSTRAINT transcription_providers_provider_key UNIQUE (provider);

-- 4. Update RLS policies to be global (viewable by all, manageable by superadmins)
DROP POLICY IF EXISTS "Users can view their account providers" ON public.transcription_providers;
DROP POLICY IF EXISTS "Admins can manage providers" ON public.transcription_providers;

CREATE POLICY "Anyone can view global transcription providers"
  ON public.transcription_providers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only superadmins can manage global transcription providers"
  ON public.transcription_providers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.is_superadmin = true
    )
  );

-- 5. Insert global defaults
INSERT INTO public.transcription_providers (provider, display_name, priority, enabled, model, available_models, config)
VALUES 
  (
    'assemblyai', 
    'AssemblyAI', 
    1, 
    true, 
    'universal-2', 
    '["universal-2", "universal-3-pro"]'::jsonb, 
    '{"speaker_labels": true, "language_code": "es"}'::jsonb
  ),
  (
    'deepgram', 
    'Deepgram', 
    2, 
    true, 
    'nova-3', 
    '["nova-3", "nova-2", "nova"]'::jsonb, 
    '{"diarize": true, "utterances": true, "smart_format": true, "language": "es-419"}'::jsonb
  ),
  (
    'openai', 
    'OpenAI', 
    3, 
    true, 
    'gpt-4o-mini-transcribe-2025-12-15', 
    '["gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-mini-transcribe"]'::jsonb, 
    '{"language": "es", "use_env_key": true}'::jsonb
  )
ON CONFLICT (provider) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  model = EXCLUDED.model,
  available_models = EXCLUDED.available_models,
  config = EXCLUDED.config;
