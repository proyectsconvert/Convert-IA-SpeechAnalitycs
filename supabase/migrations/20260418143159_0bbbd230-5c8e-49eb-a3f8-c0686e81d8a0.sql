-- 1. Add new limit columns to account_limits
ALTER TABLE public.account_limits
  ADD COLUMN IF NOT EXISTS max_whatsapp_conversations integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_presentations integer NOT NULL DEFAULT 50;

-- 2. Add new usage counters to usage_tracking
ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS whatsapp_conversations_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presentations_created integer NOT NULL DEFAULT 0;

-- 3. Replace increment_usage to support new counters
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_account_id uuid,
  p_transcription_hours numeric DEFAULT 0,
  p_chatbot_queries integer DEFAULT 0,
  p_files_processed integer DEFAULT 0,
  p_whatsapp_conversations integer DEFAULT 0,
  p_presentations integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
  v_period_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
BEGIN
  INSERT INTO usage_tracking (
    account_id, period_start, period_end,
    transcription_hours_used, chatbot_queries_used, files_processed,
    whatsapp_conversations_used, presentations_created
  )
  VALUES (
    p_account_id, v_period_start, v_period_end,
    p_transcription_hours, p_chatbot_queries, p_files_processed,
    p_whatsapp_conversations, p_presentations
  )
  ON CONFLICT (account_id, period_start) DO UPDATE SET
    transcription_hours_used = usage_tracking.transcription_hours_used + p_transcription_hours,
    chatbot_queries_used = usage_tracking.chatbot_queries_used + p_chatbot_queries,
    files_processed = usage_tracking.files_processed + p_files_processed,
    whatsapp_conversations_used = usage_tracking.whatsapp_conversations_used + p_whatsapp_conversations,
    presentations_created = usage_tracking.presentations_created + p_presentations,
    updated_at = now();
END;
$function$;

-- 4. Replace check_account_limits to support new check types
CREATE OR REPLACE FUNCTION public.check_account_limits(
  p_account_id uuid,
  p_check_type text DEFAULT 'transcription'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ELSIF p_check_type = 'whatsapp' THEN
    RETURN v_usage.whatsapp_conversations_used < v_limits.max_whatsapp_conversations;
  ELSIF p_check_type = 'presentations' THEN
    RETURN v_usage.presentations_created < v_limits.max_presentations;
  END IF;

  RETURN true;
END;
$function$;