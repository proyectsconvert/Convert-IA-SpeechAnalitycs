DO $$
DECLARE
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
  v_period_end   date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  r record;
BEGIN
  FOR r IN
    SELECT account_id, COUNT(*)::int AS total
    FROM public.whatsapp_conversations
    WHERE created_at >= v_period_start
      AND created_at <  (v_period_end + interval '1 day')
    GROUP BY account_id
  LOOP
    INSERT INTO public.usage_tracking (
      account_id, period_start, period_end,
      transcription_hours_used, chatbot_queries_used, files_processed,
      whatsapp_conversations_used, presentations_created
    ) VALUES (
      r.account_id, v_period_start, v_period_end,
      0, 0, 0, r.total, 0
    )
    ON CONFLICT (account_id, period_start) DO UPDATE
      SET whatsapp_conversations_used = r.total,
          updated_at = now();
  END LOOP;
END$$;