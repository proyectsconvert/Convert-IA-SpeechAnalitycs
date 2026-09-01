import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type TranscriptViewMode = "classic" | "detail";

const STORAGE_KEY_PREFIX = "transcriptions_view_mode_";

export function useTranscriptViewPreference() {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

  const [viewMode, setViewModeState] = useState<TranscriptViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "classic" || stored === "detail") {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return "classic";
  });

  const [isSaving, setIsSaving] = useState(false);

  // Cargar preferencia remota si existe
  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;

    async function loadRemotePref() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user!.id)
          .maybeSingle();

        if (!error && data?.preferences && isMounted) {
          const prefs = data.preferences as Record<string, unknown>;
          const mode = prefs.transcriptions_view_mode;
          if (mode === "classic" || mode === "detail") {
            setViewModeState(mode);
            try {
              localStorage.setItem(storageKey, mode);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore error if column not ready or network */
      }
    }

    loadRemotePref();
    return () => {
      isMounted = false;
    };
  }, [user?.id, storageKey]);

  const setViewMode = useCallback(
    async (newMode: TranscriptViewMode, notify = true) => {
      setViewModeState(newMode);
      try {
        localStorage.setItem(storageKey, newMode);
      } catch {
        /* ignore */
      }

      if (user?.id) {
        setIsSaving(true);
        try {
          // Obtener preferencias actuales primero para hacer merge
          const { data } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .maybeSingle();

          const currentPrefs = (data?.preferences as Record<string, unknown>) || {};
          const updatedPrefs = {
            ...currentPrefs,
            transcriptions_view_mode: newMode,
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from("profiles")
            .update({ preferences: updatedPrefs })
            .eq("id", user.id);

          if (notify) {
            toast.success(
              `Preferencia guardada: ${newMode === "detail" ? "Vista Detalle" : "Vista Clásica"}`
            );
          }
        } catch (err) {
          console.warn("No se pudo guardar la preferencia en el servidor:", err);
        } finally {
          setIsSaving(false);
        }
      }
    },
    [user?.id, storageKey]
  );

  return {
    viewMode,
    setViewMode,
    isSaving,
  };
}
