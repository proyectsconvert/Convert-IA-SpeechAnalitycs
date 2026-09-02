import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ShieldOff,
  Sparkles,
  CheckCircle2,
  Eye,
  Plus,
  Loader2,
  Star,
  Check,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { MatrixPreviewModal } from "./MatrixPreviewModal";
import { CreateMatrixInlineDialog } from "./CreateMatrixInlineDialog";
import { useSeedMatrix } from "@/hooks/useQualityMatrix";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { QualityMatrixVersion } from "@/components/analizador-total/quality/types";

import { useNavigate } from "react-router-dom";

interface Props {
  accountId: string | undefined;
  qualityMatrices: QualityMatrixVersion[];
  selectedMatrixId: string | null; // "none" | matrixId | "default"
  onSelectMatrix: (id: string | null) => void;
  onNextStep: () => void;
  onCloseWizard?: () => void;
}

export function Step2QualityMatrix({
  accountId,
  qualityMatrices,
  selectedMatrixId,
  onSelectMatrix,
  onNextStep,
  onCloseWizard,
}: Props) {
  const navigate = useNavigate();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isCreatingDefault, setIsCreatingDefault] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [creationComplete, setCreationComplete] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

  const handleGoToMatricesModule = () => {
    onCloseWizard?.();
    navigate("/analizador-total?tab=quality");
  };

  const seedMutation = useSeedMatrix(accountId);

  const hasMatrices = qualityMatrices.length > 0 || creationComplete;

  // Encontrar la matriz actualmente seleccionada para mostrar su nombre
  const defaultMat = qualityMatrices.find((m) => m.is_default) || qualityMatrices[0];
  const activeMatrix =
    selectedMatrixId === "none" || selectedMatrixId === null
      ? null
      : selectedMatrixId === "default"
      ? defaultMat
      : qualityMatrices.find((m) => m.id === selectedMatrixId) || defaultMat;

  // Handler para crear matriz predeterminada
  const handleCreateDefaultMatrix = async () => {
    setIsCreatingDefault(true);
    setCreationProgress(15);

    try {
      const pInterval = setInterval(() => {
        setCreationProgress((p) => (p < 85 ? p + 20 : p));
      }, 300);

      const res = await seedMutation.mutateAsync();
      clearInterval(pInterval);
      setCreationProgress(100);

      setTimeout(() => {
        setIsCreatingDefault(false);
        setCreationComplete(true);
        const createdId = res?.id || (res as any)?.version?.id || "default";
        setNewlyCreatedId(createdId);
        onSelectMatrix(createdId);
        toast.success("Matriz de Calidad creada y activada");
      }, 600);
    } catch (e: any) {
      setIsCreatingDefault(false);
      toast.error(e.message || "Error al crear la matriz predeterminada");
    }
  };

  const handleMatrixCreated = (newId: string) => {
    onSelectMatrix(newId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          2. Matriz de Calidad y Auditoría
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configura si deseas auditar el cumplimiento del protocolo, speech comercial y parámetros de calidad.
        </p>
      </div>

      {/* CASO A: LA CUENTA NO TIENE MATRICES */}
      {!hasMatrices && !isCreatingDefault && !creationComplete && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Opción 1: No evaluar matriz */}
          <div
            onClick={() => onSelectMatrix("none")}
            className={cn(
              "group flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer",
              selectedMatrixId === "none"
                ? "border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30"
                : "border-border/70 bg-card hover:border-border hover:bg-secondary/40",
            )}
          >
            <div className="space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-secondary text-muted-foreground group-hover:text-foreground flex items-center justify-center transition-colors">
                <ShieldOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">No evaluar Matriz de Calidad</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Las grabaciones se transcribirán y analizarán normalmente con IA, pero se omitirá la puntuación numérica de matriz.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Omitir Auditoría</span>
              {selectedMatrixId === "none" && (
                <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              )}
            </div>
          </div>

          {/* Opción 2: Crear Matriz Predeterminada */}
          <div
            onClick={handleCreateDefaultMatrix}
            className="group flex flex-col justify-between p-5 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-accent/5 hover:border-primary/60 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">Crear Matriz Predeterminada</h3>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    Recomendado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Crea automáticamente la matriz estándar con criterios de saludo, identificación, sondeo, objeciones, cierre y errores críticos.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:underline">
                Crear y Activar Ahora →
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Animación: Creando Matriz Predeterminada */}
      {isCreatingDefault && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col items-center justify-center text-center space-y-4"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 animate-ping absolute inset-0" />
            <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center relative shadow-xs">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
          </div>

          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-bold text-foreground">Creando tu Matriz de Calidad...</h3>
            <p className="text-xs text-muted-foreground">
              Configurando bloques de evaluación, pesos porcentuales y reglas de auditoría.
            </p>
          </div>

          <div className="w-full max-w-xs space-y-1.5">
            <Progress value={creationProgress} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
              <span>Estructurando criterios...</span>
              <span>{creationProgress}%</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Éxito: Matriz Creada la primera vez */}
      {creationComplete && !isCreatingDefault && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">✓ Matriz de Calidad creada correctamente</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                La cuenta ahora cuenta con la <strong>Matriz Global de Calidad y Experiencia</strong> activa.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              className="gap-1.5 text-xs h-9 font-semibold"
            >
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span>Ver Criterios de la Matriz</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onNextStep}
              className="gap-1.5 text-xs h-9 font-semibold bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <span>Continuar a Carga de Llamadas →</span>
            </Button>
          </div>
        </motion.div>
      )}

      {/* CASO B: LA CUENTA YA TIENE MATRICES CONFIGURADAS */}
      {hasMatrices && !creationComplete && (
        <div className="space-y-3 pt-1">
          {/* Opción 1: No evaluar matriz */}
          <div
            onClick={() => onSelectMatrix("none")}
            className={cn(
              "flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer",
              selectedMatrixId === "none"
                ? "border-accent bg-accent/10 shadow-xs ring-1 ring-accent/30"
                : "border-border/70 bg-card hover:bg-secondary/40",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center">
                <ShieldOff className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground block">No evaluar Matriz de Calidad</span>
                <span className="text-[11px] text-muted-foreground">Omitir puntuación de matriz en este lote</span>
              </div>
            </div>

            {selectedMatrixId === "none" && (
              <div className="w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}
          </div>

          {/* Opción 2: Evaluar utilizando una Matriz de Calidad */}
          <div
            className={cn(
              "p-4 rounded-xl border transition-all space-y-3",
              selectedMatrixId !== "none"
                ? "border-primary/40 bg-gradient-to-br from-card to-primary/5 shadow-xs ring-1 ring-primary/20"
                : "border-border/70 bg-card hover:border-border",
            )}
          >
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => {
                if (selectedMatrixId === "none") {
                  onSelectMatrix(defaultMat?.id || "default");
                }
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground block">
                    Evaluar utilizando una Matriz de Calidad
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Audita criterios, saludo, argumentación y cumplimiento
                  </span>
                </div>
              </div>

              {selectedMatrixId !== "none" && (
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>

            {/* Selector de Matriz si está activo */}
            {selectedMatrixId !== "none" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="pt-2 border-t border-border/50 space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1">
                    <Select
                      value={selectedMatrixId || "default"}
                      onValueChange={(val) => onSelectMatrix(val)}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Seleccionar matriz..." />
                      </SelectTrigger>
                      <SelectContent>
                        {qualityMatrices.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{m.label || `Matriz v${m.version}`}</span>
                              {m.macroproceso && (
                                <Badge variant="secondary" className="text-[9px] uppercase">
                                  {m.macroproceso}
                                </Badge>
                              )}
                              {m.is_default && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewOpen(true)}
                    className="h-9 gap-1.5 text-xs font-semibold hover:bg-secondary flex-shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <span>Ver Criterios</span>
                  </Button>
                </div>

                {activeMatrix && (
                  <div className="p-2.5 rounded-lg bg-secondary/50 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>
                      Esta llamada será evaluada utilizando:{" "}
                      <strong className="text-foreground">{activeMatrix.label || `Matriz v${activeMatrix.version}`}</strong>
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Opción 3: Crear Nueva Matriz */}
          <div
            onClick={handleGoToMatricesModule}
            className="group flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-border/80 bg-secondary/20 hover:bg-secondary/40 hover:border-accent/50 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>¿Deseas diseñar una nueva matriz de calidad personalizada?</span>
            </div>
            <span className="text-xs font-bold text-accent group-hover:underline flex items-center gap-1">
              Ir al Módulo de Matrices →
            </span>
          </div>
        </div>
      )}

      {/* Modal de Previsualización de Criterios Reales */}
      <MatrixPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        versionId={activeMatrix?.id || null}
        matrixName={activeMatrix?.label}
      />
    </motion.div>
  );
}
