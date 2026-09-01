-- Habilitar pgcrypto para bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla principal de links compartidos
CREATE TABLE public.shared_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  password_hash text,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  last_viewer_ip text,
  allow_pdf_download boolean NOT NULL DEFAULT true,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_presentations_token ON public.shared_presentations(token);
CREATE INDEX idx_shared_presentations_account ON public.shared_presentations(account_id);
CREATE INDEX idx_shared_presentations_presentation ON public.shared_presentations(presentation_id);

-- Tabla de auditoría de accesos
CREATE TABLE public.shared_presentation_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_presentation_id uuid NOT NULL REFERENCES public.shared_presentations(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  password_correct boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_shared_views_shared ON public.shared_presentation_views(shared_presentation_id);

-- RLS
ALTER TABLE public.shared_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_presentation_views ENABLE ROW LEVEL SECURITY;

-- Policies: shared_presentations (solo miembros de la cuenta)
CREATE POLICY "Shared presentations select"
  ON public.shared_presentations FOR SELECT
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared presentations insert"
  ON public.shared_presentations FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared presentations update"
  ON public.shared_presentations FOR UPDATE
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

CREATE POLICY "Shared presentations delete"
  ON public.shared_presentations FOR DELETE
  TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Policies: shared_presentation_views (solo lectura para miembros, escritura solo vía función pública)
CREATE POLICY "Shared views select"
  ON public.shared_presentation_views FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shared_presentations sp
    WHERE sp.id = shared_presentation_views.shared_presentation_id
      AND public.user_has_account_access(auth.uid(), sp.account_id)
  ));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_shared_presentations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shared_presentations_updated_at
  BEFORE UPDATE ON public.shared_presentations
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_presentations_updated_at();

-- Función pública para acceder a un link compartido
-- SECURITY DEFINER: bypasea RLS pero valida token + password + expiración + revocación
CREATE OR REPLACE FUNCTION public.get_shared_presentation(
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
  v_share shared_presentations;
  v_pres presentations;
  v_account accounts;
  v_pwd_ok boolean := true;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN json_build_object('error', 'invalid_token');
  END IF;

  SELECT * INTO v_share FROM shared_presentations WHERE token = p_token;

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
      INSERT INTO shared_presentation_views (shared_presentation_id, ip_address, user_agent, password_correct)
      VALUES (v_share.id, p_ip, p_user_agent, false);
      RETURN json_build_object('error', 'password_incorrect');
    END IF;
  END IF;

  SELECT * INTO v_pres FROM presentations WHERE id = v_share.presentation_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'presentation_deleted');
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = v_share.account_id;

  -- Registrar acceso
  INSERT INTO shared_presentation_views (shared_presentation_id, ip_address, user_agent, password_correct)
  VALUES (v_share.id, p_ip, p_user_agent, true);

  UPDATE shared_presentations
    SET view_count = view_count + 1,
        last_viewed_at = now(),
        last_viewer_ip = COALESCE(p_ip, last_viewer_ip)
    WHERE id = v_share.id;

  RETURN json_build_object(
    'title', v_pres.title,
    'slides_data', v_pres.slides_data,
    'account_name', v_account.name,
    'expires_at', v_share.expires_at,
    'allow_pdf_download', v_share.allow_pdf_download,
    'label', v_share.label
  );
END;
$$;

-- Permitir invocar la función desde el rol anónimo (links públicos)
GRANT EXECUTE ON FUNCTION public.get_shared_presentation(text, text, text, text) TO anon, authenticated;

-- Función helper para hashear passwords desde edge function
CREATE OR REPLACE FUNCTION public.hash_share_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_password IS NULL OR p_password = '' THEN
    RETURN NULL;
  END IF;
  RETURN extensions.crypt(p_password, extensions.gen_salt('bf', 10));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hash_share_password(text) TO authenticated;