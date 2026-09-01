-- Tabla principal de dashboards compartidos (Vista en tiempo real)
CREATE TABLE IF NOT EXISTS public.shared_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  password_hash text,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  last_viewer_ip text,
  label text,
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- { tabs: string[], filters: any }
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_shared_dashboards_token ON public.shared_dashboards(token);
CREATE INDEX IF NOT EXISTS idx_shared_dashboards_account ON public.shared_dashboards(account_id);

-- RLS
ALTER TABLE public.shared_dashboards ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios autenticados (miembros de la cuenta)
CREATE POLICY "Shared dashboards select"
  ON public.shared_dashboards FOR SELECT
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared dashboards insert"
  ON public.shared_dashboards FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared dashboards update"
  ON public.shared_dashboards FOR UPDATE
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared dashboards delete"
  ON public.shared_dashboards FOR DELETE
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Función pública para acceder a la configuración de un dashboard compartido
CREATE OR REPLACE FUNCTION public.get_shared_dashboard_config(
  p_token text,
  p_password text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_share shared_dashboards;
  v_account accounts;
  v_pwd_ok boolean := true;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN json_build_object('error', 'invalid_token');
  END IF;

  SELECT * INTO v_share FROM shared_dashboards WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF v_share.revoked THEN
    RETURN json_build_object('error', 'revoked');
  END IF;

  IF v_share.expires_at <= now() THEN
    RETURN json_build_object('error', 'expired', 'expired_at', v_share.expires_at);
  END IF;

  IF v_share.password_hash IS NOT NULL THEN
    IF p_password IS NULL OR p_password = '' THEN
      RETURN json_build_object('error', 'password_required');
    END IF;
    v_pwd_ok := (extensions.crypt(p_password, v_share.password_hash) = v_share.password_hash);
    IF NOT v_pwd_ok THEN
      RETURN json_build_object('error', 'password_incorrect');
    END IF;
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = v_share.account_id;

  -- Registrar acceso
  UPDATE shared_dashboards
    SET view_count = view_count + 1,
        last_viewed_at = now(),
        last_viewer_ip = COALESCE(p_ip, last_viewer_ip)
    WHERE id = v_share.id;

  RETURN json_build_object(
    'account_id', v_share.account_id,
    'account_name', v_account.name,
    'label', v_share.label,
    'config', v_share.config,
    'expires_at', v_share.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_dashboard_config(text, text, text, text) TO anon, authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_shared_dashboards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shared_dashboards_updated_at
  BEFORE UPDATE ON public.shared_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_dashboards_updated_at();
