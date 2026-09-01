import { useEffect, useRef } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { getRoutePermission } from "@/lib/routePermissions";

/**
 * Aplica la matriz Roles y Permisos a la ruta actual (acción mínima "ver" por módulo).
 * Rutas no mapeadas (p. ej. 404) no se filtran aquí.
 */
export function RoutePermissionGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { can, permissionsLoading } = usePermissions();
  const req = getRoutePermission(location.pathname);
  const toastShown = useRef(false);

  useEffect(() => {
    toastShown.current = false;
  }, [location.pathname]);

  useEffect(() => {
    if (permissionsLoading || !req) return;
    if (!can(req.module, req.action) && !toastShown.current) {
      toastShown.current = true;
      toast.error("No tienes permiso para acceder a esta sección");
    }
  }, [permissionsLoading, req, can, location.pathname]);

  if (req && permissionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (req && !can(req.module, req.action)) {
    if (location.pathname === "/") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center min-h-[50vh] gap-3 px-4 text-center">
          <p className="text-lg font-semibold text-foreground">Sin acceso al inicio</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Tu rol no incluye permiso para Overview. Pide a un administrador que revise Roles y Permisos o asigne otro rol.
          </p>
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
