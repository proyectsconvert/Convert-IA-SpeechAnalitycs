
-- ========================================
-- MATRIZ DE CALIDAD
-- ========================================

-- Versiones de la matriz (cada cuenta tiene 1 activa)
CREATE TABLE public.quality_matrix_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (account_id, version)
);

CREATE INDEX idx_qmv_account_active ON public.quality_matrix_versions(account_id, is_active);

ALTER TABLE public.quality_matrix_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quality matrix versions select"
  ON public.quality_matrix_versions FOR SELECT TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Quality matrix versions insert"
  ON public.quality_matrix_versions FOR INSERT TO authenticated
  WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Quality matrix versions update"
  ON public.quality_matrix_versions FOR UPDATE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Quality matrix versions delete"
  ON public.quality_matrix_versions FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

-- Secciones (NEGOCIO, EXPERIENCIA UF, CUMPLIMIENTO, Errores Críticos...)
CREATE TABLE public.quality_matrix_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.quality_matrix_versions(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','critical')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qms_version ON public.quality_matrix_sections(version_id);

ALTER TABLE public.quality_matrix_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quality sections select"
  ON public.quality_matrix_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quality_matrix_versions v
                 WHERE v.id = version_id AND user_has_account_access(auth.uid(), v.account_id)));

CREATE POLICY "Quality sections write"
  ON public.quality_matrix_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quality_matrix_versions v
                 WHERE v.id = version_id AND user_has_account_access(auth.uid(), v.account_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quality_matrix_versions v
                      WHERE v.id = version_id AND user_has_account_access(auth.uid(), v.account_id)));

-- Items (atributo + sub-atributo + descripción + score + afectación)
CREATE TABLE public.quality_matrix_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.quality_matrix_sections(id) ON DELETE CASCADE,
  attribute text NOT NULL,
  sub_attribute text,
  description text,
  max_score numeric NOT NULL DEFAULT 0,
  affectation text NOT NULL DEFAULT 'none' CHECK (affectation IN ('none','mp','riesgo','critico')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qmi_section ON public.quality_matrix_items(section_id);

ALTER TABLE public.quality_matrix_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quality items select"
  ON public.quality_matrix_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quality_matrix_sections s
                 JOIN public.quality_matrix_versions v ON v.id = s.version_id
                 WHERE s.id = section_id AND user_has_account_access(auth.uid(), v.account_id)));

CREATE POLICY "Quality items write"
  ON public.quality_matrix_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quality_matrix_sections s
                 JOIN public.quality_matrix_versions v ON v.id = s.version_id
                 WHERE s.id = section_id AND user_has_account_access(auth.uid(), v.account_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quality_matrix_sections s
                      JOIN public.quality_matrix_versions v ON v.id = s.version_id
                      WHERE s.id = section_id AND user_has_account_access(auth.uid(), v.account_id)));

-- Evaluaciones (1 por interacción analizada con la matriz vigente)
CREATE TABLE public.quality_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  matrix_version_id uuid NOT NULL REFERENCES public.quality_matrix_versions(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('call','whatsapp')),
  audio_file_id uuid,
  whatsapp_conversation_id uuid,
  agent_name text,
  total_score numeric NOT NULL DEFAULT 0,
  max_total_score numeric NOT NULL DEFAULT 0,
  percent_score numeric NOT NULL DEFAULT 0,
  has_critical_error boolean NOT NULL DEFAULT false,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_source CHECK (
    (source_type = 'call' AND audio_file_id IS NOT NULL AND whatsapp_conversation_id IS NULL)
    OR (source_type = 'whatsapp' AND whatsapp_conversation_id IS NOT NULL AND audio_file_id IS NULL)
  )
);

CREATE INDEX idx_qe_account_created ON public.quality_evaluations(account_id, created_at DESC);
CREATE INDEX idx_qe_audio ON public.quality_evaluations(audio_file_id);
CREATE INDEX idx_qe_wa ON public.quality_evaluations(whatsapp_conversation_id);

