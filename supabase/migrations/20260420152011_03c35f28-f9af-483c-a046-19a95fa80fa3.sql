-- Drop la versión antigua (4 params) que generaba ambigüedad con la versión extendida (6 params).
DROP FUNCTION IF EXISTS public.increment_usage(uuid, numeric, integer, integer);

-- Asegurar que la versión completa exista con todos los parámetros opcionales.
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