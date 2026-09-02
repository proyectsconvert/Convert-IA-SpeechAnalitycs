import { useState, useEffect, useCallback, useMemo } from "react";
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
  colSpan: 1 | 2 | 3;
  visible: boolean;
}

export const DEFAULT_HOME_WIDGETS: DashboardWidgetConfig[] = [
  { id: "w_kpis", type: "kpis", title: "Métricas Clave", colSpan: 3, visible: true },
  { id: "w_executive", type: "executive_summary", title: "Resumen de Operación", colSpan: 1, visible: true },
  { id: "w_trend", type: "trend_activity", title: "Evolución Diaria", colSpan: 2, visible: true },
  { id: "w_sentiment", type: "sentiment_donut", title: "Sentimiento", colSpan: 1, visible: true },
  { id: "w_motivos", type: "top_motivos", title: "Top Motivos", colSpan: 2, visible: true },
  { id: "w_agents", type: "agents_ranking", title: "Ranking de Asesores", colSpan: 2, visible: true },
  { id: "w_channels", type: "channel_distribution", title: "Canales", colSpan: 1, visible: true },
  { id: "w_recent", type: "recent_activity", title: "Actividad Reciente", colSpan: 3, visible: true },
];

export function useHomeDashboardLayout(accountId: string | undefined) {
  const storageKey = useMemo(() => {
    return `HOME_DASHBOARD_LAYOUT_${accountId || "default"}`;
  }, [accountId]);

  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Error loading home dashboard layout:", e);
    }
    return DEFAULT_HOME_WIDGETS;
  });

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync on account change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
          setIsDirty(false);
          return;
        }
      }
    } catch (e) {}
    setWidgets(DEFAULT_HOME_WIDGETS);
    setIsDirty(false);
  }, [storageKey]);

  const moveWidget = useCallback((id: string, direction: "up" | "down") => {
    setWidgets((prev) => {
      const index = prev.findIndex((w) => w.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      setIsDirty(true);
      return copy;
    });
  }, []);

  const reorderWidget = useCallback((sourceId: string, targetId: string) => {
    setWidgets((prev) => {
      const sourceIndex = prev.findIndex((w) => w.id === sourceId);
      const targetIndex = prev.findIndex((w) => w.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

      const copy = [...prev];
      const [moved] = copy.splice(sourceIndex, 1);
      copy.splice(targetIndex, 0, moved);
      setIsDirty(true);
      return copy;
    });
  }, []);

  const setColSpan = useCallback((id: string, colSpan: 1 | 2 | 3) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, colSpan } : w));
      setIsDirty(true);
      return updated;
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, visible: false } : w));
      setIsDirty(true);
      return updated;
    });
    toast.info("Widget ocultado del tablero");
  }, []);

  const addWidget = useCallback((type: WidgetType, title?: string, colSpan: 1 | 2 | 3 = 1) => {
    setWidgets((prev) => {
      const existing = prev.find((w) => w.type === type && !w.visible);
      if (existing) {
        return prev.map((w) => (w.id === existing.id ? { ...w, visible: true, colSpan } : w));
      }
      const newWidget: DashboardWidgetConfig = {
        id: `w_${type}_${Date.now()}`,
        type,
        title: title || type,
        colSpan,
        visible: true,
      };
      return [...prev, newWidget];
    });
    setIsDirty(true);
    toast.success("Widget añadido al tablero");
  }, []);

  const saveLayout = useCallback(() => {
    setIsSaving(true);
    try {
      localStorage.setItem(storageKey, JSON.stringify(widgets));
      setIsDirty(false);
      toast.success("Tablero guardado con éxito");
    } catch (e) {
      toast.error("Error al guardar la configuración");
    } finally {
      setIsSaving(false);
    }
  }, [storageKey, widgets]);

  const resetToDefault = useCallback(() => {
    setWidgets(DEFAULT_HOME_WIDGETS);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
    setIsDirty(false);
    toast.success("Tablero restablecido a valores por defecto");
  }, [storageKey]);

  return {
    widgets,
    moveWidget,
    reorderWidget,
    setColSpan,
    removeWidget,
    addWidget,
    saveLayout,
    resetToDefault,
    isCustomizing,
    setIsCustomizing,
    isDirty,
    isSaving,
  };
}
