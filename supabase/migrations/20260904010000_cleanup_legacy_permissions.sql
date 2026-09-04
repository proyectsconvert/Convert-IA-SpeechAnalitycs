-- Migration: Clean up legacy Spanish permissions and sync modern permissions for fixed roles
BEGIN;

-- 1. Ensure modern permissions exist for Admin, Supervisor, Observer
-- Admin: All canonical permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id FROM public.permissions 
WHERE module IN (
  'dashboard', 'library', 'uploads', 'transcriptions', 'analyses', 'whatsapp',
  'analytics', 'reports', 'chat_ai', 'extractions', 'prompts', 'connections',
  'transcription_models', 'accounts', 'users', 'roles', 'billing', 'audit', 'soporte', 'settings'
)
AND action NOT IN ('borrar', 'crear', 'editar', 'ver', 'procesar', 'exportar', 'administrar', 'asignar', 'asignar_cuentas')
ON CONFLICT DO NOTHING;

-- Supervisor: Operational oversight permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'supervisor', id FROM public.permissions 
WHERE (
  (module = 'dashboard') OR
  (module = 'library' AND action IN ('view', 'play', 'download', 'reprocess', 'export')) OR
  (module = 'uploads') OR
  (module = 'transcriptions') OR
  (module = 'analyses') OR
  (module = 'whatsapp') OR
  (module = 'analytics') OR
  (module = 'reports') OR
  (module = 'chat_ai' AND action IN ('view', 'use', 'history')) OR
  (module = 'prompts' AND action = 'view') OR
  (module = 'users' AND action = 'view') OR
  (module = 'soporte' AND action = 'view') OR
  (module = 'settings' AND action = 'view')
)
ON CONFLICT DO NOTHING;

-- Observer: Read-only permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'observer', id FROM public.permissions 
WHERE (
  (module = 'dashboard' AND action = 'view') OR
  (module = 'library' AND action IN ('view', 'play')) OR
  (module = 'transcriptions' AND action = 'view') OR
  (module = 'whatsapp' AND action = 'view') OR
  (module = 'analytics' AND action = 'view') OR
  (module = 'reports' AND action = 'view')
)
ON CONFLICT DO NOTHING;

-- 2. Delete all 44 legacy duplicate permissions
-- This cascades and removes all legacy references from role_permissions automatically
DELETE FROM public.permissions
WHERE module IN (
  'centro_inteligencia',
  'biblioteca',
  'transcripciones',
  'analiticas',
  'cuentas',
  'usuarios',
  'facturacion',
  'auditoria',
  'exportaciones',
  'configuracion',
  'limites',
  'consulta_ia'
)
OR (module = 'prompts' AND action IN ('ver', 'crear', 'editar', 'borrar'))
OR (module = 'roles' AND action IN ('ver', 'crear', 'editar', 'borrar'))
OR (module = 'soporte' AND action = 'ver');

COMMIT;
