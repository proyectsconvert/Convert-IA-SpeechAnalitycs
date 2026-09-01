
-- Agregar campos de métricas de conversación
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS mensajes_cliente integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mensajes_agente integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duracion_conversacion integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canal text DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS prompt_utilizado_id uuid,
  ADD COLUMN IF NOT EXISTS prompt_utilizado_nombre text;

-- Índices para filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_wa_conv_start_date ON public.whatsapp_conversations (start_date);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON public.whatsapp_conversations (status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_campaign ON public.whatsapp_conversations (campaign);
CREATE INDEX IF NOT EXISTS idx_wa_conv_first_agent ON public.whatsapp_conversations (first_agent_name);
CREATE INDEX IF NOT EXISTS idx_wa_conv_prompt_id ON public.whatsapp_conversations (prompt_utilizado_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_account_status ON public.whatsapp_conversations (account_id, status);
