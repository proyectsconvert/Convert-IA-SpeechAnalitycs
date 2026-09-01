import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";

/**
 * Devuelve `true` si el usuario es Superadmin global (`profile.is_superadmin`)
 * o si tiene el rol `superadmin` en la cuenta activa.
 *
 * Usar para puertas de acceso a acciones destructivas (borrar grabaciones,
 * conversaciones WhatsApp, presentaciones, reportes, links compartidos,
 * historial de chats, etc.). El conteo de consumo NO se descuenta al borrar.
 */
export function useIsSuperadmin(): boolean {
  const { profile } = useAuth();
  const { currentAccount } = useAccount();
  if (profile?.is_superadmin) return true;
  if (currentAccount?.role === "superadmin") return true;
  return false;
}
