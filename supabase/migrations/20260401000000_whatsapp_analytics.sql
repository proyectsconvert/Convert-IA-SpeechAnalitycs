-- Migration: WhatsApp Analytics Module
-- Description: Tables for storing and analyzing WhatsApp conversations from CSV imports.

CREATE TABLE public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, -- ID conversación
    campaign TEXT,             -- Campaña
    start_date TIMESTAMPTZ,    -- Fecha de inicio
    end_date TIMESTAMPTZ,      -- Fecha final
    account_name TEXT,         -- Cuenta
    initiate_type TEXT,        -- Inic. (Ent/Sal)
    contact_name TEXT,         -- Nombre contacto
    phone_number TEXT,         -- Disp. Abs.
    batch_id TEXT,             -- Id lote
    batch_messages TEXT,       -- Mensajes lote
    initial_msg_id TEXT,       -- Id Msj. Inic.
    initial_msg_type TEXT,     -- Tipo Msj inicial
    initial_msg_text TEXT,     -- Msj. Inic.
    ticket TEXT,               -- Tick.
    vcc TEXT,                  -- VCC
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    sender_type TEXT,          -- Contacto/Agente
    agent_name TEXT,           -- Agente
    timestamp TIMESTAMPTZ,     -- Fecha
    message_type TEXT,         -- Tipo
    content TEXT,              -- Texto
    external_message_id TEXT,  -- Message Id
    is_transfer BOOLEAN DEFAULT false, -- Transferencia
    original_date TEXT,        -- Original Date
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_whatsapp_conversations_account ON public.whatsapp_conversations(account_id);
CREATE INDEX idx_whatsapp_conversations_external_id ON public.whatsapp_conversations(external_id);
CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_whatsapp_messages_account ON public.whatsapp_messages(account_id);

-- Enable RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_conversations
CREATE POLICY "Users can view their account whatsapp conversations" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can insert their account whatsapp conversations" ON public.whatsapp_conversations FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can update their account whatsapp conversations" ON public.whatsapp_conversations FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can delete their account whatsapp conversations" ON public.whatsapp_conversations FOR DELETE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Policies for whatsapp_messages
CREATE POLICY "Users can view their account whatsapp messages" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can insert their account whatsapp messages" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can update their account whatsapp messages" ON public.whatsapp_messages FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Users can delete their account whatsapp messages" ON public.whatsapp_messages FOR DELETE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));
