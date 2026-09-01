-- ============================================================
-- Función RPC: get_general_chat_context  v2.2 (DEFINITIVA)
-- Columnas reales de analyses: overall_sentiment, summary, insights, results
-- audio_files: call_topic (no tiene columna sentiment propia)
-- NO existe: conclusions, af.sentiment
-- ============================================================

DROP FUNCTION IF EXISTS get_general_chat_context(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_general_chat_context(
    p_account_id  UUID,
    p_start_date  TIMESTAMPTZ DEFAULT NULL,
    p_end_date    TIMESTAMPTZ DEFAULT NULL,
    p_sentiment   TEXT DEFAULT NULL,
    p_search_term TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_calls    INT;
    v_total_duration NUMERIC;
    v_topics         JSON;
    v_sentiments     JSON;
    v_calls          JSON;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'p_account_id is required';
    END IF;

    -- 1. Conteo total
    SELECT
        COUNT(*),
        COALESCE(SUM(af.duration_seconds), 0)
    INTO v_total_calls, v_total_duration
    FROM audio_files af
    LEFT JOIN analyses      an ON an.audio_file_id = af.id
    LEFT JOIN transcriptions t  ON t.audio_file_id  = af.id
    WHERE af.account_id = p_account_id
      AND af.status     = 'completed'
      AND (p_start_date  IS NULL OR af.created_at >= p_start_date)
      AND (p_end_date    IS NULL OR af.created_at <= p_end_date)
      AND (p_sentiment   IS NULL OR COALESCE(an.overall_sentiment, 'neutral') ILIKE '%' || p_sentiment || '%')
      AND (p_search_term IS NULL
           OR af.file_name      ILIKE '%' || p_search_term || '%'
           OR an.summary        ILIKE '%' || p_search_term || '%'
           OR an.insights::text ILIKE '%' || p_search_term || '%'
           OR t.full_text       ILIKE '%' || p_search_term || '%');

    -- 2. Distribución por temas
    SELECT COALESCE(json_object_agg(topic, cnt), '{}'::json)
    INTO v_topics
    FROM (
        SELECT
            COALESCE(af.call_topic, 'Sin categorizar') AS topic,
            COUNT(*) AS cnt
        FROM audio_files af
        LEFT JOIN analyses      an ON an.audio_file_id = af.id
        LEFT JOIN transcriptions t  ON t.audio_file_id  = af.id
        WHERE af.account_id = p_account_id
          AND af.status     = 'completed'
          AND (p_start_date  IS NULL OR af.created_at >= p_start_date)
          AND (p_end_date    IS NULL OR af.created_at <= p_end_date)
          AND (p_sentiment   IS NULL OR COALESCE(an.overall_sentiment, 'neutral') ILIKE '%' || p_sentiment || '%')
          AND (p_search_term IS NULL
               OR af.file_name      ILIKE '%' || p_search_term || '%'
               OR an.summary        ILIKE '%' || p_search_term || '%'
               OR an.insights::text ILIKE '%' || p_search_term || '%'
               OR t.full_text       ILIKE '%' || p_search_term || '%')
        GROUP BY COALESCE(af.call_topic, 'Sin categorizar')
    ) sub;

    -- 3. Distribución por sentimiento
    SELECT COALESCE(json_object_agg(sent, cnt), '{}'::json)
    INTO v_sentiments
    FROM (
        SELECT
            COALESCE(an.overall_sentiment, 'neutral') AS sent,
            COUNT(*) AS cnt
        FROM audio_files af
        LEFT JOIN analyses      an ON an.audio_file_id = af.id
        LEFT JOIN transcriptions t  ON t.audio_file_id  = af.id
        WHERE af.account_id = p_account_id
          AND af.status     = 'completed'
          AND (p_start_date  IS NULL OR af.created_at >= p_start_date)
          AND (p_end_date    IS NULL OR af.created_at <= p_end_date)
          AND (p_sentiment   IS NULL OR COALESCE(an.overall_sentiment, 'neutral') ILIKE '%' || p_sentiment || '%')
          AND (p_search_term IS NULL
               OR af.file_name      ILIKE '%' || p_search_term || '%'
               OR an.summary        ILIKE '%' || p_search_term || '%'
               OR an.insights::text ILIKE '%' || p_search_term || '%'
               OR t.full_text       ILIKE '%' || p_search_term || '%')
        GROUP BY COALESCE(an.overall_sentiment, 'neutral')
    ) sub;

    -- 4. Las 50 llamadas más recientes
    SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
    INTO v_calls
    FROM (
        SELECT
            af.file_name,
            af.created_at,
            af.duration_seconds,
            COALESCE(af.call_topic, 'Sin categorizar')  AS call_topic,
            COALESCE(an.overall_sentiment, 'neutral')    AS sentiment,
            an.summary,
            an.insights,
            an.results
        FROM audio_files af
        LEFT JOIN analyses      an ON an.audio_file_id = af.id
        LEFT JOIN transcriptions t  ON t.audio_file_id  = af.id
        WHERE af.account_id = p_account_id
          AND af.status     = 'completed'
          AND (p_start_date  IS NULL OR af.created_at >= p_start_date)
          AND (p_end_date    IS NULL OR af.created_at <= p_end_date)
          AND (p_sentiment   IS NULL OR COALESCE(an.overall_sentiment, 'neutral') ILIKE '%' || p_sentiment || '%')
          AND (p_search_term IS NULL
               OR af.file_name      ILIKE '%' || p_search_term || '%'
               OR an.summary        ILIKE '%' || p_search_term || '%'
               OR an.insights::text ILIKE '%' || p_search_term || '%'
               OR t.full_text       ILIKE '%' || p_search_term || '%')
        ORDER BY af.created_at DESC
        LIMIT 50
    ) c;

    RETURN json_build_object(
        'total_calls',            v_total_calls,
        'total_duration_seconds', v_total_duration,
        'topics_distribution',    v_topics,
        'sentiment_distribution', v_sentiments,
        'sample_calls',           v_calls
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_general_chat_context(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_general_chat_context(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
