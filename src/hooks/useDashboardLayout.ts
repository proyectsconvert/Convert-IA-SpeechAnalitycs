import { useState, useEffect, useCallback, useMemo } from "react";
import { DASHBOARD_PRESETS, WidgetInstance, DashboardPreset } from "@/components/analiticas/presets/defaultDashboards";
import { toast } from "@/components/ui/sonner";

export function useDashboardLayout(accountId: string | undefined, dashboardId: string) {
  const activePreset = useMemo<DashboardPreset>(() => {
    return DASHBOARD_PRESETS.find((p) => p.id === dashboardId) || DASHBOARD_PRESETS[0];
  }, [dashboardId]);

  const storageKey = useMemo(() => {
    const acc = accountId || "default";
    return `INDICADORES_DASHBOARD_${acc}_${dashboardId}`;
  }, [accountId, dashboardId]);

  const [widgets, setWidgets] = useState<WidgetInstance[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Could not load dashboard layout from localStorage:", e);
    }
    return activePreset.defaultWidgets;
  });

  const [isEditing, setIsEditing] = useState(false);

  // Re-sync when dashboardId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn(e);
    }
    setWidgets(activePreset.defaultWidgets);
    setIsEditing(false);
  }, [storageKey, activePreset]);

  // Persist to localStorage whenever widgets change
  const saveWidgets = useCallback(
    (newWidgets: WidgetInstance[]) => {
      setWidgets(newWidgets);
      try {
        localStorage.setItem(storageKey, JSON.stringify(newWidgets));
      } catch (e) {
        console.warn("Error saving widgets to localStorage", e);
      }
    },
    [storageKey],
  );

  const moveWidget = useCallback(
    (id: string, direction: "up" | "down") => {
      setWidgets((prev) => {
        const index = prev.findIndex((w) => w.id === id);
        if (index === -1) return prev;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;

        const copy = [...prev];
        const [moved] = copy.splice(index, 1);
        copy.splice(targetIndex, 0, moved);
        try {
          localStorage.setItem(storageKey, JSON.stringify(copy));
        } catch (e) {}
        return copy;
      });
    },
    [storageKey],
  );

  const resizeWidget = useCallback(
    (id: string, colSpan: 1 | 2 | 3) => {
      setWidgets((prev) => {
        const updated = prev.map((w) => (w.id === id ? { ...w, colSpan } : w));
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      toast.success("Tamaño de panel actualizado");
    },
    [storageKey],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setWidgets((prev) => {
        const updated = prev.filter((w) => w.id !== id);
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      toast.info("Gráfico removido del tablero");
    },
    [storageKey],
  );

  const addWidget = useCallback(
    (widget: WidgetInstance) => {
      setWidgets((prev) => {
        const updated = [...prev, widget];
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      toast.success(`Gráfico "${widget.title}" añadido al tablero`);
    },
    [storageKey],
  );

  const resetToDefault = useCallback(() => {
    setWidgets(activePreset.defaultWidgets);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
    toast.success("Tablero restaurado a su configuración predeterminada");
  }, [activePreset, storageKey]);

  return {
    preset: activePreset,
    widgets,
    isEditing,
    setIsEditing,
    toggleEditing: () => setIsEditing((v) => !v),
    moveWidget,
    resizeWidget,
    removeWidget,
    addWidget,
    resetToDefault,
  };
}
