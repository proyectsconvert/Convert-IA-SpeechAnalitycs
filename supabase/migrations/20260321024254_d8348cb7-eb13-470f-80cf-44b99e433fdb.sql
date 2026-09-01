
-- ============================================
-- VOICE METRICS AI - MULTI-TENANT SCHEMA
-- ============================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'supervisor', 'analyst', 'observer');
CREATE TYPE public.account_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.audio_status AS ENUM ('uploaded', 'pending', 'queued', 'transcribing', 'transcribed', 'analyzing', 'completed', 'error', 'reprocessing', 'cancelled');
CREATE TYPE public.prompt_status AS ENUM ('active', 'draft', 'archived');
CREATE TYPE public.subscription_plan AS ENUM ('starter', 'pro', 'enterprise');

-- ============================================
-- ACCOUNTS (Tenants)
-- ============================================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  slug TEXT UNIQUE NOT NULL,
  status account_status NOT NULL DEFAULT 'active',
  plan subscription_plan NOT NULL DEFAULT 'starter',
  max_storage_gb INTEGER NOT NULL DEFAULT 10,
  max_processing_minutes INTEGER NOT NULL DEFAULT 1000,
  max_users INTEGER NOT NULL DEFAULT 5,
  locale TEXT DEFAULT 'es',
  branding JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  phone TEXT,
  is_superadmin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- USER-ACCOUNT ASSOCIATION (multi-account)
-- ============================================
CREATE TABLE public.user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'observer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- ============================================
-- PERMISSIONS
-- ============================================
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  UNIQUE(module, action)
);

CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id)
);

CREATE TABLE public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, account_id, permission_id)
);

-- ============================================
-- PROMPTS
-- ============================================
CREATE TABLE public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  model TEXT DEFAULT 'gpt-5.4',
  system_instructions TEXT NOT NULL DEFAULT '',
  input_variables JSONB DEFAULT '[]',
  output_mapping JSONB DEFAULT '[]',
  status prompt_status NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_instructions TEXT NOT NULL,
  output_mapping JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- AUDIO FILES / CALLS
-- ============================================
CREATE TABLE public.audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  duration_seconds INTEGER DEFAULT 0,
  status audio_status NOT NULL DEFAULT 'uploaded',
  prompt_id UUID REFERENCES public.prompts(id),
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TRANSCRIPTIONS
-- ============================================
CREATE TABLE public.transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  full_text TEXT,
  language TEXT DEFAULT 'es',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transcription_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id UUID NOT NULL REFERENCES public.transcriptions(id) ON DELETE CASCADE,
  speaker TEXT,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  text TEXT NOT NULL,
  sentiment TEXT,
  sentiment_score NUMERIC,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ANALYSES
-- ============================================
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.prompts(id),
  overall_sentiment TEXT,
  sentiment_score NUMERIC,
  summary TEXT,
  insights JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  results JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- PROCESSING JOBS
-- ============================================
CREATE TABLE public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'full',
  status audio_status NOT NULL DEFAULT 'queued',
  prompt_id UUID REFERENCES public.prompts(id),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  detail TEXT,
  metadata JSONB DEFAULT '{}',
  result TEXT DEFAULT 'success',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- BILLING
-- ============================================
CREATE TABLE public.billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  storage_used_gb NUMERIC DEFAULT 0,
  minutes_processed NUMERIC DEFAULT 0,
  transcriptions_count INTEGER DEFAULT 0,
  analyses_count INTEGER DEFAULT 0,
  amount_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_user_accounts_user ON public.user_accounts(user_id);
CREATE INDEX idx_user_accounts_account ON public.user_accounts(account_id);
CREATE INDEX idx_audio_files_account ON public.audio_files(account_id);
CREATE INDEX idx_audio_files_status ON public.audio_files(status);
CREATE INDEX idx_transcriptions_audio ON public.transcriptions(audio_file_id);
CREATE INDEX idx_transcription_segments_transcription ON public.transcription_segments(transcription_id);
CREATE INDEX idx_analyses_audio ON public.analyses(audio_file_id);
CREATE INDEX idx_analyses_account ON public.analyses(account_id);
CREATE INDEX idx_processing_jobs_account ON public.processing_jobs(account_id);
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX idx_audit_logs_account ON public.audit_logs(account_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);
CREATE INDEX idx_prompts_account ON public.prompts(account_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcription_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: check superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_superadmin FROM public.profiles WHERE id = _user_id), false);
$$;

