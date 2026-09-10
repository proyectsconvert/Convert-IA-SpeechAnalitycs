-- ====================================================================
-- FASE 18: Tablas Paralelas de Documentos Agregados JSONB
-- REGLA ESTRICTA: Las tablas originales (whatsapp_messages,
-- quality_evaluation_items, remote_import_files) permanecen 100% INTACTAS.
-- ====================================================================

-- 1. TABLA PARALELA: whatsapp_conversation_documents
CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  transcript_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcd_account_conv
  ON public.whatsapp_conversation_documents (account_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_wcd_conversation_id
  ON public.whatsapp_conversation_documents (conversation_id);

ALTER TABLE public.whatsapp_conversation_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_conversation_documents'
      AND policyname = 'Users can view their account wa conversation documents'
  ) THEN
    CREATE POLICY "Users can view their account wa conversation documents"
      ON public.whatsapp_conversation_documents FOR SELECT TO authenticated
      USING (public.user_has_account_access(auth.uid(), account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_conversation_documents'
      AND policyname = 'Users can manage their account wa conversation documents'
  ) THEN
    CREATE POLICY "Users can manage their account wa conversation documents"
      ON public.whatsapp_conversation_documents FOR ALL TO authenticated
      USING (public.user_has_account_access(auth.uid(), account_id))
      WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
  END IF;
END $$;

-- 2. TABLA PARALELA: quality_evaluation_documents
CREATE TABLE IF NOT EXISTS public.quality_evaluation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  evaluation_id UUID NOT NULL UNIQUE REFERENCES public.quality_evaluations(id) ON DELETE CASCADE,
  audio_file_id UUID,
  whatsapp_conversation_id UUID,
  evaluation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_items INTEGER NOT NULL DEFAULT 0,
  percent_score NUMERIC,
  has_critical_error BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qed_account_eval
  ON public.quality_evaluation_documents (account_id, evaluation_id);

CREATE INDEX IF NOT EXISTS idx_qed_audio_file
  ON public.quality_evaluation_documents (audio_file_id)
  WHERE audio_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qed_whatsapp_conv
  ON public.quality_evaluation_documents (whatsapp_conversation_id)
  WHERE whatsapp_conversation_id IS NOT NULL;

ALTER TABLE public.quality_evaluation_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quality_evaluation_documents'
      AND policyname = 'Users can view their account quality evaluation documents'
  ) THEN
    CREATE POLICY "Users can view their account quality evaluation documents"
      ON public.quality_evaluation_documents FOR SELECT TO authenticated
      USING (public.user_has_account_access(auth.uid(), account_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quality_evaluation_documents'
      AND policyname = 'Users can manage their account quality evaluation documents'
  ) THEN
    CREATE POLICY "Users can manage their account quality evaluation documents"
      ON public.quality_evaluation_documents FOR ALL TO authenticated
      USING (public.user_has_account_access(auth.uid(), account_id))
      WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
  END IF;
END $$;

-- 3. TABLA PARALELA: remote_import_job_summaries
CREATE TABLE IF NOT EXISTS public.remote_import_job_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  import_job_id UUID NOT NULL UNIQUE REFERENCES public.remote_import_jobs(id) ON DELETE CASCADE,
  connection_id UUID,
  total_files INTEGER NOT NULL DEFAULT 0,
  pending_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rijs_account_job
  ON public.remote_import_job_summaries (account_id, import_job_id);

ALTER TABLE public.remote_import_job_summaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remote_import_job_summaries'
      AND policyname = 'Users can view their account remote import job summaries'
  ) THEN
    CREATE POLICY "Users can view their account remote import job summaries"
      ON public.remote_import_job_summaries FOR SELECT TO authenticated
      USING (public.user_has_account_access(auth.uid(), account_id));
  END IF;
END $$;

