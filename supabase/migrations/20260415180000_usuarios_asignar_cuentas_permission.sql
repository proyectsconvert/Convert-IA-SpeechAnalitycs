-- Permiso: asignar usuarios existentes (profiles) a cuentas (user_accounts)
INSERT INTO public.permissions (module, action)
VALUES ('usuarios', 'asignar_cuentas')
ON CONFLICT (module, action) DO NOTHING;

-- Administradores de cuenta pueden gestionar membresías si tienen este permiso
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, p.id
FROM public.permissions p
WHERE p.module = 'usuarios' AND p.action = 'asignar_cuentas'
ON CONFLICT (role, permission_id) DO NOTHING;

-- Opcional: supervisores que deban incorporar equipo a la cuenta
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'supervisor'::public.app_role, p.id
FROM public.permissions p
WHERE p.module = 'usuarios' AND p.action = 'asignar_cuentas'
ON CONFLICT (role, permission_id) DO NOTHING;
