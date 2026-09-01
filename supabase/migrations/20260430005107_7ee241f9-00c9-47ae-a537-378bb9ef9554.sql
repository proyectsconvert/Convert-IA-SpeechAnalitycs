
-- 1. Enriquecer tabla permissions con metadata para UI jerárquica
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS submodule text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS permissions_module_submodule_action_uk
  ON public.permissions (module, COALESCE(submodule, ''), action);

-- 2. Tabla de roles personalizados (globales)
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#3B82F6',
  parent_role public.app_role,
  parent_custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_role IS NULL OR parent_custom_role_id IS NULL)
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Custom roles read all authed" ON public.custom_roles;
CREATE POLICY "Custom roles read all authed" ON public.custom_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Superadmin manages custom_roles" ON public.custom_roles;
CREATE POLICY "Superadmin manages custom_roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 3. Permisos asignados a roles personalizados
CREATE TABLE IF NOT EXISTS public.custom_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  UNIQUE (custom_role_id, permission_id)
);

ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Custom role perms read all authed" ON public.custom_role_permissions;
CREATE POLICY "Custom role perms read all authed" ON public.custom_role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Superadmin manages custom_role_permissions" ON public.custom_role_permissions;
CREATE POLICY "Superadmin manages custom_role_permissions" ON public.custom_role_permissions
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 4. Asignación de rol personalizado a usuarios por cuenta
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- 5. Historial de cambios
CREATE TABLE IF NOT EXISTS public.role_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin reads role history" ON public.role_change_history;
CREATE POLICY "Superadmin reads role history" ON public.role_change_history
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmin inserts role history" ON public.role_change_history;
CREATE POLICY "Superadmin inserts role history" ON public.role_change_history
  FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));

-- 6. Función de permisos efectivos (rol fijo + rol custom con herencia + overrides)
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid, _account_id uuid)
RETURNS TABLE (module text, submodule text, action text, permission_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_custom_role_id uuid;
  v_is_super boolean;
BEGIN
  v_is_super := public.is_superadmin(_user_id);

  IF v_is_super THEN
    RETURN QUERY
      SELECT p.module, p.submodule, p.action, p.id
      FROM public.permissions p;
    RETURN;
  END IF;

  SELECT ua.role, ua.custom_role_id
    INTO v_role, v_custom_role_id
  FROM public.user_accounts ua
  WHERE ua.user_id = _user_id AND ua.account_id = _account_id AND ua.is_active = true
  LIMIT 1;

  RETURN QUERY
  WITH RECURSIVE custom_chain AS (
    SELECT cr.id, cr.parent_role, cr.parent_custom_role_id
    FROM public.custom_roles cr
    WHERE cr.id = v_custom_role_id AND cr.is_active = true
    UNION ALL
    SELECT cr2.id, cr2.parent_role, cr2.parent_custom_role_id
    FROM public.custom_roles cr2
    JOIN custom_chain cc ON cc.parent_custom_role_id = cr2.id
    WHERE cr2.is_active = true
  ),
  base_role AS (
    SELECT v_role AS role
    UNION
    SELECT cc.parent_role FROM custom_chain cc WHERE cc.parent_role IS NOT NULL
  ),
  from_fixed AS (
    SELECT rp.permission_id
    FROM public.role_permissions rp
    JOIN base_role br ON br.role = rp.role
    WHERE br.role IS NOT NULL
  ),
  from_custom AS (
    SELECT crp.permission_id
    FROM public.custom_role_permissions crp
    JOIN custom_chain cc ON cc.id = crp.custom_role_id
    WHERE crp.granted = true
  ),
  unioned AS (
    SELECT permission_id FROM from_fixed
    UNION
    SELECT permission_id FROM from_custom
  ),
  with_overrides AS (
    SELECT u.permission_id
    FROM unioned u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_permission_overrides upo
      WHERE upo.user_id = _user_id
        AND upo.account_id = _account_id
        AND upo.permission_id = u.permission_id
        AND upo.granted = false
    )
    UNION
    SELECT upo.permission_id
    FROM public.user_permission_overrides upo
    WHERE upo.user_id = _user_id
      AND upo.account_id = _account_id
      AND upo.granted = true
  )
  SELECT p.module, p.submodule, p.action, p.id
  FROM with_overrides wo
  JOIN public.permissions p ON p.id = wo.permission_id;
END;
$$;

-- 7. Trigger updated_at en custom_roles
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_custom_roles_touch ON public.custom_roles;
CREATE TRIGGER trg_custom_roles_touch
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
