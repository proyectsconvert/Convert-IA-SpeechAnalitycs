
ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_module_action_key;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

UPDATE public.permissions
SET label = initcap(replace(module, '_', ' ')) || ' - ' || initcap(action)
WHERE label IS NULL;

WITH catalog(module, submodule, action, label, description, sort_order) AS (
  VALUES
    ('dashboard', NULL, 'view', 'Ver dashboard', 'Acceder al panel principal', 10),
    ('dashboard', NULL, 'export', 'Exportar dashboard', 'Exportar widgets/KPIs', 11),
    ('library', 'calls', 'view', 'Ver biblioteca de llamadas', 'Listar audios procesados', 100),
    ('library', 'calls', 'play', 'Reproducir audio', 'Escuchar audios', 101),
    ('library', 'calls', 'download', 'Descargar audio', 'Descargar archivos de audio', 102),
    ('library', 'calls', 'delete', 'Eliminar llamadas', 'Borrar audios y datos asociados', 103),
    ('library', 'calls', 'bulk_delete', 'Eliminación masiva', 'Borrar varios audios a la vez', 104),
    ('library', 'calls', 'reprocess', 'Reprocesar llamada', 'Volver a transcribir/analizar', 105),
    ('library', 'calls', 'export', 'Exportar resultados', 'CSV, TXT, XLSX', 106),
    ('uploads', 'audio', 'create', 'Subir audios', 'Cargar archivos individuales', 200),
    ('uploads', 'audio', 'bulk_create', 'Carga masiva de audios', 'Cargar carpetas y lotes', 201),
    ('uploads', 'audio', 'cancel', 'Cancelar carga', 'Detener uploads en curso', 202),
    ('transcriptions', NULL, 'view', 'Ver transcripciones', 'Acceder al texto y segmentos', 300),
    ('transcriptions', NULL, 'edit', 'Editar transcripciones', 'Modificar texto/diarización', 301),
    ('transcriptions', NULL, 'export', 'Exportar transcripción', 'TXT, CSV, XLSX', 302),
    ('analyses', NULL, 'view', 'Ver análisis', 'Resúmenes, sentimientos, insights', 400),
    ('analyses', NULL, 'create', 'Crear análisis', 'Lanzar análisis manual', 401),
    ('analyses', NULL, 'edit', 'Editar análisis', 'Ajustar resultados', 402),
    ('analyses', NULL, 'delete', 'Eliminar análisis', 'Borrar análisis', 403),
    ('analyses', NULL, 'export', 'Exportar análisis', 'Exportar resultados', 404),
    ('prompts', NULL, 'view', 'Ver prompts', 'Listar plantillas de IA', 500),
    ('prompts', NULL, 'create', 'Crear prompt', 'Nuevo prompt/borrador', 501),
    ('prompts', NULL, 'edit', 'Editar prompt', 'Modificar prompts', 502),
    ('prompts', NULL, 'delete', 'Eliminar prompt', 'Borrar prompts', 503),
    ('prompts', NULL, 'optimize', 'Optimizar con IA', 'Usar el optimizador de prompts', 504),
    ('prompts', NULL, 'compare', 'Comparar versiones', 'Side-by-side de versiones', 505),
    ('prompts', NULL, 'publish', 'Publicar prompt', 'Activar prompts en producción', 506),
    ('whatsapp', 'conversations', 'view', 'Ver conversaciones', 'Listar chats de WhatsApp', 600),
    ('whatsapp', 'conversations', 'upload', 'Cargar conversaciones', 'Importar archivos de WhatsApp', 601),
    ('whatsapp', 'conversations', 'delete', 'Eliminar conversaciones', 'Borrar chats', 602),
    ('whatsapp', 'conversations', 'export', 'Exportar conversaciones', 'Descargar chats', 603),
    ('whatsapp', 'analysis', 'view', 'Ver análisis WhatsApp', 'Resultados de análisis', 610),
    ('whatsapp', 'analysis', 'create', 'Lanzar análisis WhatsApp', 'Procesar lotes', 611),
    ('whatsapp', 'analysis', 'cancel', 'Cancelar análisis WhatsApp', 'Detener jobs', 612),
    ('whatsapp', 'analysis', 'export', 'Exportar análisis WhatsApp', 'CSV/XLSX', 613),
    ('analytics', 'unified', 'view', 'Ver analítica unificada', 'Dashboard Calls + WA', 700),
    ('analytics', 'unified', 'export', 'Exportar analítica', 'Exportar reportes', 701),
    ('analytics', 'quality', 'view', 'Ver matriz de calidad', 'Evaluaciones y scoring', 710),
    ('analytics', 'quality', 'edit', 'Editar matriz de calidad', 'Configurar criterios', 711),
    ('analytics', 'quality', 'export', 'Exportar calidad', 'Reportes de calidad', 712),
    ('reports', 'strategic', 'view', 'Ver reportes estratégicos', 'Presentaciones ejecutivas', 800),
    ('reports', 'strategic', 'create', 'Generar reporte estratégico', 'Crear nuevas presentaciones', 801),
    ('reports', 'strategic', 'share', 'Compartir reportes', 'Generar enlaces públicos', 802),
    ('reports', 'strategic', 'delete', 'Eliminar reportes', 'Borrar presentaciones', 803),
    ('reports', 'strategic', 'export', 'Exportar PDF', 'Descargar como PDF', 804),
    ('chat_ai', NULL, 'view', 'Ver chat IA', 'Acceder al asistente', 900),
    ('chat_ai', NULL, 'use', 'Consultar al chat IA', 'Hacer preguntas', 901),
    ('chat_ai', NULL, 'history', 'Ver historial', 'Conversaciones previas', 902),
    ('chat_ai', NULL, 'delete_history', 'Borrar historial', 'Limpiar consultas', 903),
    ('connections', 'remote', 'view', 'Ver conexiones remotas', 'SFTP/FTP/etc.', 1000),
    ('connections', 'remote', 'create', 'Crear conexión remota', 'Configurar nueva fuente', 1001),
    ('connections', 'remote', 'edit', 'Editar conexión remota', 'Modificar credenciales/filtros', 1002),
    ('connections', 'remote', 'delete', 'Eliminar conexión remota', 'Borrar fuente', 1003),
    ('connections', 'remote', 'run', 'Ejecutar importación', 'Lanzar import manual', 1004),
    ('notifications', NULL, 'view', 'Ver notificaciones', 'Bandeja de notificaciones', 1100),
    ('notifications', NULL, 'manage', 'Gestionar notificaciones', 'Marcar/eliminar', 1101),
    ('audit', NULL, 'view', 'Ver auditoría', 'Logs de actividad', 1200),
    ('audit', NULL, 'export', 'Exportar auditoría', 'Descargar logs', 1201),
    ('billing', 'usage', 'view', 'Ver consumo', 'Horas, almacenamiento, queries', 1300),
    ('billing', 'limits', 'view', 'Ver límites', 'Topes del plan', 1301),
    ('billing', 'limits', 'edit', 'Editar límites', 'Ajustar topes (superadmin)', 1302),
    ('billing', 'invoices', 'view', 'Ver facturas', 'Historial de facturación', 1303),
    ('billing', 'invoices', 'export', 'Exportar facturas', 'Descargar PDF/CSV', 1304),
    ('accounts', NULL, 'view', 'Ver cuentas', 'Listar tenants', 1400),
    ('accounts', NULL, 'create', 'Crear cuenta', 'Nuevo tenant', 1401),
    ('accounts', NULL, 'edit', 'Editar cuenta', 'Modificar datos/branding', 1402),
    ('accounts', NULL, 'delete', 'Eliminar cuenta', 'Borrar tenant', 1403),
    ('accounts', NULL, 'switch', 'Cambiar de cuenta', 'Selector multi-tenant', 1404),
    ('users', NULL, 'view', 'Ver usuarios', 'Listar miembros', 1500),
    ('users', NULL, 'invite', 'Invitar usuario', 'Enviar invitaciones', 1501),
    ('users', NULL, 'create', 'Crear usuario', 'Alta directa (superadmin)', 1502),
    ('users', NULL, 'edit', 'Editar usuario', 'Modificar perfil/rol', 1503),
    ('users', NULL, 'deactivate', 'Desactivar usuario', 'Inhabilitar acceso', 1504),
    ('users', NULL, 'delete', 'Eliminar usuario', 'Borrar miembro', 1505),
    ('users', NULL, 'assign_role', 'Asignar rol', 'Cambiar rol fijo o personalizado', 1506),
    ('roles', NULL, 'view', 'Ver roles', 'Listar roles fijos y personalizados', 1600),
    ('roles', NULL, 'create', 'Crear rol personalizado', 'Nuevo rol global', 1601),
    ('roles', NULL, 'edit', 'Editar permisos del rol', 'Modificar matriz', 1602),
    ('roles', NULL, 'duplicate', 'Duplicar rol', 'Clonar configuración', 1603),
    ('roles', NULL, 'delete', 'Eliminar rol personalizado', 'Borrar rol global', 1604),
    ('roles', NULL, 'history', 'Ver historial de cambios', 'Auditoría de roles', 1605),
    ('transcription_models', NULL, 'view', 'Ver modelos', 'Listar proveedores y modelos', 1700),
    ('transcription_models', NULL, 'edit', 'Configurar modelos', 'Cambiar proveedor/modelo', 1701),
    ('transcription_models', NULL, 'test', 'Probar modelos', 'Ejecutar test de conectividad', 1702),
    ('settings', 'general', 'view', 'Ver configuración', 'Ajustes generales', 1800),
    ('settings', 'general', 'edit', 'Editar configuración', 'Cambiar ajustes', 1801),
    ('settings', 'branding', 'view', 'Ver branding', 'Logos, colores', 1810),
    ('settings', 'branding', 'edit', 'Editar branding', 'Modificar identidad visual', 1811),
    ('settings', 'security', 'view', 'Ver seguridad', 'Políticas y sesión', 1820),
    ('settings', 'security', 'edit', 'Editar seguridad', 'Cambiar políticas', 1821)
)
INSERT INTO public.permissions (module, submodule, action, label, description, sort_order)
SELECT c.module, c.submodule, c.action, c.label, c.description, c.sort_order
FROM catalog c
ON CONFLICT (module, COALESCE(submodule, ''), action) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;