ALTER TABLE public.quality_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quality evaluations select"
  ON public.quality_evaluations FOR SELECT TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Quality evaluations insert"
  ON public.quality_evaluations FOR INSERT TO authenticated
  WITH CHECK (user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Quality evaluations delete"
  ON public.quality_evaluations FOR DELETE TO authenticated
  USING (user_has_account_access(auth.uid(), account_id));

-- Items por evaluación
CREATE TABLE public.quality_evaluation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.quality_evaluations(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.quality_matrix_items(id) ON DELETE SET NULL,
  section_name text,
  attribute text,
  sub_attribute text,
  affectation text,
  status text NOT NULL DEFAULT 'na' CHECK (status IN ('cumple','no_cumple','na','critico')),
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qei_eval ON public.quality_evaluation_items(evaluation_id);

ALTER TABLE public.quality_evaluation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quality eval items select"
  ON public.quality_evaluation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quality_evaluations e
                 WHERE e.id = evaluation_id AND user_has_account_access(auth.uid(), e.account_id)));

CREATE POLICY "Quality eval items insert"
  ON public.quality_evaluation_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quality_evaluations e
                      WHERE e.id = evaluation_id AND user_has_account_access(auth.uid(), e.account_id)));

-- Función de seed: carga plantilla Hughesnet por defecto si la cuenta no tiene matriz
CREATE OR REPLACE FUNCTION public.seed_quality_matrix(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version_id uuid;
  v_sec_negocio uuid;
  v_sec_exp uuid;
  v_sec_cumpl uuid;
  v_sec_crit_ce uuid;
  v_sec_crit_biz uuid;
  v_sec_crit_compl uuid;
  v_max_version integer;
BEGIN
  -- Verificar acceso
  IF NOT public.user_has_account_access(auth.uid(), p_account_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Desactivar versiones previas
  UPDATE public.quality_matrix_versions SET is_active = false WHERE account_id = p_account_id;

  SELECT COALESCE(MAX(version),0)+1 INTO v_max_version FROM public.quality_matrix_versions WHERE account_id = p_account_id;

  INSERT INTO public.quality_matrix_versions (account_id, version, label, is_active, created_by)
  VALUES (p_account_id, v_max_version, 'Plantilla Hughesnet', true, auth.uid())
  RETURNING id INTO v_version_id;

  -- Secciones regulares
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'NEGOCIO', 'regular', 1) RETURNING id INTO v_sec_negocio;
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'EXPERIENCIA UF', 'regular', 2) RETURNING id INTO v_sec_exp;
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'CUMPLIMIENTO', 'regular', 3) RETURNING id INTO v_sec_cumpl;

  -- Errores críticos
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'Customer Experience (Críticos)', 'critical', 10) RETURNING id INTO v_sec_crit_ce;
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'Business (Críticos)', 'critical', 11) RETURNING id INTO v_sec_crit_biz;
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'Cumplimiento (Críticos)', 'critical', 12) RETURNING id INTO v_sec_crit_compl;

  -- NEGOCIO
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_negocio, 'Confirma método pago', NULL, 'El agente orienta al cliente cómo generar su pago según el método pactado y envía el formato de pago al cliente.', 8, 'none', 1),
  (v_sec_negocio, 'Confirma monto pago', NULL, 'El agente le indica al cliente el monto a pagar dependiendo del plan y la fecha de corte.', 6, 'none', 2),
  (v_sec_negocio, 'Confirma límite pago (5 días)', NULL, 'El agente menciona la fecha límite asignada (5 días).', 7, 'none', 3),
  (v_sec_negocio, 'Genera compromiso / Confirmación de promesa', NULL, 'El agente establece compromiso de pago: fecha, método, monto. Detecta y consolida la promesa confirmando día de pago.', 10, 'mp', 4);

  -- EXPERIENCIA UF
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_exp, 'Saludo / Personalizar', NULL, 'Presentarse con nombre y empresa (HUGHESNET) y preguntar por el TC. Personalizar durante la interacción (Sr/Sra/Srta + nombre o apellido).', 5, 'none', 1),
  (v_sec_exp, 'Respuesta inmediata', NULL, 'El agente atiende la llamada dentro de los primeros 15 segundos.', 5, 'mp', 2),
  (v_sec_exp, 'Despedida', NULL, 'El agente proporciona el script de salida mencionando su nombre y la empresa.', 5, 'none', 3),
  (v_sec_exp, 'Actitud cordial / Empatía / Escucha activa', NULL, 'El agente muestra una actitud cortés y servicial durante la llamada.', 7, 'riesgo', 4),
  (v_sec_exp, 'Resolución de conflictos', NULL, 'Aclarar dudas del cliente y resolver mediante escucha activa la problemática.', 8, 'riesgo', 5),
  (v_sec_exp, 'Solicita y agradece espera', NULL, 'El agente solicita tiempo de espera con expectativas claras y retoma en máximo 1:30 min.', 5, 'none', 6);

  -- CUMPLIMIENTO
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_cumpl, 'Sondea motivo NO pago', NULL, 'El agente realiza preguntas para conocer el motivo del atraso.', 7, 'mp', 1),
  (v_sec_cumpl, 'Solicita comprobante de pago', NULL, 'El agente menciona que, una vez generado el pago, deberá enviarlo por WhatsApp.', 5, 'none', 2),
  (v_sec_cumpl, 'Factura', NULL, 'El agente menciona si requiere facturación y gestiona el envío.', 6, 'none', 3),
  (v_sec_cumpl, 'Cancelación', NULL, 'El agente pregunta el motivo de cancelación y solicita folio.', 5, 'riesgo', 4),
  (v_sec_cumpl, 'Aviso de Privacidad', NULL, 'El agente menciona el aviso de privacidad siguiendo el script autorizado.', 6, 'none', 5),
  (v_sec_cumpl, 'Tipificación', NULL, 'El agente tipifica correctamente la interacción dentro de los 40 segundos finales.', 5, 'none', 6);

  -- CRÍTICOS - Customer Experience
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_crit_ce, 'Conversación', 'Insulto', 'El agente usa lenguaje inapropiado, insulta de forma directa o indirecta al cliente.', 0, 'critico', 1),
  (v_sec_crit_ce, 'Conversación', 'Rudeza', 'El agente toma actitud negativa: sarcasmo, gritos, interrupciones constantes.', 0, 'critico', 2),
  (v_sec_crit_ce, 'Conversación', 'Abandono', 'El agente finaliza la interacción sin solución o deja al cliente en espera prolongada (>5 min).', 0, 'critico', 3);

  -- CRÍTICOS - Business
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_crit_biz, 'Cancelación de la cuenta', 'Omisión de retención', 'El agente no genera intento de retención (mínimo 2 objeciones), pasando directamente al cierre.', 0, 'critico', 1);

  -- CRÍTICOS - Cumplimiento (placeholder)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_crit_compl, 'Privacidad', 'Omisión aviso de privacidad', 'El agente no menciona el aviso de privacidad cuando es obligatorio.', 0, 'critico', 1);

  RETURN v_version_id;
END;
$$;

-- ========================================
-- SECURITY FIXES
-- ========================================

-- Fix 1: transcription_providers SELECT solo superadmin
DROP POLICY IF EXISTS "Anyone can view global transcription providers" ON public.transcription_providers;

CREATE POLICY "Only superadmins can view transcription providers"
  ON public.transcription_providers FOR SELECT TO authenticated
  USING (is_superadmin(auth.uid()));

-- Fix 2: presentaciones bucket - validar que la carpeta corresponde a una cuenta del usuario
DROP POLICY IF EXISTS "Presentaciones account upload" ON storage.objects;

CREATE POLICY "Presentaciones account upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'presentaciones'
    AND (
      is_superadmin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_accounts ua
        WHERE ua.user_id = auth.uid()
          AND ua.is_active = true
          AND ua.account_id::text = (storage.foldername(name))[1]
      )
    )
  );