-- 4. PROCEDIMIENTO SEGURO: Población por lotes de whatsapp_conversation_documents
CREATE OR REPLACE FUNCTION public.populate_whatsapp_conversation_documents(
  p_batch_size INTEGER DEFAULT 500
)
RETURNS TABLE(processed_conversations INTEGER, total_messages_aggregated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_msgs INTEGER := 0;
BEGIN
  WITH target_convs AS (
    SELECT wc.id AS conv_id, wc.account_id
    FROM public.whatsapp_conversations wc
    LEFT JOIN public.whatsapp_conversation_documents wcd ON wc.id = wcd.conversation_id
    WHERE wcd.id IS NULL
    LIMIT p_batch_size
  ),
  aggregated AS (
    SELECT
      tc.account_id,
      tc.conv_id,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'timestamp', m.timestamp,
            'sender_type', m.sender_type,
            'agent_name', m.agent_name,
            'message_type', m.message_type,
            'content', m.content,
            'external_message_id', m.external_message_id,
            'is_transfer', m.is_transfer,
            'original_date', m.original_date,
            'created_at', m.created_at
          )
          ORDER BY m.timestamp ASC NULLS LAST, m.created_at ASC
        ) FILTER (WHERE m.id IS NOT NULL),
        '[]'::jsonb
      ) AS doc_json,
      COUNT(m.id) AS msg_count,
      MIN(m.timestamp) AS first_at,
      MAX(m.timestamp) AS last_at
    FROM target_convs tc
    LEFT JOIN public.whatsapp_messages m ON tc.conv_id = m.conversation_id
    GROUP BY tc.account_id, tc.conv_id
  ),
  inserted AS (
    INSERT INTO public.whatsapp_conversation_documents (
      account_id,
      conversation_id,
      transcript_json,
      message_count,
      first_message_at,
      last_message_at,
      updated_at
    )
    SELECT
      a.account_id,
      a.conv_id,
      a.doc_json,
      a.msg_count,
      a.first_at,
      a.last_at,
      now()
    FROM aggregated a
    ON CONFLICT (conversation_id) DO UPDATE SET
      transcript_json = EXCLUDED.transcript_json,
      message_count = EXCLUDED.message_count,
      first_message_at = EXCLUDED.first_message_at,
      last_message_at = EXCLUDED.last_message_at,
      updated_at = now()
    RETURNING 1 AS conv_inserted, message_count
  )
  SELECT COUNT(*)::INTEGER, COALESCE(SUM(message_count), 0)::INTEGER
  INTO v_count, v_msgs
  FROM inserted;

  RETURN QUERY SELECT v_count, v_msgs;
END;
$$;

-- 5. PROCEDIMIENTO SEGURO: Población por lotes de quality_evaluation_documents
CREATE OR REPLACE FUNCTION public.populate_quality_evaluation_documents(
  p_batch_size INTEGER DEFAULT 500
)
RETURNS TABLE(processed_evaluations INTEGER, total_items_aggregated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_items INTEGER := 0;
BEGIN
  WITH target_evals AS (
    SELECT qe.id AS eval_id, qe.account_id, qe.audio_file_id, qe.whatsapp_conversation_id,
           qe.percent_score, qe.has_critical_error
    FROM public.quality_evaluations qe
    LEFT JOIN public.quality_evaluation_documents qed ON qe.id = qed.evaluation_id
    WHERE qed.id IS NULL
    LIMIT p_batch_size
  ),
  aggregated AS (
    SELECT
      te.account_id,
      te.eval_id,
      te.audio_file_id,
      te.whatsapp_conversation_id,
      te.percent_score,
      te.has_critical_error,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', qi.id,
            'evaluation_id', qi.evaluation_id,
            'item_id', qi.item_id,
            'section_name', qi.section_name,
            'attribute', qi.attribute,
            'sub_attribute', qi.sub_attribute,
            'affectation', qi.affectation,
            'status', qi.status,
            'score', qi.score,
            'max_score', qi.max_score,
            'observation', qi.observation,
            'created_at', qi.created_at
          )
          ORDER BY qi.created_at ASC
        ) FILTER (WHERE qi.id IS NOT NULL),
        '[]'::jsonb
      ) AS doc_json,
      COUNT(qi.id) AS item_count
    FROM target_evals te
    LEFT JOIN public.quality_evaluation_items qi ON te.eval_id = qi.evaluation_id
    GROUP BY te.account_id, te.eval_id, te.audio_file_id, te.whatsapp_conversation_id,
             te.percent_score, te.has_critical_error
  ),
  inserted AS (
    INSERT INTO public.quality_evaluation_documents (
      account_id,
      evaluation_id,
      audio_file_id,
      whatsapp_conversation_id,
      evaluation_json,
      total_items,
      percent_score,
      has_critical_error,
      updated_at
    )
    SELECT
      a.account_id,
      a.eval_id,
      a.audio_file_id,
      a.whatsapp_conversation_id,
      a.doc_json,
      a.item_count,
      a.percent_score,
      a.has_critical_error,
      now()
    FROM aggregated a
    ON CONFLICT (evaluation_id) DO UPDATE SET
      evaluation_json = EXCLUDED.evaluation_json,
      total_items = EXCLUDED.total_items,
      percent_score = EXCLUDED.percent_score,
      has_critical_error = EXCLUDED.has_critical_error,
      updated_at = now()
    RETURNING 1 AS eval_inserted, total_items
  )
  SELECT COUNT(*)::INTEGER, COALESCE(SUM(total_items), 0)::INTEGER
  INTO v_count, v_items
  FROM inserted;

  RETURN QUERY SELECT v_count, v_items;
END;
$$;

