
-- Chat messages for general chatbot (account-level queries)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chat messages for per-call queries
CREATE TABLE IF NOT EXISTS public.call_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id uuid NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Account limits table for controlling usage
CREATE TABLE IF NOT EXISTS public.account_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE UNIQUE,
  max_transcription_hours numeric NOT NULL DEFAULT 10,
  max_chatbot_queries integer NOT NULL DEFAULT 500,
  max_storage_gb numeric NOT NULL DEFAULT 10,
  additional_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  period_end date NOT NULL DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date,
  transcription_hours_used numeric NOT NULL DEFAULT 0,
  chatbot_queries_used integer NOT NULL DEFAULT 0,
  storage_gb_used numeric NOT NULL DEFAULT 0,
  files_processed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, period_start)
);

-- Add columns to audio_files
ALTER TABLE public.audio_files ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.audio_files ADD COLUMN IF NOT EXISTS call_topic text;
ALTER TABLE public.audio_files ADD COLUMN IF NOT EXISTS sentiment text;

-- RLS for chat_messages
CREATE POLICY "Chat messages access" ON public.chat_messages
  FOR SELECT USING (user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Chat messages insert" ON public.chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid() AND user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Chat messages delete" ON public.chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- RLS for call_chat_messages
CREATE POLICY "Call chat messages access" ON public.call_chat_messages
  FOR SELECT USING (user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Call chat messages insert" ON public.call_chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid() AND user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Call chat messages delete" ON public.call_chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- RLS for account_limits
CREATE POLICY "Account limits access" ON public.account_limits
  FOR SELECT USING (user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Account limits manage" ON public.account_limits
  FOR ALL USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

-- RLS for usage_tracking
CREATE POLICY "Usage tracking access" ON public.usage_tracking
  FOR SELECT USING (user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Usage tracking insert" ON public.usage_tracking
  FOR INSERT WITH CHECK (user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Usage tracking update" ON public.usage_tracking
  FOR UPDATE USING (user_has_account_access(auth.uid(), account_id));

-- Function to increment usage
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_account_id uuid,
  p_transcription_hours numeric DEFAULT 0,
  p_chatbot_queries integer DEFAULT 0,
  p_files_processed integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
  v_period_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
BEGIN
  INSERT INTO usage_tracking (account_id, period_start, period_end, transcription_hours_used, chatbot_queries_used, files_processed)
  VALUES (p_account_id, v_period_start, v_period_end, p_transcription_hours, p_chatbot_queries, p_files_processed)
  ON CONFLICT (account_id, period_start) DO UPDATE SET
    transcription_hours_used = usage_tracking.transcription_hours_used + p_transcription_hours,
    chatbot_queries_used = usage_tracking.chatbot_queries_used + p_chatbot_queries,
    files_processed = usage_tracking.files_processed + p_files_processed,
    updated_at = now();
END;
$$;

-- Function to check account limits
CREATE OR REPLACE FUNCTION public.check_account_limits(
  p_account_id uuid,
  p_check_type text DEFAULT 'transcription'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits account_limits;
  v_usage usage_tracking;
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  SELECT * INTO v_limits FROM account_limits WHERE account_id = p_account_id;
  IF NOT FOUND THEN RETURN true; END IF;
  
  SELECT * INTO v_usage FROM usage_tracking 
  WHERE account_id = p_account_id AND period_start = v_period_start;
  IF NOT FOUND THEN RETURN true; END IF;
  
  IF p_check_type = 'transcription' THEN
    RETURN v_usage.transcription_hours_used < (v_limits.max_transcription_hours + v_limits.additional_hours);
  ELSIF p_check_type = 'chatbot' THEN
    RETURN v_usage.chatbot_queries_used < v_limits.max_chatbot_queries;
  END IF;
  
  RETURN true;
END;
$$;
