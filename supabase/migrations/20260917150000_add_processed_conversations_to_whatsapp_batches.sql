-- Add missing processed_conversations and failed_conversations to whatsapp_analysis_batches
ALTER TABLE public.whatsapp_analysis_batches ADD COLUMN IF NOT EXISTS processed_conversations INT DEFAULT 0;
ALTER TABLE public.whatsapp_analysis_batches ADD COLUMN IF NOT EXISTS failed_conversations INT DEFAULT 0;
NOTIFY pgrst, 'reload schema';
