-- Add missing columns to whatsapp_analysis_batches if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_batches' AND column_name = 'block_size') THEN
        ALTER TABLE public.whatsapp_analysis_batches ADD COLUMN block_size INT DEFAULT 30;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_batches' AND column_name = 'concurrent_limit') THEN
        ALTER TABLE public.whatsapp_analysis_batches ADD COLUMN concurrent_limit INT DEFAULT 10;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_results' AND column_name = 'model_used') THEN
        ALTER TABLE public.whatsapp_analysis_results ADD COLUMN model_used TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_results' AND column_name = 'tokens_used') THEN
        ALTER TABLE public.whatsapp_analysis_results ADD COLUMN tokens_used INT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_results' AND column_name = 'processing_time_ms') THEN
        ALTER TABLE public.whatsapp_analysis_results ADD COLUMN processing_time_ms INT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_analysis_results' AND column_name = 'batch_id') THEN
        ALTER TABLE public.whatsapp_analysis_results ADD COLUMN batch_id UUID;
    END IF;
END $$;

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
