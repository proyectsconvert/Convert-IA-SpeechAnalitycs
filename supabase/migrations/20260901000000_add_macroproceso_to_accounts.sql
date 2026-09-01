-- Add macroproceso / operation_type to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS macroproceso TEXT DEFAULT 'ventas';

COMMENT ON COLUMN public.accounts.macroproceso IS 'Tipo de operación o macroproceso de la cuenta: ventas, servicio_cliente, cobranza, soporte_tecnico, retencion, agendamiento, prospeccion, encuestas, postventa, pqrs_backoffice';
