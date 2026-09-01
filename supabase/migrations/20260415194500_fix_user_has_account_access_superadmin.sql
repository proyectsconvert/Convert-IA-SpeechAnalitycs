-- Refuerzo de acceso multi-cuenta para superadministradores de plataforma y por rol.
-- Casos cubiertos:
-- 1) profiles.is_superadmin = true  → acceso a cualquier cuenta existente.
-- 2) Membresía activa en user_accounts para esa cuenta (comportamiento original).
-- 3) Rol app_role 'superadmin' en al menos una cuenta activa → mismo alcance global que (1),
--    para usuarios marcados solo a nivel de membresía y no en profiles.

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_superadmin FROM public.profiles p WHERE p.id = _user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_account_access(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Cuenta válida
    EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _account_id)
    AND (
      -- Superadmin global en perfil
      COALESCE(
        (SELECT p.is_superadmin FROM public.profiles p WHERE p.id = _user_id),
        false
      )
      -- Membresía explícita en esa cuenta
      OR EXISTS (
        SELECT 1 FROM public.user_accounts ua
        WHERE ua.user_id = _user_id
          AND ua.account_id = _account_id
          AND ua.is_active = true
      )
      -- Rol superadmin en alguna cuenta (acceso global operativo)
      OR EXISTS (
        SELECT 1 FROM public.user_accounts ua
        WHERE ua.user_id = _user_id
          AND ua.is_active = true
          AND ua.role = 'superadmin'::public.app_role
      )
    );
$$;

-- Política explícita (equivalente lógico; evita dudas con el optimizador)
DROP POLICY IF EXISTS "Audio insert" ON public.audio_files;
CREATE POLICY "Audio insert" ON public.audio_files
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));

DROP POLICY IF EXISTS "Audio update" ON public.audio_files;
CREATE POLICY "Audio update" ON public.audio_files
  FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_has_account_access(UUID, UUID) TO authenticated, anon;
