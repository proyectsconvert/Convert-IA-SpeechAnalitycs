-- ==============================================================================
-- MIGRATION: Multi Quality Matrix System & Dual Selection Support
-- ==============================================================================

-- 1. Ampliar quality_matrix_versions para soportar nombres personalizados, macroprocesos y matrices predeterminadas
ALTER TABLE public.quality_matrix_versions
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS macroproceso TEXT DEFAULT 'ventas',
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Permitir múltiples matrices por cuenta sin restricción única estricta de versión
ALTER TABLE public.quality_matrix_versions 
  DROP CONSTRAINT IF EXISTS quality_matrix_versions_account_id_version_key;

-- 2. Asegurar que cada cuenta tenga una matriz predeterminada entre sus matrices activas
UPDATE public.quality_matrix_versions qv
SET is_default = true
WHERE qv.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.quality_matrix_versions d
    WHERE d.account_id = qv.account_id AND d.is_default = true
  )
  AND qv.id = (
    SELECT id FROM public.quality_matrix_versions f
    WHERE f.account_id = qv.account_id AND f.is_active = true
    ORDER BY f.created_at DESC
    LIMIT 1
  );

-- 3. Vincular matriz de calidad a automatizaciones SFTP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'remote_import_automations') THEN
    ALTER TABLE public.remote_import_automations
      ADD COLUMN IF NOT EXISTS default_quality_matrix_id UUID REFERENCES public.quality_matrix_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Vincular matriz de calidad a jobs y archivos de audio
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'remote_import_jobs') THEN
    ALTER TABLE public.remote_import_jobs
      ADD COLUMN IF NOT EXISTS quality_matrix_id UUID REFERENCES public.quality_matrix_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.audio_files
  ADD COLUMN IF NOT EXISTS quality_matrix_id UUID REFERENCES public.quality_matrix_versions(id) ON DELETE SET NULL;

-- 5. RPC para establecer una matriz como predeterminada de la cuenta
CREATE OR REPLACE FUNCTION public.set_default_quality_matrix(
  p_account_id UUID,
  p_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Desmarcar otras matrices de la cuenta
  UPDATE public.quality_matrix_versions
  SET is_default = false
  WHERE account_id = p_account_id;

  -- Marcar la seleccionada como default y activa
  UPDATE public.quality_matrix_versions
  SET is_default = true, is_active = true
  WHERE id = p_version_id AND account_id = p_account_id;

  RETURN jsonb_build_object('success', true, 'matrix_id', p_version_id);
END;
$$;

-- 6. RPC para duplicar/clonar una matriz de calidad con todas sus secciones e items
CREATE OR REPLACE FUNCTION public.duplicate_quality_matrix(
  p_source_version_id UUID,
  p_new_label TEXT,
  p_account_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source public.quality_matrix_versions%ROWTYPE;
  v_new_version_id UUID;
  v_next_version INT;
  r_sec RECORD;
  v_new_section_id UUID;
  r_item RECORD;
BEGIN
  -- Obtener origen
  SELECT * INTO v_source FROM public.quality_matrix_versions WHERE id = p_source_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matriz origen no encontrada';
  END IF;

  -- Determinar versión incremental
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.quality_matrix_versions
  WHERE account_id = p_account_id;

  -- Insertar nueva versión
  INSERT INTO public.quality_matrix_versions (
    account_id,
    version,
    label,
    description,
    macroproceso,
    is_active,
    is_default
  ) VALUES (
    p_account_id,
    v_next_version,
    COALESCE(p_new_label, v_source.label || ' (Copia)'),
    v_source.description,
    v_source.macroproceso,
    true,
    false
  ) RETURNING id INTO v_new_version_id;

  -- Copiar secciones e items
  FOR r_sec IN 
    SELECT * FROM public.quality_matrix_sections WHERE version_id = p_source_version_id ORDER BY sort_order
  LOOP
    INSERT INTO public.quality_matrix_sections (
      version_id,
      name,
      kind,
      sort_order
    ) VALUES (
      v_new_version_id,
      r_sec.name,
      r_sec.kind,
      r_sec.sort_order
    ) RETURNING id INTO v_new_section_id;

    -- Copiar items de esta sección
    FOR r_item IN
      SELECT * FROM public.quality_matrix_items WHERE section_id = r_sec.id ORDER BY sort_order
    LOOP
      INSERT INTO public.quality_matrix_items (
        section_id,
        attribute,
        sub_attribute,
        description,
        max_score,
        affectation,
        is_active,
        sort_order
      ) VALUES (
        v_new_section_id,
        r_item.attribute,
        r_item.sub_attribute,
        r_item.description,
        r_item.max_score,
        r_item.affectation,
        r_item.is_active,
        r_item.sort_order
      );
    END LOOP;
  END LOOP;

  RETURN v_new_version_id;
END;
$$;