-- 5.1 TRIGGER DE SINCRONIZACIÓN EN TIEMPO REAL: whatsapp_messages -> whatsapp_conversation_documents
CREATE OR REPLACE FUNCTION public.sync_whatsapp_message_to_document_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_conversation_documents (
    account_id,
    conversation_id,
    transcript_json,
    message_count,
    first_message_at,
    last_message_at,
    updated_at
  )
  SELECT
    NEW.account_id,
    NEW.conversation_id,
    jsonb_build_array(
      jsonb_build_object(
        'id', NEW.id,
        'timestamp', NEW.timestamp,
        'sender_type', NEW.sender_type,
        'agent_name', NEW.agent_name,
        'message_type', NEW.message_type,
        'content', NEW.content,
        'external_message_id', NEW.external_message_id,
        'is_transfer', NEW.is_transfer,
        'original_date', NEW.original_date,
        'created_at', NEW.created_at
      )
    ),
    1,
    NEW.timestamp,
    NEW.timestamp,
    now()
  ON CONFLICT (conversation_id) DO UPDATE SET
    transcript_json = whatsapp_conversation_documents.transcript_json || jsonb_build_array(
      jsonb_build_object(
        'id', NEW.id,
        'timestamp', NEW.timestamp,
        'sender_type', NEW.sender_type,
        'agent_name', NEW.agent_name,
        'message_type', NEW.message_type,
        'content', NEW.content,
        'external_message_id', NEW.external_message_id,
        'is_transfer', NEW.is_transfer,
        'original_date', NEW.original_date,
        'created_at', NEW.created_at
      )
    ),
    message_count = whatsapp_conversation_documents.message_count + 1,
    first_message_at = LEAST(COALESCE(whatsapp_conversation_documents.first_message_at, NEW.timestamp), NEW.timestamp),
    last_message_at = GREATEST(COALESCE(whatsapp_conversation_documents.last_message_at, NEW.timestamp), NEW.timestamp),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_whatsapp_message_to_doc ON public.whatsapp_messages;
CREATE TRIGGER trg_sync_whatsapp_message_to_doc
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_whatsapp_message_to_document_trg();

-- 6. FUNCIÓN DE VALIDACIÓN DE INTEGRIDAD: Comparación 100% de consistencia
CREATE OR REPLACE FUNCTION public.verify_phase18_integrity_diagnostics(
  p_sample_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  check_name TEXT,
  total_sampled INTEGER,
  exact_matches INTEGER,
  mismatches INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Test 1: whatsapp_conversation_documents vs whatsapp_messages
  RETURN QUERY
  WITH sample_conv AS (
    SELECT wcd.conversation_id, wcd.message_count AS doc_count,
           jsonb_array_length(wcd.transcript_json) AS array_count,
           COUNT(m.id)::INTEGER AS real_count
    FROM public.whatsapp_conversation_documents wcd
    LEFT JOIN public.whatsapp_messages m ON wcd.conversation_id = m.conversation_id
    GROUP BY wcd.conversation_id, wcd.message_count, wcd.transcript_json
    LIMIT p_sample_limit
  )
  SELECT
    'whatsapp_messages -> whatsapp_conversation_documents'::TEXT,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE real_count = doc_count AND doc_count = array_count)::INTEGER,
    COUNT(*) FILTER (WHERE real_count <> doc_count OR doc_count <> array_count)::INTEGER,
    CASE 
      WHEN COUNT(*) FILTER (WHERE real_count <> doc_count OR doc_count <> array_count) = 0 THEN 'PASS (100% Exacto)'
      ELSE 'FAIL (Diferencias detectadas)'
    END::TEXT
  FROM sample_conv;

  -- Test 2: quality_evaluation_documents vs quality_evaluation_items
  RETURN QUERY
  WITH sample_eval AS (
    SELECT qed.evaluation_id, qed.total_items AS doc_count,
           jsonb_array_length(qed.evaluation_json) AS array_count,
           COUNT(qi.id)::INTEGER AS real_count
    FROM public.quality_evaluation_documents qed
    LEFT JOIN public.quality_evaluation_items qi ON qed.evaluation_id = qi.evaluation_id
    GROUP BY qed.evaluation_id, qed.total_items, qed.evaluation_json
    LIMIT p_sample_limit
  )
  SELECT
    'quality_evaluation_items -> quality_evaluation_documents'::TEXT,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE real_count = doc_count AND doc_count = array_count)::INTEGER,
    COUNT(*) FILTER (WHERE real_count <> doc_count OR doc_count <> array_count)::INTEGER,
    CASE 
      WHEN COUNT(*) FILTER (WHERE real_count <> doc_count OR doc_count <> array_count) = 0 THEN 'PASS (100% Exacto)'
      ELSE 'FAIL (Diferencias detectadas)'
    END::TEXT
  FROM sample_eval;
END;
$$;
