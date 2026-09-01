/**
 * Mensajes legibles para errores frecuentes de Supabase/Postgres en la UI.
 */
export function formatRlsErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/row-level security|violates row-level security policy/i.test(msg)) {
    return (
      "No tienes permiso para registrar el audio en esta cuenta. " +
      "Comprueba que tu usuario esté asignado a la cuenta y activo en «Roles y permisos» o «Gestión de usuarios», " +
      "o contacta al administrador."
    );
  }
  return msg || "Error desconocido";
}
