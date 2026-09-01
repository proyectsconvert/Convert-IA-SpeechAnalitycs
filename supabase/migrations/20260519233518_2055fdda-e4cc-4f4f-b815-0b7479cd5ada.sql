CREATE OR REPLACE FUNCTION public.vm_norm_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(lower(coalesce(value, '')), 'áéíóúüñ', 'aeiouun')
$$;

CREATE OR REPLACE FUNCTION public.vm_pick_motivo(results jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(results->>'motivo_no_pago'), ''),
    NULLIF(btrim(results->>'motivo_contacto'), ''),
    NULLIF(btrim(results->>'Motivo'), ''),
    NULLIF(btrim(results->>'motivo'), ''),
    CASE
      WHEN NULLIF(btrim(results->>'submotivo'), '') IS NOT NULL
        THEN NULLIF(btrim(results->>'submotivo'), '')
      ELSE NULL
    END,
    'Otros'
  )
$$;

CREATE OR REPLACE FUNCTION public.vm_classify_promesa(results jsonb, summary text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH input AS (
    SELECT public.vm_norm_text(left(coalesce(summary, '') || ' ' || coalesce(results->>'estado_pago', '') || ' ' || coalesce(results->>'estadoPago', '') || ' ' || coalesce(results->>'motivo_no_pago', '') || ' ' || coalesce(results->>'motivo_contacto', '') || ' ' || coalesce(results->>'promesa_pago', '') || ' ' || coalesce(results->>'compromiso_pago', '') || ' ' || coalesce(results->>'conclusiones', ''), 2400)) AS blob,
           public.vm_norm_text(coalesce(results->>'estado_pago', results->>'estadoPago', '')) AS estado,
           public.vm_norm_text(coalesce(summary, '')) AS s
  )
  SELECT CASE
    WHEN blob ~ 'no es cliente|persona equivocada|numero equivocado' THEN 'No es cliente'
    WHEN blob ~ 'cliente al dia|al corriente|sin mora|al dia con el pago' THEN 'Cliente al día'
    WHEN blob ~ 'no responde|evade|no contesta|ignora.*mensaje' THEN 'Cliente no responde o evade'
    WHEN estado ~ 'no quiere pagar|no puede pagar' THEN 'No'
    WHEN estado ~ 'hoy|manana|proxima semana|semana siguiente' THEN 'Sí'
    WHEN estado ~ 'no confirma' THEN 'No clasificado'
    WHEN s ~ 'compromiso (de )?pago|promesa (de )?pago|pagara' AND s !~ 'no (quiere|puede|podra) pagar' THEN 'Sí'
    WHEN s ~ 'no (quiere|puede|podra) pagar|rechaza pagar' THEN 'No'
    WHEN length(coalesce(summary, '')) < 8 THEN 'No clasificado'
    WHEN blob ~ 'pendiente|ambiguo|inconcluso|sin definir' THEN 'No clasificado'
    ELSE 'Otros'
  END
  FROM input
$$;

CREATE OR REPLACE FUNCTION public.vm_general_chat_aggregate(
  p_account_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_channel text DEFAULT 'all',
  p_sentiment text DEFAULT NULL,
  p_agent text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000) AS row_limit,
           public.vm_norm_text(p_sentiment) AS sentiment_filter,
           public.vm_norm_text(p_agent) AS agent_filter,
           public.vm_norm_text(p_motivo) AS motivo_filter
  ),
  call_rows AS (
    SELECT
      'Llamada'::text AS canal,
      af.file_name::text AS archivo,
      af.created_at AS fecha,
      COALESCE(NULLIF(af.metadata->>'agent_name', ''), NULLIF(af.metadata->>'user_name', ''), 'Desconocido')::text AS asesor,
      COALESCE(af.metadata->>'campaign', '')::text AS campana,
      COALESCE(af.duration_seconds, 0)::integer AS duracion_segundos,
      0::integer AS mensajes,
      CASE
        WHEN public.vm_norm_text(a.overall_sentiment) LIKE '%positiv%' THEN 'positivo'
        WHEN public.vm_norm_text(a.overall_sentiment) LIKE '%negativ%' THEN 'negativo'
        ELSE 'neutral'
      END AS sentimiento,
      CASE WHEN COALESCE(a.sentiment_score, 0) <= 1.5 THEN COALESCE(a.sentiment_score, 0)::numeric ELSE (COALESCE(a.sentiment_score, 0) / 100.0)::numeric END AS score_0_1,
      public.vm_pick_motivo(COALESCE(a.results, '{}'::jsonb)) AS motivo_principal,
      public.vm_classify_promesa(COALESCE(a.results, '{}'::jsonb), COALESCE(a.summary, af.summary, '')) AS promesa_pago
    FROM public.audio_files af
    JOIN LATERAL (
      SELECT an.overall_sentiment, an.sentiment_score, an.summary, an.results, an.created_at
      FROM public.analyses an
      WHERE an.audio_file_id = af.id
      ORDER BY an.created_at DESC
      LIMIT 1
    ) a ON TRUE
    CROSS JOIN params p
    WHERE p_channel IN ('all', 'call')
      AND af.account_id = p_account_id
      AND af.status = 'completed'
      AND af.created_at >= p_start_date
      AND af.created_at <= p_end_date
    ORDER BY af.created_at DESC
    LIMIT (SELECT row_limit FROM params)
  ),
  wa_rows AS (
    SELECT
      'WhatsApp'::text AS canal,
      COALESCE(wc.contact_name, wc.ticket, wc.phone_number, wc.external_id, wc.id::text)::text AS archivo,
      COALESCE(wc.start_date, wc.created_at) AS fecha,
      COALESCE(NULLIF(wc.first_agent_name, ''), 'Desconocido')::text AS asesor,
      COALESCE(wc.campaign, '')::text AS campana,
      COALESCE(wc.duracion_conversacion, 0)::integer AS duracion_segundos,
      COALESCE(wc.total_messages, 0)::integer AS mensajes,
      CASE
        WHEN public.vm_norm_text(wc.sentiment) LIKE '%positiv%' THEN 'positivo'
        WHEN public.vm_norm_text(wc.sentiment) LIKE '%negativ%' THEN 'negativo'
        ELSE 'neutral'
      END AS sentimiento,
      CASE WHEN COALESCE(war.score_general, wc.score_general, 0) <= 1.5 THEN COALESCE(war.score_general, wc.score_general, 0)::numeric ELSE (COALESCE(war.score_general, wc.score_general, 0) / 100.0)::numeric END AS score_0_1,
      public.vm_pick_motivo(COALESCE(war.results, '{}'::jsonb)) AS motivo_principal,
      public.vm_classify_promesa(COALESCE(war.results, '{}'::jsonb), COALESCE(war.results->>'summary', war.results->>'resumen_ejecutivo', '')) AS promesa_pago
    FROM public.whatsapp_conversations wc
    LEFT JOIN LATERAL (
      SELECT r.results, r.score_general, r.analyzed_at
      FROM public.whatsapp_analysis_results r
      WHERE r.conversation_id = wc.id
        AND r.analysis_status = 'completed'
      ORDER BY r.analyzed_at DESC NULLS LAST, r.created_at DESC
      LIMIT 1
    ) war ON TRUE
    CROSS JOIN params p
    WHERE p_channel IN ('all', 'whatsapp')
      AND wc.account_id = p_account_id
      AND wc.status = 'analizado'
      AND COALESCE(wc.start_date, wc.created_at) >= p_start_date
      AND COALESCE(wc.start_date, wc.created_at) <= p_end_date
    ORDER BY COALESCE(wc.start_date, wc.created_at) DESC
    LIMIT (SELECT row_limit FROM params)
  ),
  unified AS (
    SELECT * FROM call_rows
    UNION ALL
    SELECT * FROM wa_rows
  ),
  filtered AS (
    SELECT u.*
    FROM unified u
    CROSS JOIN params p
    WHERE (p.sentiment_filter = '' OR public.vm_norm_text(u.sentimiento) LIKE '%' || p.sentiment_filter || '%')
      AND (p.agent_filter = '' OR public.vm_norm_text(u.asesor) LIKE '%' || p.agent_filter || '%')
      AND (p.motivo_filter = '' OR public.vm_norm_text(u.motivo_principal) LIKE '%' || p.motivo_filter || '%' OR public.vm_norm_text(u.promesa_pago) LIKE '%' || p.motivo_filter || '%')
  ),
  summary AS (
    SELECT
      count(*)::integer AS total_interactions,
      count(*) FILTER (WHERE canal = 'Llamada')::integer AS total_calls,
      count(*) FILTER (WHERE canal = 'WhatsApp')::integer AS total_whatsapp,
      COALESCE(sum(duracion_segundos), 0)::integer AS total_duration_seconds,
      CASE WHEN count(score_0_1) > 0 THEN round(avg(score_0_1) * 100)::integer ELSE 0 END AS avg_score_pct
    FROM filtered
  ),
  samples AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'canal', canal,
      'archivo', archivo,
      'fecha', fecha,
      'ext_Nombre Asesor', asesor,
      'ext_Nombre Campaña', campana,
      'duracion_segundos', duracion_segundos,
      'duracion_Minutos', round((duracion_segundos::numeric / 60.0), 2),
      'mensajes', mensajes,
      'score_0_1', round(score_0_1, 2),
      'score_pct', round(score_0_1 * 100),
      'sentimiento', sentimiento,
      'Promesa de pago', promesa_pago,
      'Motivo principal', left(motivo_principal, 220)
    ) ORDER BY fecha DESC), '[]'::jsonb) AS records
    FROM (SELECT * FROM filtered ORDER BY fecha DESC LIMIT 30) s
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total_interactions', summary.total_interactions,
      'total_calls', summary.total_calls,
      'total_whatsapp', summary.total_whatsapp,
      'total_duration_seconds', summary.total_duration_seconds,
      'total_duration_hours', round(summary.total_duration_seconds::numeric / 3600.0, 2),
      'avg_score_pct', summary.avg_score_pct,
      'sentiment_distribution', COALESCE((SELECT jsonb_object_agg(sentimiento, n) FROM (SELECT sentimiento, count(*)::integer n FROM filtered GROUP BY sentimiento ORDER BY n DESC LIMIT 25) d), '{}'::jsonb),
      'promesa_pago_distribution', COALESCE((SELECT jsonb_object_agg(promesa_pago, n) FROM (SELECT promesa_pago, count(*)::integer n FROM filtered GROUP BY promesa_pago ORDER BY n DESC LIMIT 25) d), '{}'::jsonb),
      'motivo_distribution', COALESCE((SELECT jsonb_object_agg(left(motivo_principal, 220), n) FROM (SELECT motivo_principal, count(*)::integer n FROM filtered GROUP BY motivo_principal ORDER BY n DESC LIMIT 25) d), '{}'::jsonb),
      'agent_distribution', COALESCE((SELECT jsonb_object_agg(left(asesor, 120), n) FROM (SELECT asesor, count(*)::integer n FROM filtered GROUP BY asesor ORDER BY n DESC LIMIT 25) d), '{}'::jsonb)
    ),
    'sample_records', samples.records,
    'total_records_in_dataset', summary.total_interactions
  )
  FROM summary, samples;
$$;

REVOKE ALL ON FUNCTION public.vm_norm_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vm_pick_motivo(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vm_classify_promesa(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vm_general_chat_aggregate(uuid, timestamptz, timestamptz, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vm_norm_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vm_pick_motivo(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.vm_classify_promesa(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vm_general_chat_aggregate(uuid, timestamptz, timestamptz, text, text, text, text, integer) TO service_role;