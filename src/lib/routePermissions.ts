/**
 * Mapeo ruta → permiso mínimo (módulo + acción "view") según el catálogo de `permissions` en la DB.
 * Todas las claves deben coincidir exactamente con los módulos registrados en la tabla public.permissions.
 */
const EXACT: Record<string, { module: string; action: string }> = {
  "/": { module: "dashboard", action: "view" },
  "/biblioteca": { module: "library", action: "view" },
  "/analytics-whatsapp": { module: "whatsapp", action: "view" },
  "/transcripciones": { module: "transcriptions", action: "view" },
  "/analizador-total": { module: "analytics", action: "view" },
  "/extracciones": { module: "analytics", action: "view" },
  "/analiticas": { module: "reports", action: "view" }, // Indicadores Estratégicos
  "/consulta-ia": { module: "chat_ai", action: "view" },
  "/prompts": { module: "prompts", action: "view" },
  "/cuentas": { module: "accounts", action: "view" },
  "/usuarios": { module: "users", action: "view" },
  "/roles": { module: "roles", action: "view" },
  "/limites": { module: "billing", action: "view" },
  "/facturacion": { module: "billing", action: "view" },
  "/auditoria": { module: "audit", action: "view" },
  "/soporte": { module: "soporte", action: "view" },
  "/conexion": { module: "connections", action: "view" },
  "/modelos-transcripcion": { module: "transcription_models", action: "view" },
  "/validacion-modelos": { module: "transcription_models", action: "view" },
  "/configuracion": { module: "settings", action: "view" },
};

export function getRoutePermission(pathname: string): { module: string; action: string } | null {
  if (EXACT[pathname]) return EXACT[pathname];
  // Soporte para rutas dinámicas o prefijos
  if (pathname.startsWith("/analiticas")) return { module: "reports", action: "view" };
  return null;
}
