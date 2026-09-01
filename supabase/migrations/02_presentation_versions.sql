-- Historial de versiones de informes Reporte IA

CREATE TABLE IF NOT EXISTS public.presentation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    presentation_id UUID NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    slides_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT presentation_versions_unique_version UNIQUE (presentation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_presentation_versions_pres
ON public.presentation_versions(presentation_id, version_number DESC);

ALTER TABLE public.presentation_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage presentation_versions" ON public.presentation_versions;

CREATE POLICY "Authenticated users can manage presentation_versions"
ON public.presentation_versions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
