-- Garantiza que cada usuario con profiles.is_superadmin tenga membresía activa
-- en user_accounts para TODAS las cuentas (rol superadmin).
-- - Al crear una cuenta nueva → se añaden esos usuarios a la cuenta.
-- - Al marcar is_superadmin en profiles → se enlazan todas las cuentas existentes.
-- - Backfill inicial para datos actuales.

CREATE OR REPLACE FUNCTION public.sync_superadmin_to_all_accounts(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.is_superadmin = true) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_accounts (user_id, account_id, role, is_active)
  SELECT p_user_id, a.id, 'superadmin'::public.app_role, true
  FROM public.accounts a
  ON CONFLICT (user_id, account_id)
  DO UPDATE SET
    is_active = true,
    role = 'superadmin'::public.app_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_sync_superadmin_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_superadmin_to_all_accounts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_superadmin_memberships ON public.profiles;
CREATE TRIGGER trg_profiles_sync_superadmin_memberships
  AFTER INSERT OR UPDATE OF is_superadmin ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_superadmin IS TRUE)
  EXECUTE FUNCTION public.trg_profiles_sync_superadmin_memberships();

CREATE OR REPLACE FUNCTION public.trg_accounts_add_superadmins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_accounts (user_id, account_id, role, is_active)
  SELECT p.id, NEW.id, 'superadmin'::public.app_role, true
  FROM public.profiles p
  WHERE p.is_superadmin = true
  ON CONFLICT (user_id, account_id)
  DO UPDATE SET
    is_active = true,
    role = 'superadmin'::public.app_role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_add_superadmins ON public.accounts;
CREATE TRIGGER trg_accounts_add_superadmins
  AFTER INSERT ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_accounts_add_superadmins();

-- Backfill: todos los superadmin actuales → todas las cuentas
INSERT INTO public.user_accounts (user_id, account_id, role, is_active)
SELECT p.id, a.id, 'superadmin'::public.app_role, true
FROM public.profiles p
CROSS JOIN public.accounts a
WHERE p.is_superadmin = true
ON CONFLICT (user_id, account_id)
DO UPDATE SET
  is_active = true,
  role = 'superadmin'::public.app_role;

GRANT EXECUTE ON FUNCTION public.sync_superadmin_to_all_accounts(UUID) TO service_role;
