-- Migration: WhatsApp Analytics Improvements
-- Description: Add status to conversations and tables for AI results and batch processing.

-- 1. Add status and metadata to conversations
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'status') THEN
        ALTER TABLE public.whatsapp_conversations ADD COLUMN status TEXT DEFAULT 'no_analizado';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'first_agent_name') THEN
        ALTER TABLE public.whatsapp_conversations ADD COLUMN first_agent_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'total_messages') THEN
        ALTER TABLE public.whatsapp_conversations ADD COLUMN total_messages INT DEFAULT 0;
    END IF;
END $$;

-- 2. Create results table
CREATE TABLE IF NOT EXISTS public.whatsapp_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES public.prompts(id),
    prompt_name TEXT,
    analysis_status TEXT NOT NULL DEFAULT 'pending', -- pending / in_process / completed / error
    source TEXT DEFAULT 'whatsapp',
    score_general NUMERIC(4,2),
    results JSONB, -- AI full output
    error_message TEXT,
    batch_id UUID,
    model_used TEXT,
    tokens_used INT,
    processing_time_ms INT,
    analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create history table
CREATE TABLE IF NOT EXISTS public.whatsapp_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES public.prompts(id),
    results_snapshot JSONB,
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create batches table
CREATE TABLE IF NOT EXISTS public.whatsapp_analysis_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES public.prompts(id),
    total_conversations INT DEFAULT 0,
    completed INT DEFAULT 0,
    failed INT DEFAULT 0,
    status TEXT DEFAULT 'pending', -- pending / processing / completed / paused
    block_size INT DEFAULT 30,
    concurrent_limit INT DEFAULT 10,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_wa_results_conversation ON public.whatsapp_analysis_results(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_results_account ON public.whatsapp_analysis_results(account_id);
CREATE INDEX IF NOT EXISTS idx_wa_results_batch ON public.whatsapp_analysis_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_wa_batches_account ON public.whatsapp_analysis_batches(account_id);

-- 6. RLS
ALTER TABLE public.whatsapp_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_analysis_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_analysis_batches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their account wa results" ON public.whatsapp_analysis_results FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can view their account wa history" ON public.whatsapp_analysis_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations 
    WHERE id = conversation_id AND public.user_has_account_access(auth.uid(), account_id)
  ));

CREATE POLICY "Users can view their account wa batches" ON public.whatsapp_analysis_batches FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can insert wa results" ON public.whatsapp_analysis_results FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can insert wa batches" ON public.whatsapp_analysis_batches FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

-- Trigger updated_at for whatsapp_conversations if not exists
-- (Assuming it was already there based on common patterns in this repo)
