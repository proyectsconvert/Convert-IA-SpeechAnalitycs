-- ============================================================
-- Migration: transcription_providers
-- Stores per-account transcription provider configuration
-- for the multi-provider cascade system.
-- ============================================================

-- Enable pgcrypto if not already enabled (needed for key encryption)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.transcription_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('assemblyai', 'deepgram', 'openai')),
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  api_key_encrypted TEXT,
  api_key_hint TEXT,
  model TEXT NOT NULL,
  available_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider)
);

-- Index for fast lookups by account
CREATE INDEX IF NOT EXISTS idx_transcription_providers_account
  ON public.transcription_providers(account_id);

-- RLS
ALTER TABLE public.transcription_providers ENABLE ROW LEVEL SECURITY;

-- Policy: users can read providers for accounts they belong to
CREATE POLICY "Users can view their account providers"
  ON public.transcription_providers FOR SELECT
  USING (
    account_id IN (
      SELECT ua.account_id FROM public.user_accounts ua
      WHERE ua.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
    )
  );

-- Policy: only admins/owners can modify providers
CREATE POLICY "Admins can manage providers"
  ON public.transcription_providers FOR ALL
  USING (
    account_id IN (
      SELECT ua.account_id FROM public.user_accounts ua
      WHERE ua.user_id = auth.uid() AND ua.role IN ('superadmin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
    )
  );

-- Seed default provider configuration for all existing accounts
INSERT INTO public.transcription_providers (account_id, provider, display_name, priority, enabled, model, available_models, config)
SELECT
  a.id,
  'assemblyai',
  'AssemblyAI',
  1,
  false,
  'universal-2',
  '["universal-2", "universal-3-pro"]'::jsonb,
  '{"speaker_labels": true, "language_code": "es"}'::jsonb
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.transcription_providers tp
  WHERE tp.account_id = a.id AND tp.provider = 'assemblyai'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.transcription_providers (account_id, provider, display_name, priority, enabled, model, available_models, config)
SELECT
  a.id,
  'deepgram',
  'Deepgram',
  2,
  false,
  'nova-3',
  '["nova-3", "nova-2", "nova"]'::jsonb,
  '{"diarize": true, "utterances": true, "smart_format": true, "language": "es-419"}'::jsonb
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.transcription_providers tp
  WHERE tp.account_id = a.id AND tp.provider = 'deepgram'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.transcription_providers (account_id, provider, display_name, priority, enabled, model, available_models, config)
SELECT
  a.id,
  'openai',
  'OpenAI',
  3,
  true,
  'gpt-4o-mini-transcribe-2025-12-15',
  '["gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-mini-transcribe"]'::jsonb,
  '{"language": "es", "use_env_key": true}'::jsonb
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.transcription_providers tp
  WHERE tp.account_id = a.id AND tp.provider = 'openai'
)
ON CONFLICT DO NOTHING;

-- Helper function: encrypt an API key (called from Edge Functions via service role)
CREATE OR REPLACE FUNCTION public.encrypt_api_key(plain_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(
    pgp_sym_encrypt(plain_key, current_setting('app.settings.jwt_secret', true)),
    'base64'
  );
END;
$$;

-- Helper function: decrypt an API key (called from Edge Functions via service role)
CREATE OR REPLACE FUNCTION public.decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF encrypted_key IS NULL OR encrypted_key = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(
    decode(encrypted_key, 'base64'),
    current_setting('app.settings.jwt_secret', true)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Revoke direct access to encryption functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.encrypt_api_key(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_api_key(TEXT) FROM anon, authenticated;
