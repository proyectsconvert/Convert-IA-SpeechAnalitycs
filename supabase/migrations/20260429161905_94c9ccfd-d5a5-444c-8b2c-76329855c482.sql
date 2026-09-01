ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS account_name TEXT,
  ADD COLUMN IF NOT EXISTS initiate_type TEXT,
  ADD COLUMN IF NOT EXISTS batch_id TEXT,
  ADD COLUMN IF NOT EXISTS batch_messages TEXT,
  ADD COLUMN IF NOT EXISTS initial_msg_id TEXT,
  ADD COLUMN IF NOT EXISTS initial_msg_type TEXT,
  ADD COLUMN IF NOT EXISTS vcc TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_batch_id
  ON public.whatsapp_conversations (batch_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_initiate_type
  ON public.whatsapp_conversations (initiate_type);