-- Helper: check user belongs to account
CREATE OR REPLACE FUNCTION public.user_has_account_access(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_accounts
    WHERE user_id = _user_id AND account_id = _account_id AND is_active = true
  ) OR public.is_superadmin(_user_id);
$$;

-- Profiles: users can read/update their own
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_superadmin(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "System inserts profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Accounts: users see accounts they belong to
CREATE POLICY "Users see their accounts" ON public.accounts FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()) OR id IN (SELECT account_id FROM public.user_accounts WHERE user_id = auth.uid() AND is_active = true));
CREATE POLICY "Superadmin manages accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- User accounts: visible to account members
CREATE POLICY "Users see own memberships" ON public.user_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()) OR account_id IN (SELECT account_id FROM public.user_accounts WHERE user_id = auth.uid() AND is_active = true));

-- Permissions: readable by all authenticated
CREATE POLICY "Permissions readable" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role permissions readable" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- User permission overrides
CREATE POLICY "Own overrides" ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

-- Prompts: account-scoped
CREATE POLICY "Prompts account access" ON public.prompts FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Prompts insert" ON public.prompts FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Prompts update" ON public.prompts FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Prompt versions: same as prompts
CREATE POLICY "Prompt versions access" ON public.prompt_versions FOR SELECT TO authenticated
  USING (prompt_id IN (SELECT id FROM public.prompts WHERE public.user_has_account_access(auth.uid(), account_id)));

-- Audio files: account-scoped
CREATE POLICY "Audio account access" ON public.audio_files FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Audio insert" ON public.audio_files FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Audio update" ON public.audio_files FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Transcriptions: account-scoped
CREATE POLICY "Transcriptions access" ON public.transcriptions FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Transcription segments via transcription
CREATE POLICY "Segments access" ON public.transcription_segments FOR SELECT TO authenticated
  USING (transcription_id IN (SELECT id FROM public.transcriptions WHERE public.user_has_account_access(auth.uid(), account_id)));

-- Analyses: account-scoped
CREATE POLICY "Analyses access" ON public.analyses FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Processing jobs: account-scoped
CREATE POLICY "Jobs access" ON public.processing_jobs FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Audit logs: account-scoped
CREATE POLICY "Audit access" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Billing: account-scoped + admin only
CREATE POLICY "Billing access" ON public.billing_records FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Notifications: user-scoped
CREATE POLICY "Own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- TRIGGER: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED: Default permissions
-- ============================================
INSERT INTO public.permissions (module, action) VALUES
  ('centro_inteligencia', 'ver'), ('centro_inteligencia', 'exportar'),
  ('biblioteca', 'ver'), ('biblioteca', 'crear'), ('biblioteca', 'editar'), ('biblioteca', 'borrar'), ('biblioteca', 'procesar'), ('biblioteca', 'exportar'),
  ('transcripciones', 'ver'), ('transcripciones', 'editar'), ('transcripciones', 'exportar'),
  ('analiticas', 'ver'), ('analiticas', 'exportar'),
  ('prompts', 'ver'), ('prompts', 'crear'), ('prompts', 'editar'), ('prompts', 'borrar'),
  ('cuentas', 'ver'), ('cuentas', 'crear'), ('cuentas', 'editar'), ('cuentas', 'borrar'), ('cuentas', 'administrar'),
  ('usuarios', 'ver'), ('usuarios', 'crear'), ('usuarios', 'editar'), ('usuarios', 'borrar'), ('usuarios', 'asignar'),
  ('roles', 'ver'), ('roles', 'crear'), ('roles', 'editar'), ('roles', 'borrar'),
  ('facturacion', 'ver'), ('facturacion', 'administrar'),
  ('auditoria', 'ver'),
  ('soporte', 'ver'),
  ('exportaciones', 'ver'), ('exportaciones', 'crear'),
  ('configuracion', 'ver'), ('configuracion', 'editar');
