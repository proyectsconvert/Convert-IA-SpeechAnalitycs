-- RPC para crear un dashboard compartido de forma segura
CREATE OR REPLACE FUNCTION public.create_shared_dashboard(
  p_account_id uuid,
  p_label text,
  p_password text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT (now() + interval '30 days'),
  p_config jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_pwd_hash text := NULL;
  v_new_id uuid;
BEGIN
  -- Verificar acceso del usuario que llama
  IF NOT public.user_has_account_access(auth.uid(), p_account_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Generar token aleatorio largo
  v_token := encode(gen_random_bytes(24), 'hex');

  -- Hashear password si existe (usando pgcrypto)
  IF p_password IS NOT NULL AND p_password <> '' THEN
    v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  END IF;

  INSERT INTO public.shared_dashboards (
    account_id,
    token,
    password_hash,
    expires_at,
    label,
    config,
    created_by
  ) VALUES (
    p_account_id,
    v_token,
    v_pwd_hash,
    p_expires_at,
    p_label,
    p_config,
    auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shared_dashboard(uuid, text, text, timestamptz, jsonb) TO authenticated;
