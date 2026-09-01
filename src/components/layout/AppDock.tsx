import { useState, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { NAVIGATION_CONFIG, DockGroupItem, NavChildItem } from "@/config/navigationConfig";
import { usePermissions } from "@/hooks/usePermissions";
import { DockItem } from "./DockItem";

export function AppDock() {
  const location = useLocation();
  const { can } = usePermissions();
  const dockRef = useRef<HTMLDivElement>(null);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Filtrar grupos e ítems según permisos
  const allowedGroups = useMemo(() => {
    return NAVIGATION_CONFIG.map((group) => {
      // Si el grupo tiene hijos, filtrar hijos permitidos
      if (group.children && group.children.length > 0) {
        const allowedChildren = group.children.filter((child) =>
          can(child.perm.module, child.perm.action)
        );
        return {
          ...group,
          allowedChildren,
          isAllowed: allowedChildren.length > 0,
        };
      }

      // Si es un ítem directo sin hijos
      const isAllowed = group.perm ? can(group.perm.module, group.perm.action) : true;
      return {
        ...group,
        allowedChildren: [] as NavChildItem[],
        isAllowed,
      };
    }).filter((g) => g.isAllowed);
  }, [can]);

  // Manejador continuo de movimiento del mouse sobre el Dock
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Determinar qué grupo del dock está activo actualmente según la ruta actual
  const isGroupActive = useCallback(
    (group: DockGroupItem & { allowedChildren: NavChildItem[] }) => {
      const currentPath = location.pathname;

      // 1. Coincidencia exacta con la URL principal del grupo
      if (group.url) {
        if (group.exact) {
          if (currentPath === group.url) return true;
        } else if (currentPath === group.url || (group.url !== "/" && currentPath.startsWith(group.url))) {
          return true;
        }
      }

      // 2. Coincidencia con cualquiera de sus hijos
      if (group.allowedChildren && group.allowedChildren.length > 0) {
        return group.allowedChildren.some((child) => {
          const childPath = child.url.split("?")[0];
          if (childPath === "/analiticas") {
            return currentPath.startsWith("/analiticas");
          }
          return currentPath === childPath;
        });
      }

      return false;
    },
    [location.pathname]
  );

  return (
    <div
      ref={dockRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-card/60 backdrop-blur-md border border-border/70 rounded-2xl shadow-xs transition-all select-none"
    >
      {allowedGroups.map((group, index) => {
        // Calcular la distancia relativa del cursor al centro aproximado del ítem
        let mouseDistance: number | null = null;
        if (mousePos && dockRef.current) {
          const totalItems = allowedGroups.length;
          const dockWidth = dockRef.current.offsetWidth;
          const itemWidth = dockWidth / totalItems;
          const itemCenterX = (index + 0.5) * itemWidth;
          mouseDistance = Math.abs(mousePos.x - itemCenterX);
        }

        const active = isGroupActive(group);

        return (
          <DockItem
            key={group.id}
            item={group}
            index={index}
            mouseDistance={mouseDistance}
            isActive={active}
            allowedChildren={group.allowedChildren}
          />
        );
      })}
    </div>
  );
}
