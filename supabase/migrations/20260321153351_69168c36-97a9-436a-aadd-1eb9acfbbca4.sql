
-- Add missing permission modules
INSERT INTO permissions (module, action) VALUES
  ('limites', 'ver'), ('limites', 'editar'),
  ('consulta_ia', 'ver'), ('consulta_ia', 'crear')
ON CONFLICT DO NOTHING;

-- Allow role_permissions management by superadmin
DROP POLICY IF EXISTS "Superadmin manages role_permissions" ON role_permissions;
CREATE POLICY "Superadmin manages role_permissions" ON role_permissions
  FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- Seed default role_permissions for admin
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin'::app_role, p.id FROM permissions p
WHERE (p.module IN ('centro_inteligencia', 'biblioteca', 'transcripciones', 'analiticas', 'prompts', 'usuarios', 'consulta_ia', 'limites')
  AND p.action IN ('ver', 'crear', 'editar', 'borrar', 'procesar', 'exportar'))
  OR (p.module = 'cuentas' AND p.action = 'ver')
  OR (p.module = 'roles' AND p.action = 'ver')
  OR (p.module = 'facturacion' AND p.action = 'ver')
  OR (p.module = 'auditoria' AND p.action = 'ver')
  OR (p.module = 'soporte' AND p.action = 'ver')
  OR (p.module = 'configuracion' AND p.action IN ('ver', 'editar'))
ON CONFLICT DO NOTHING;

-- Seed for supervisor
INSERT INTO role_permissions (role, permission_id)
SELECT 'supervisor'::app_role, p.id FROM permissions p
WHERE (p.module IN ('centro_inteligencia', 'biblioteca', 'transcripciones', 'analiticas', 'consulta_ia') AND p.action IN ('ver', 'exportar', 'procesar'))
  OR (p.module = 'prompts' AND p.action = 'ver')
ON CONFLICT DO NOTHING;

-- Seed for analyst
INSERT INTO role_permissions (role, permission_id)
SELECT 'analyst'::app_role, p.id FROM permissions p
WHERE (p.module IN ('centro_inteligencia', 'biblioteca', 'transcripciones', 'analiticas', 'consulta_ia') AND p.action IN ('ver', 'crear', 'procesar', 'exportar'))
  OR (p.module = 'prompts' AND p.action IN ('ver', 'crear'))
ON CONFLICT DO NOTHING;

-- Seed for observer
INSERT INTO role_permissions (role, permission_id)
SELECT 'observer'::app_role, p.id FROM permissions p
WHERE p.module IN ('centro_inteligencia', 'transcripciones', 'analiticas') AND p.action = 'ver'
ON CONFLICT DO NOTHING;
