-- ====================================================================
-- Migración de Optimización de Rendimiento
-- Bloques 6, 7 y 8: Índices de Alto Rendimiento, Columna zip_file_name,
-- Optimización de Métricas de Mensajes y Cron
-- ====================================================================

-- 1. FASE 6 & 7: Columna dedicada e índice para zip_file_name en whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS zip_file_name TEXT;

-- Consulta #1: whatsapp_conversations por account_id y zip_file_name
CREATE INDEX IF NOT EXISTS idx_wc_account_zip_file_name
  ON public.whatsapp_conversations (account_id, zip_file_name);

-- 2. FASE 7: Índices para las consultas más lentas detectadas en pg_stat_statements
-- Consulta #2: whatsapp_conversations filtrando por account_id, status y ORDER BY start_date DESC
CREATE INDEX IF NOT EXISTS idx_wc_account_status_start_date
  ON public.whatsapp_conversations (account_id, status, start_date DESC);

-- Chequeo de duplicados en importaciones (remote-import)
CREATE INDEX IF NOT EXISTS idx_wc_account_external_id
  ON public.whatsapp_conversations (account_id, external_id);

-- Consulta #3: whatsapp_analysis_results filtrando por account_id, analysis_status, ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_war_account_status_created
  ON public.whatsapp_analysis_results (account_id, analysis_status, created_at DESC);

-- Consulta #6: audio_files filtrando por account_id, status, ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audio_account_status_created
  ON public.audio_files (account_id, status, created_at DESC);

-- Consulta #4: transcriptions filtrando por account_id, ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_transcriptions_account_created
  ON public.transcriptions (account_id, created_at DESC);

-- Consulta #5: analyses filtrando por account_id, ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_analyses_account_created
  ON public.analyses (account_id, created_at DESC);

-- FASE 13: Relación LEFT JOIN LATERAL lenta de analyses por audio_file_id ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_analyses_audio_created
  ON public.analyses (audio_file_id, created_at DESC);

-- FASE 10: Aceleración de consultas de membresía evaluadas en cada fila por la función RLS user_has_account_access
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_account_active
  ON public.user_accounts (user_id, account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_accounts_superadmin_lookup
  ON public.user_accounts (user_id, is_active)
  WHERE role = 'superadmin'::public.app_role;

-- 3. FASE 9: Optimización de amplificación de escrituras y lecturas en el trigger de métricas
CREATE OR REPLACE FUNCTION public.update_whatsapp_conversation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_conv_id := OLD.conversation_id;
  ELSE
    v_conv_id := NEW.conversation_id;
  END IF;

  IF v_conv_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Optimización incremental cuando es INSERT simple
  IF TG_OP = 'INSERT' THEN
    UPDATE public.whatsapp_conversations
    SET
      total_messages = COALESCE(total_messages, 0) + 1,
      mensajes_cliente = COALESCE(mensajes_cliente, 0) + (CASE WHEN NEW.sender_type = 'Contacto' THEN 1 ELSE 0 END),
      mensajes_agente = COALESCE(mensajes_agente, 0) + (CASE WHEN NEW.sender_type IN ('Agente', 'Bot') THEN 1 ELSE 0 END)
    WHERE id = v_conv_id;
  ELSE
    -- Para UPDATE / DELETE recalculamos de manera segura
    UPDATE public.whatsapp_conversations wc SET
      total_messages = COALESCE(s.total, 0),
      mensajes_cliente = COALESCE(s.cliente, 0),
      mensajes_agente = COALESCE(s.agente, 0),
      duracion_conversacion = COALESCE(s.duracion, 0)
    FROM (
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE sender_type = 'Contacto') as cliente,
        count(*) FILTER (WHERE sender_type IN ('Agente', 'Bot')) as agente,
        COALESCE(EXTRACT(EPOCH FROM (max(timestamp) - min(timestamp)))::integer, 0) as duracion
      FROM public.whatsapp_messages
      WHERE conversation_id = v_conv_id
    ) s
    WHERE wc.id = v_conv_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. FASE 11: Optimización de Cron y Limpieza de Respuestas net._http_response
DO $cron_block$
DECLARE
  v_job RECORD;
BEGIN
  -- Desprogramar el job redundante si existe
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job IN (SELECT jobid FROM cron.job WHERE jobname = 'remote-import-every-minute') LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;

    -- Ajustar la frecuencia del runner a cada 5 minutos para aliviar el CPU y net.http_post
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remote-import-scheduled-runner') THEN
      UPDATE cron.job
      SET schedule = '*/5 * * * *'
      WHERE jobname = 'remote-import-scheduled-runner';
    END IF;

    -- Tarea automática diaria de limpieza de net._http_response para evitar acumular cientos de miles de filas
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-pg-net-http-responses') THEN
      PERFORM cron.schedule(
        'cleanup-pg-net-http-responses',
        '0 * * * *',
        'DELETE FROM net._http_response WHERE created < now() - interval ''2 hours'';'
      );
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no disponible o sin permisos suficientes: %', SQLERRM;
END $cron_block$;
