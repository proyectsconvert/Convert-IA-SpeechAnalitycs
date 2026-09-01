-- Migration: WhatsApp Performance Indexes
-- Description: Add indexes to speed up filtering and counts for large datasets.

-- 1. Index for status-based filtering and counts
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_account_status 
ON public.whatsapp_conversations(account_id, status);

-- 2. Index for date-based ordering and filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_account_start_date
ON public.whatsapp_conversations(account_id, start_date DESC);

-- 3. Index for agent-based filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_account_agent
ON public.whatsapp_conversations(account_id, first_agent_name)
WHERE first_agent_name IS NOT NULL;

-- 4. Index for sentiment-based filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_account_sentiment
ON public.whatsapp_conversations(account_id, sentiment)
WHERE sentiment IS NOT NULL;

-- 5. Index for score-based filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_account_score
ON public.whatsapp_conversations(account_id, score_general)
WHERE score_general IS NOT NULL;
