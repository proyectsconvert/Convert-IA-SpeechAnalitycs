import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type WidgetType =
  | "kpis"
  | "trend_activity"
  | "sentiment_donut"
  | "top_motivos"
  | "agents_ranking"
  | "channel_distribution"
  | "executive_summary"
  | "recent_activity";

export interface DashboardWidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  colSpan: 1 | 2 | 3; // 1 = 1 col, 2 = 2 cols, 3 = full width (en grid de 3 cols)
  visible: boolean;
  order: number;
}

export const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  {
    id: "widget-kpis",
    type: "kpis",
    title: "Métricas Clave",
    colSpan: 3,
    visible: true,
    order: 0,
  },
  {
    id: "widget-trend",
    type: "trend_activity",
    title: "Evolución de Actividad Temporal",
    colSpan: 2,
    visible: true,
    order: 1,
  },
  {
    id: "widget-summary",
    type: "executive_summary",
    title: "Resumen de Operación",
    colSpan: 1,
    visible: true,
    order: 2,
  },
  {
    id: "widget-sentiment",
    type: "sentiment_donut",
    title: "Distribución de Sentimiento",
    colSpan: 1,
    visible: true,
    order: 3,
  },
  {
    id: "widget-motivos",
    type: "top_motivos",
    title: "Top Motivos de Contacto",
    colSpan: 2,
    visible: true,
    order: 4,
  },
  {
    id: "widget-agents",
    type: "agents_ranking",
    title: "Ranking de Asesores",
    colSpan: 2,
    visible: true,
    order: 5,
  },
  {
    id: "widget-channel",
    type: "channel_distribution",
    title: "Comparativa de Canales",
    colSpan: 1,
    visible: true,
    order: 6,
  },
  {
    id: "widget-recent",
    type: "recent_activity",
    title: "Actividad Reciente en Vivo",
    colSpan: 3,
    visible: true,
    order: 7,
  },
];

export function useDashboardLayout(accountId?: string) {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const storageKey = `dashboard_layout_${accountId || "global"}_${userId}`;

  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_WIDGETS;
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Cargar preferencia remota desde profiles.preferences si existe
  useEffect(() => {
    if (!user?.id || !accountId) return;
    let isMounted = true;

    async function loadRemoteLayout() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user!.id)
          .maybeSingle();

        if (!error && data?.preferences && isMounted) {
          const prefs = data.preferences as Record<string, unknown>;
          const key = `dashboard_layout_${accountId}`;
          const remoteLayout = prefs[key];
          if (Array.isArray(remoteLayout) && remoteLayout.length > 0) {
            setWidgets(remoteLayout as DashboardWidgetConfig[]);
            try {
              localStorage.setItem(storageKey, JSON.stringify(remoteLayout));
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    loadRemoteLayout();
    return () => {
      isMounted = false;
    };
  }, [user?.id, accountId, storageKey]);

  // Reordenar widget por drag and drop directo
  const reorderWidget = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setWidgets((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const sourceIdx = sorted.findIndex((w) => w.id === sourceId);
      const targetIdx = sorted.findIndex((w) => w.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;

      const [removed] = sorted.splice(sourceIdx, 1);
      sorted.splice(targetIdx, 0, removed);

      const updated = sorted.map((w, idx) => ({ ...w, order: idx }));
      setIsDirty(true);
      return updated;
    });
  }, []);

  // Mover widget arriba o abajo en el orden
  const moveWidget = useCallback((id: string, direction: "up" | "down") => {
    setWidgets((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((w) => w.id === id);
      if (index === -1) return prev;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) return prev;

      const current = sorted[index];
      const target = sorted[targetIndex];
      const tempOrder = current.order;
      current.order = target.order;
      target.order = tempOrder;

      setIsDirty(true);
      return [...sorted].sort((a, b) => a.order - b.order);
    });
  }, []);

  // Cambiar visibilidad de un widget
  const toggleVisibility = useCallback((id: string) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
      setIsDirty(true);
      return updated;
    });
  }, []);

  // Cambiar tamaño de columnas de un widget
  const setColSpan = useCallback((id: string, colSpan: 1 | 2 | 3) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, colSpan } : w));
      setIsDirty(true);
      return updated;
    });
  }, []);

  // Agregar un nuevo widget
  const addWidget = useCallback((type: WidgetType, title?: string, colSpan: 1 | 2 | 3 = 1) => {
    setWidgets((prev) => {
      const newId = `widget-${type}-${Date.now()}`;
      const defaultTitle =
        title ||
        DEFAULT_WIDGETS.find((w) => w.type === type)?.title ||
        "Nuevo Gráfico";
      const maxOrder = prev.reduce((max, w) => Math.max(max, w.order), -1);

      const newWidget: DashboardWidgetConfig = {
        id: newId,
        type,
        title: defaultTitle,
        colSpan,
        visible: true,
        order: maxOrder + 1,
      };

      setIsDirty(true);
      return [...prev, newWidget];
    });
    toast.success("Widget añadido al tablero");
  }, []);

  // Eliminar un widget
  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const updated = prev.filter((w) => w.id !== id);
      setIsDirty(true);
      return updated;
    });
    toast.info("Widget eliminado del tablero");
  }, []);

  // Guardar configuración del tablero
  const saveLayout = useCallback(
    async (customWidgets?: DashboardWidgetConfig[]) => {
      const toSave = customWidgets || widgets;
      setIsSaving(true);

      try {
        localStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch {
        /* ignore */
      }

      if (user?.id && accountId) {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .maybeSingle();

          const currentPrefs = (data?.preferences as Record<string, unknown>) || {};
          const key = `dashboard_layout_${accountId}`;
          const updatedPrefs = {
            ...currentPrefs,
            [key]: toSave,
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from("profiles")
            .update({ preferences: updatedPrefs })
            .eq("id", user.id);

          setIsDirty(false);
          toast.success("Tablero de Inicio guardado exitosamente");
        } catch (err) {
          console.warn("Error guardando diseño en backend:", err);
          toast.warning("Guardado localmente en este navegador");
        } finally {
          setIsSaving(false);
        }
      } else {
        setIsDirty(false);
        setIsSaving(false);
        toast.success("Diseño guardado en este dispositivo");
      }
    },
    [widgets, user?.id, accountId, storageKey]
  );

  // Restablecer al diseño por defecto
  const resetToDefault = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    setIsDirty(true);
    toast.info("Diseño restablecido al predeterminado. Haz clic en 'Guardar' para conservarlo.");
  }, []);

  return {
    widgets: [...widgets].sort((a, b) => a.order - b.order),
    moveWidget,
    reorderWidget,
    toggleVisibility,
    setColSpan,
    addWidget,
    removeWidget,
    saveLayout,
    resetToDefault,
    isCustomizing,
    setIsCustomizing,
    isDirty,
    isSaving,
  };
}
