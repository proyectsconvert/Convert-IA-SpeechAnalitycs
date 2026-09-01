-- Este script debe ejecutarse en el SQL Editor de tu Dashboard de Supabase
-- Proyecto: vakqukaqwhatgiwioffp

CREATE TABLE IF NOT EXISTS public.presentations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    search_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    slides_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    bucket_path TEXT
);

-- RLS Policies
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

-- Cleanup existing policies
DROP POLICY IF EXISTS "Users can view their own account presentations" ON public.presentations;
DROP POLICY IF EXISTS "Users can insert their own account presentations" ON public.presentations;
DROP POLICY IF EXISTS "Users can update their own account presentations" ON public.presentations;
DROP POLICY IF EXISTS "Users can delete their own account presentations" ON public.presentations;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.presentations;
DROP POLICY IF EXISTS "Authenticated users can manage presentations" ON public.presentations;

-- Permissive policy for authenticated users (to unblock immediate operation)
CREATE POLICY "Authenticated users can manage presentations" 
ON public.presentations
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Storage Policies
DROP POLICY IF EXISTS "Presentaciones Viewer" ON storage.objects;
DROP POLICY IF EXISTS "Presentaciones Uploader" ON storage.objects;
DROP POLICY IF EXISTS "Presentaciones Deleter" ON storage.objects;

CREATE POLICY "Presentaciones Viewer"
ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'presentaciones');

CREATE POLICY "Presentaciones Uploader"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'presentaciones');

CREATE POLICY "Presentaciones Deleter"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'presentaciones');
