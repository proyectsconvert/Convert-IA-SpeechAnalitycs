-- Add preferences column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.preferences IS 'Preferencias de usuario como modo de visualización de transcripciones, configuración de UI, etc.';
