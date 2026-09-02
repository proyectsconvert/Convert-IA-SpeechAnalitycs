import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Layers,
  Star,
  CheckCircle2,
  Info,
  Loader2,
  BookOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useQualityMatrices } from "@/hooks/useQualityMatrix";
import { useAccount } from "@/contexts/AccountContext";

interface AudioProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileIds: string[];
  onConfirm: (options: { promptId?: string; qualityMatrixId?: string }) => void;
  isProcessing?: boolean;
}

export function AudioProcessDialog({
  open,
  onOpenChange,
  fileIds,
  onConfirm,
  isProcessing = false,
}: AudioProcessDialogProps) {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  // 1. Fetch prompts
  const { data: prompts = [], isLoading: loadingPrompts } = useQuery({
    queryKey: ["prompts-dialog", accountId],
    enabled: open && !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompts")
        .select("id, name, description, status, category, version")
        .eq("account_id", accountId!)
        .order("status", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch quality matrices
  const { data: matrices = [], isLoading: loadingMatrices } = useQualityMatrices(
    open ? accountId : undefined,
  );

  // States
  const [selectedPromptId, setSelectedPromptId] = useState<string>("default");
  const [selectedMatrixId, setSelectedMatrixId] = useState<string>("default");

  // Reset to default on modal open
  useEffect(() => {
    if (open) {
      setSelectedPromptId("default");
      // Set default matrix if exists
      const defaultMat = matrices.find((m) => m.is_default);
      setSelectedMatrixId(defaultMat ? defaultMat.id : "default");
    }
  }, [open, matrices]);

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);
  const selectedMatrix = matrices.find((m) => m.id === selectedMatrixId);
  const defaultMatrix = matrices.find((m) => m.is_default);

  const handleStart = () => {
    onConfirm({
      promptId: selectedPromptId === "default" ? undefined : selectedPromptId,
      qualityMatrixId:
        selectedMatrixId === "default"
          ? defaultMatrix?.id || undefined
          : selectedMatrixId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="w-5 h-5 text-accent" />
            Procesar {fileIds.length} {fileIds.length === 1 ? "grabación" : "grabaciones"}
          </DialogTitle>
          <DialogDescription>
            Configura el prompt de inteligencia y la matriz de calidad para ejecutar el análisis.
          </DialogDescription>
        </DialogHeader>

        {/* Banner Informativo Explicativo */}
        <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3 text-left">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-foreground">
              Análisis Integral: Prompt + Matriz de Calidad
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Para obtener un análisis satisfactorio y completo, asegúrate de seleccionar tanto el{" "}
              <strong className="text-foreground">Prompt de Inteligencia</strong> (para extracción de insights, sentimiento y resumen) como la{" "}
              <strong className="text-foreground">Matriz de Calidad</strong> (para la evaluación de compliance, errores críticos y scoring de agentes).
            </p>
          </div>
        </div>

        <div className="space-y-4 py-1 text-left">
          {/* Campo 1: Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                1. Prompt de Inteligencia
              </label>
              {selectedPrompt && (
                <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">
                  {selectedPrompt.status === "draft" ? "Borrador" : "Activo"}
                </Badge>
              )}
            </div>

            <Select
              value={selectedPromptId}
              onValueChange={setSelectedPromptId}
              disabled={loadingPrompts}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Seleccionar prompt para el análisis..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <span className="font-semibold">Prompt Predeterminado del Sistema</span>
                </SelectItem>

                {prompts.filter((p) => p.status === "active").length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Prompts Activos
                    </div>
                    {prompts
                      .filter((p) => p.status === "active")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {p.category ? `(${p.category})` : ""}
                        </SelectItem>
                      ))}
                  </>
                )}

                {prompts.filter((p) => p.status === "draft").length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Borradores
                    </div>
                    {prompts
                      .filter((p) => p.status === "draft")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} (Borrador)
                        </SelectItem>
                      ))}
                  </>
                )}
              </SelectContent>
            </Select>

            {selectedPrompt?.description && (
              <p className="text-[11px] text-muted-foreground px-1 italic">
                {selectedPrompt.description}
              </p>
            )}
          </div>

          {/* Campo 2: Matriz de Calidad */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                2. Matriz de Calidad para Evaluación
              </label>
              {selectedMatrix?.is_default && (
                <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 gap-1 font-semibold">
                  <Star className="w-2.5 h-2.5 fill-amber-500" /> Predeterminada
                </Badge>
              )}
            </div>

            <Select
              value={selectedMatrixId}
              onValueChange={setSelectedMatrixId}
              disabled={loadingMatrices}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Seleccionar matriz de calidad..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      Matriz Predeterminada de la Cuenta {defaultMatrix ? `(${defaultMatrix.label})` : ""}
                    </span>
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  </div>
                </SelectItem>

                {matrices.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.label || `Matriz v${m.version}`}</span>
                      {m.is_default && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-500" /> Default
                        </span>
                      )}
                      {m.macroproceso && (
                        <span className="text-[10px] text-muted-foreground uppercase">
                          · {m.macroproceso}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedMatrix?.description && (
              <p className="text-[11px] text-muted-foreground px-1 italic">
                {selectedMatrix.description}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleStart}
            disabled={isProcessing}
            className="gap-2"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Iniciar Análisis y Evaluación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
