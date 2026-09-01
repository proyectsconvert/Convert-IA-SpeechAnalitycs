import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";

/**
 * Permisos efectivos del usuario en la cuenta actual.
 * Combina rol fijo + rol personalizado (con herencia) + overrides individuales.
 * Superadmin (perfil) tiene todo sin consultar.
 */
export function usePermissions() {
  const { profile, user } = useAuth();
  const { currentAccount, loading: accountLoading } = useAccount();

  const isElevated = Boolean(profile?.is_superadmin || currentAccount?.role === "superadmin");
  const accountId = currentAccount?.account_id;

  const { data: permissionKeys, isLoading, isError } = useQuery({
    queryKey: ["effective-role-permissions", user?.id, accountId],
    queryFn: async () => {
      if (!user?.id || !accountId) return [] as string[];

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(accountId)) {
        console.warn("usePermissions: accountId no es un UUID válido:", accountId);
        return [] as string[];
      }

      const { data, error } = await supabase.rpc("get_effective_permissions", {
        _user_id: user.id,
        _account_id: accountId,
      });

      if (error) {
        console.error("Error in get_effective_permissions:", error);
        throw error;
      }
      const keys: string[] = [];
      for (const row of (data || []) as any[]) {
        if (row.module && row.action) {
          keys.push(`${row.module}:${row.action}`);
          if (row.submodule) keys.push(`${row.module}.${row.submodule}:${row.action}`);
        }
      }
      console.log("usePermissions: Permisos cargados:", keys.length);
      return keys;
    },
    enabled: Boolean(user?.id && accountId) && !isElevated,
    staleTime: 1000 * 60 * 5,
    structuralSharing: false,
  });

  const can = useCallback(
    (module: string, action: string) => {
      if (isElevated) return true;
      if (!permissionKeys || !Array.isArray(permissionKeys)) return false;
      return permissionKeys.includes(`${module}:${action}`);
    },
    [isElevated, permissionKeys],
  );


  const permissionsLoading = !isElevated && ((accountLoading && !accountId) || (Boolean(accountId) && isLoading));

  return { can, permissionsLoading, isError };
}
