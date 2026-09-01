-- ============================================================================
-- Migración: Matriz Global de Calidad y Experiencia (Desacoplada de Cobranza)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_quality_matrix(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version_id uuid;
  v_sec_presentacion uuid;
  v_sec_respeto uuid;
  v_sec_manejo uuid;
  v_sec_objeciones uuid;
  v_sec_cierre uuid;
  v_sec_crit_ce uuid;
  v_sec_crit_compl uuid;
  v_max_version integer;
BEGIN
  -- 1. Verificar acceso a la cuenta
  IF NOT public.user_has_account_access(auth.uid(), p_account_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Desactivar versiones previas de la cuenta
  UPDATE public.quality_matrix_versions
  SET is_active = false
  WHERE account_id = p_account_id;

  -- 3. Calcular nuevo número de versión
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_max_version
  FROM public.quality_matrix_versions
  WHERE account_id = p_account_id;

  -- 4. Crear nueva versión activa global
  INSERT INTO public.quality_matrix_versions (account_id, version, label, is_active, created_by)
  VALUES (p_account_id, v_max_version, 'Matriz Global de Calidad y Experiencia', true, auth.uid())
  RETURNING id INTO v_version_id;

  -- 5. Secciones Regulares (Total: 100 puntos)
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, '1. PRESENTACIÓN Y COMUNICACIÓN', 'regular', 1)
  RETURNING id INTO v_sec_presentacion;

  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, '2. RESPETO Y ESCUCHA ACTIVA', 'regular', 2)
  RETURNING id INTO v_sec_respeto;

  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, '3. MANEJO DE LA LLAMADA Y GESTIÓN', 'regular', 3)
  RETURNING id INTO v_sec_manejo;

  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, '4. MANEJO DE OBJECIONES Y RESOLUCIÓN', 'regular', 4)
  RETURNING id INTO v_sec_objeciones;

  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, '5. CUMPLIMIENTO Y CIERRE', 'regular', 5)
  RETURNING id INTO v_sec_cierre;

  -- 6. Secciones de Errores Críticos
  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'Customer Experience (Críticos)', 'critical', 10)
  RETURNING id INTO v_sec_crit_ce;

  INSERT INTO public.quality_matrix_sections (version_id, name, kind, sort_order)
  VALUES (v_version_id, 'Cumplimiento e Integridad (Críticos)', 'critical', 11)
  RETURNING id INTO v_sec_crit_compl;

  -- 7. Items - PRESENTACIÓN Y COMUNICACIÓN (20 pts)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_presentacion, 'Saludo y Presentación Institucional', 'Identificación y trato personalizado', 'El agente saluda cordialmente en los primeros segundos, se identifica con su nombre y empresa, y valida el nombre del usuario dirigiéndose a él de forma personalizada y respetuosa.', 10, 'none', 1),
  (v_sec_presentacion, 'Tono, Modulación y Cortesía', 'Actitud profesional y amable', 'Mantiene un tono de voz empático, amable, profesional, seguro y modulado durante toda la interacción, utilizando palabras de cortesía.', 10, 'none', 2);

  -- 8. Items - RESPETO Y ESCUCHA ACTIVA (20 pts)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_respeto, 'Escucha Activa y No Interrupción', 'Atención continua', 'Permite que el usuario exprese su situación o consulta sin interrumpirlo, demostrando atención activa, paciencia y comprensión.', 10, 'riesgo', 1),
  (v_sec_respeto, 'Empatía y Calidez en la Atención', 'Validación emocional', 'Muestra genuino interés por la necesidad del cliente, valida sus emociones o inquietudes y mantiene una actitud servicial y humana.', 10, 'riesgo', 2);

  -- 9. Items - MANEJO DE LA LLAMADA Y GESTIÓN (25 pts)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_manejo, 'Sondeo Efectivo y Detección de Necesidad', 'Preguntas clave', 'Realiza preguntas oportunas para comprender a fondo la consulta, solicitud o problemática planteada por el usuario.', 10, 'mp', 1),
  (v_sec_manejo, 'Claridad en la Información y Control de Tiempos', 'Agilidad y transparencia', 'Brinda explicaciones claras, precisas y transparentes, gestionando los tiempos de llamada y evitando silencios prolongados.', 10, 'mp', 2),
  (v_sec_manejo, 'Manejo de Tiempos de Espera (Hold)', 'Protocolo de espera', 'Solicita permiso antes de poner en espera al cliente con una expectativa clara de tiempo y agradece la espera al retomar la llamada.', 5, 'none', 3);

  -- 10. Items - MANEJO DE OBJECIONES Y RESOLUCIÓN (20 pts)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_objeciones, 'Manejo Efectivo de Objeciones y Dificultades', 'Seguridad y alternativas', 'Aborda dudas, objeciones o dificultades con seguridad, proactividad y argumentos sólidos, ofreciendo alternativas viables sin confrontar al cliente.', 10, 'riesgo', 1),
  (v_sec_objeciones, 'Resolución y Propuesta de Solución', 'Efectividad en primer contacto', 'Aclara dudas y resuelve la consulta o requerimiento de manera completa y orientada a la satisfacción del usuario.', 10, 'mp', 2);

  -- 11. Items - CUMPLIMIENTO Y CIERRE (15 pts)
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_cierre, 'Apego a Procesos, Políticas y Privacidad', 'Marco normativo', 'Cumple con las políticas normativas de la empresa, aviso de privacidad o confidencialidad y validaciones de seguridad aplicables.', 5, 'none', 1),
  (v_sec_cierre, 'Tipificación y Registro Correcto', 'Gestión en sistemas', 'Registra y tipifica adecuadamente el motivo y resultado de la interacción en los sistemas y CRM correspondientes.', 5, 'none', 2),
  (v_sec_cierre, 'Cierre, Verificación y Despedida', 'Validación de satisfacción', 'Resume acuerdos o próximos pasos, pregunta si el cliente tiene dudas adicionales ("¿Hay algo más en lo que pueda ayudarle?") y finaliza con una despedida cordial.', 5, 'none', 3);

  -- 12. Items Críticos - Customer Experience
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_crit_ce, 'Conversación', 'Insultos o Lenguaje Inapropiado', 'El agente usa lenguaje soez, discriminatorio, ofensivo o insulta de forma directa o indirecta al cliente.', 0, 'critico', 1),
  (v_sec_crit_ce, 'Conversación', 'Rudeza, Sarcasmo o Burla', 'El agente toma actitud negativa: sarcasmo, tono hostil, gritos, burla, interrupciones constantes o confrontación directa.', 0, 'critico', 2),
  (v_sec_crit_ce, 'Conversación', 'Abandono de Interacción / Colgar', 'El agente finaliza la interacción de forma abrupta (cuelga), no brinda solución o deja al cliente en espera prolongada e injustificada (>3 min).', 0, 'critico', 3);

  -- 13. Items Críticos - Cumplimiento e Integridad
  INSERT INTO public.quality_matrix_items (section_id, attribute, sub_attribute, description, max_score, affectation, sort_order) VALUES
  (v_sec_crit_compl, 'Integridad', 'Información Falsa o Engañosa', 'El agente brinda deliberadamente información engañosa, falsa o compromisos no autorizados.', 0, 'critico', 1),
  (v_sec_crit_compl, 'Privacidad y Seguridad', 'Omisión Aviso de Privacidad / Vulneración', 'El agente no menciona el aviso de privacidad cuando es obligatorio o compromete datos confidenciales y de seguridad del usuario.', 0, 'critico', 2);

  RETURN v_version_id;
END;
$$;
