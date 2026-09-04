-- Migration: Update get_effective_permissions to properly isolate custom roles
-- and ensure explicit permissions for extractions and soporte.

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
    SELECT cc.parent_role AS role
    FROM custom_chain cc
    WHERE cc.parent_role IS NOT NULL
    UNION
    SELECT v_role AS role
    WHERE v_custom_role_id IS NULL AND v_role IS NOT NULL
  ),
  from_fixed AS (
    SELECT rp.permission_id AS pid
    FROM public.role_permissions rp
    JOIN base_role br ON br.role = rp.role
  ),
  from_custom AS (
    SELECT crp.permission_id AS pid
    FROM public.custom_role_permissions crp
    JOIN custom_chain cc ON cc.id = crp.custom_role_id
    WHERE crp.granted = true
  ),
  unioned AS (
    SELECT ff.pid FROM from_fixed ff
    UNION
    SELECT fc.pid FROM from_custom fc
  ),
  with_overrides AS (
    SELECT u.pid
    FROM unioned u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_permission_overrides upo
      WHERE upo.user_id = _user_id
        AND upo.account_id = _account_id
        AND upo.permission_id = u.pid
        AND upo.granted = false
    )
    UNION
    SELECT upo.permission_id AS pid
    FROM public.user_permission_overrides upo
    WHERE upo.user_id = _user_id
      AND upo.account_id = _account_id
      AND upo.granted = true
  )
  SELECT p.module, p.submodule, p.action, p.id
  FROM with_overrides wo
  JOIN public.permissions p ON p.id = wo.pid;
END;
$$;

INSERT INTO public.permissions (module, submodule, action, label, description, sort_order)
VALUES 
  ('extractions', NULL, 'view', 'Ver reglas de extracción', 'Acceder y consultar reglas de extracción', 550),
  ('extractions', NULL, 'manage', 'Gestionar reglas de extracción', 'Crear, editar o eliminar reglas', 551),
  ('soporte', NULL, 'view', 'Ver soporte', 'Acceder a tickets y centro de ayuda', 1250)
ON CONFLICT (module, COALESCE(submodule, ''), action) 
DO UPDATE SET 
  label = EXCLUDED.label, 
  description = EXCLUDED.description, 
  sort_order = EXCLUDED.sort_order;
