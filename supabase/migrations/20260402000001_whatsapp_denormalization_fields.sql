-- Migration: WhatsApp Denormalization Fields
-- Description: Add score_general and sentiment to whatsapp_conversations for performance.

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'score_general') THEN
        ALTER TABLE public.whatsapp_conversations ADD COLUMN score_general NUMERIC(4,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'sentiment') THEN
        ALTER TABLE public.whatsapp_conversations ADD COLUMN sentiment TEXT;
    END IF;
END $$;

-- Update existing records if possible (optional, but good if we have results already)
UPDATE public.whatsapp_conversations c
SET 
    score_general = r.score_general,
    sentiment = (r.results->>'sentimiento_cliente')::text,
    status = 'analizado'
FROM public.whatsapp_analysis_results r
WHERE c.id = r.conversation_id
AND c.status != 'analizado';
