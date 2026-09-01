
-- Backfill total_messages, mensajes_cliente, mensajes_agente from actual whatsapp_messages
UPDATE public.whatsapp_conversations wc SET
  total_messages = sub.total,
  mensajes_cliente = sub.cliente,
  mensajes_agente = sub.agente,
  duracion_conversacion = sub.duracion
FROM (
  SELECT 
    conversation_id,
    count(*) as total,
    count(*) FILTER (WHERE sender_type = 'Contacto') as cliente,
    count(*) FILTER (WHERE sender_type IN ('Agente', 'Bot')) as agente,
    COALESCE(
      EXTRACT(EPOCH FROM (max(timestamp) - min(timestamp)))::integer,
      0
    ) as duracion
  FROM public.whatsapp_messages
  GROUP BY conversation_id
) sub
WHERE wc.id = sub.conversation_id;

-- Create trigger function to auto-update message counts
CREATE OR REPLACE FUNCTION public.update_whatsapp_conversation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_conv_id := OLD.conversation_id;
  ELSE
    v_conv_id := NEW.conversation_id;
  END IF;

  UPDATE whatsapp_conversations SET
    total_messages = COALESCE(s.total, 0),
    mensajes_cliente = COALESCE(s.cliente, 0),
    mensajes_agente = COALESCE(s.agente, 0),
    duracion_conversacion = COALESCE(s.duracion, 0)
  FROM (
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE sender_type = 'Contacto') as cliente,
      count(*) FILTER (WHERE sender_type IN ('Agente', 'Bot')) as agente,
      COALESCE(EXTRACT(EPOCH FROM (max(timestamp) - min(timestamp)))::integer, 0) as duracion
    FROM whatsapp_messages
    WHERE conversation_id = v_conv_id
  ) s
  WHERE id = v_conv_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach trigger
CREATE TRIGGER trg_update_wa_conv_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_whatsapp_conversation_metrics();
