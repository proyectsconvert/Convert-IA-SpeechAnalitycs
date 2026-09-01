import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AudioLines,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
  ShieldCheck,
  GripVertical,
  ArrowDownUp,
} from "lucide-react";

interface ProviderRow {
  id: string;
  provider: string;
  display_name: string;
  enabled: boolean;
  priority: number;
  model: string;
  available_models: string[];
  config: Record<string, unknown>;
}

interface ProviderState extends ProviderRow {
  dirty: boolean;
}

const PROVIDER_META: Record<string, { color: string; gradient: string; icon: string; description: string; envVar: string }> = {
  assemblyai: {
    color: "from-blue-500 to-indigo-600",
    gradient: "bg-gradient-to-r from-blue-500/10 to-indigo-600/10 border-blue-500/20",
    icon: "🔷",
    description: "Transcripción con modelo universal-2 y diarización nativa de hablantes",
    envVar: "ASSEMBLY",
  },
  deepgram: {
    color: "from-emerald-500 to-teal-600",
    gradient: "bg-gradient-to-r from-emerald-500/10 to-teal-600/10 border-emerald-500/20",
    icon: "🟢",
    description: "Modelo Nova-3 con separación de hablantes en tiempo real",
    envVar: "DEEPGRAM",
  },
  openai: {
    color: "from-orange-500 to-amber-600",
    gradient: "bg-gradient-to-r from-orange-500/10 to-amber-600/10 border-orange-500/20",
    icon: "🟠",
    description: "Whisper mini con diarización asistida por GPT",
    envVar: "OPENAI_API_KEY",
  },
};

export default function ModelosTranscripcionPage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.is_superadmin || false;

  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch global providers
  const { data, isLoading, error } = useQuery({
    queryKey: ["transcription-providers-global"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("No auth token");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-transcription-providers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      return (result.providers || []) as ProviderRow[];
    },
  });

  // Initialize provider state
  useEffect(() => {
    if (data && data.length > 0) {
      setProviders(
        data.map((p) => ({
          ...p,
          dirty: false,
        })),
      );
      setHasChanges(false);
    }
  }, [data]);

  // Update a provider field
  const updateProvider = useCallback(
    (provider: string, field: string, value: unknown) => {
      setProviders((prev) =>
        prev.map((p) =>
          p.provider === provider ? { ...p, [field]: value, dirty: true } : p,
        ),
      );
      setHasChanges(true);
    },
    [],
  );

  // Move provider up/down in priority
  const moveProvider = useCallback((provider: string, direction: "up" | "down") => {
    setProviders((prev) => {
      const sorted = [...prev].sort((a, b) => a.priority - b.priority);
      const idx = sorted.findIndex((p) => p.provider === provider);
      if (idx < 0) return prev;

      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return prev;

      // Swap priorities
      const temp = sorted[idx].priority;
      const newSorted = [...sorted];
      newSorted[idx] = { ...sorted[idx], priority: sorted[targetIdx].priority, dirty: true };
      newSorted[targetIdx] = { ...sorted[targetIdx], priority: temp, dirty: true };

      setHasChanges(true);
      return newSorted.sort((a, b) => a.priority - b.priority);
    });
  }, []);

  // Save configuration
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("No auth token");

      const payload = {
        providers: providers.map((p) => ({
          provider: p.provider,
          enabled: p.enabled,
          priority: p.priority,
          model: p.model,
          config: p.config,
        })),
      };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-transcription-providers`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success("Configuración global guardada exitosamente");
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["transcription-providers-global"] });
    },
    onError: (err: Error) => {
      toast.error(`Error al guardar: ${err.message}`);
    },
  });

  const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <AudioLines className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-destructive">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AudioLines className="w-6 h-6 text-accent" />
            Cascada de Transcripción
          </h1>
          <p className="text-sm text-muted-foreground">
            Configura el orden de prioridad de los proveedores de transcripción para <strong className="text-foreground">todas las cuentas</strong>.
            Si el primero falla, se usa el siguiente automáticamente.
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="flex items-center gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar cambios globales
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <ArrowDownUp className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">Configuración Global:</strong> Estos ajustes se aplican
            de manera general a todas las cuentas del sistema. El orden de prioridad
            es el mismo para todos los clientes.
          </p>
          {!isSuperAdmin && (
            <p className="text-amber-600 font-medium">
              ⚠️ Solo los administradores globales pueden modificar esta configuración.
            </p>
          )}
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {sortedProviders.map((prov, index) => {
          const meta = PROVIDER_META[prov.provider] || PROVIDER_META.openai;
          const isFirst = index === 0;
          const isLast = index === sortedProviders.length - 1;

          return (
            <div
              key={prov.provider}
              className={`rounded-xl border transition-all duration-200 ${
                prov.enabled
                  ? `${meta.gradient} shadow-sm hover:shadow-md`
                  : "bg-muted/30 border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  {/* Priority arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveProvider(prov.provider, "up")}
                      disabled={isFirst || !isSuperAdmin}
                      className="p-0.5 rounded hover:bg-background/50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveProvider(prov.provider, "down")}
                      disabled={isLast || !isSuperAdmin}
                      className="p-0.5 rounded hover:bg-background/50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  <GripVertical className="w-4 h-4 text-muted-foreground/40" />

                  {/* Provider info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.icon}</span>
                      <h3 className="font-semibold text-foreground">{prov.display_name}</h3>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          prov.enabled
                            ? "border-green-500/30 text-green-600 bg-green-500/10"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        #{index + 1}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                </div>

                {/* Right side: model selector + toggle */}
                <div className="flex items-center gap-4">
                  {/* Model selector */}
                  <div className="w-56">
                    <Select
                      value={prov.model}
                      disabled={!isSuperAdmin}
                      onValueChange={(val) => updateProvider(prov.provider, "model", val)}
                    >
                      <SelectTrigger className="h-8 bg-background/60 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(prov.available_models || []).map((m: string) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Env key badge */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-background/40 rounded-md px-2 py-1 border border-border/30">
                    <ShieldCheck className="w-3 h-3 text-green-500" />
                    <span>env: {meta.envVar}</span>
                  </div>

                  {/* Enable/Disable toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {prov.enabled ? "Activo" : "Inactivo"}
                    </span>
                    <Switch
                      checked={prov.enabled}
                      disabled={!isSuperAdmin}
                      onCheckedChange={(val) => updateProvider(prov.provider, "enabled", val)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {providers.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <AudioLines className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay proveedores configurados en el sistema.</p>
          <p className="text-sm mt-1">Contacta al administrador para inicializar la configuración global.</p>
        </div>
      )}

      {/* Save footer (sticky) */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Hay cambios sin guardar</span>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              size="sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
