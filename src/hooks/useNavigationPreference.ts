import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type NavigationLayoutMode = "dock" | "sidebar";

const STORAGE_KEY_PREFIX = "navigation_layout_mode_";

export function useNavigationPreference() {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

  const [layoutMode, setLayoutModeState] = useState<NavigationLayoutMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "dock" || stored === "sidebar") {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return "dock"; // Modo Dock superior por defecto para la nueva experiencia
  });

  const [isSaving, setIsSaving] = useState(false);

  // Cargar preferencia remota desde profiles.preferences si existe
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
          const mode = prefs.navigation_layout_mode;
          if (mode === "dock" || mode === "sidebar") {
            setLayoutModeState(mode);
            try {
              localStorage.setItem(storageKey, mode);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore network / DB errors */
      }
    }

    loadRemotePref();
    return () => {
      isMounted = false;
    };
  }, [user?.id, storageKey]);

  const setLayoutMode = useCallback(
    async (newMode: NavigationLayoutMode, notify = true) => {
      setLayoutModeState(newMode);
      try {
        localStorage.setItem(storageKey, newMode);
      } catch {
        /* ignore */
      }

      if (user?.id) {
        setIsSaving(true);
        try {
          const { data } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .maybeSingle();

          const currentPrefs = (data?.preferences as Record<string, unknown>) || {};
          const updatedPrefs = {
            ...currentPrefs,
            navigation_layout_mode: newMode,
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from("profiles")
            .update({ preferences: updatedPrefs })
            .eq("id", user.id);

          if (notify) {
            toast.success(
              `Navegación actualizada: ${newMode === "dock" ? "Dock Superior" : "Sidebar Clásico"}`
            );
          }
        } catch (err) {
          console.warn("No se pudo guardar la preferencia de navegación:", err);
        } finally {
          setIsSaving(false);
        }
      }
    },
    [user?.id, storageKey]
  );

  return {
    layoutMode,
    setLayoutMode,
    isSaving,
  };
}
