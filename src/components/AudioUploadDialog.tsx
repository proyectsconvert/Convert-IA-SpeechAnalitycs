import { useState, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  Sparkles,
  FileAudio,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Play,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { formatRlsErrorMessage } from "@/lib/supabaseErrors";
import { invokeProcessCall } from "@/lib/invokeProcessCall";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileUploadItem } from "@/components/AudioUpload";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { useQualityMatrices } from "@/hooks/useQualityMatrix";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Wizard Components
import { WizardStepIndicator, WizardStep } from "@/components/upload/wizard/WizardStepIndicator";
import { Step1PromptSelect } from "@/components/upload/wizard/Step1PromptSelect";
import { Step2QualityMatrix } from "@/components/upload/wizard/Step2QualityMatrix";
import { Step3AudioFiles } from "@/components/upload/wizard/Step3AudioFiles";

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
];
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".webm", ".flac", ".aac"];
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const sanitizeFileName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 200);

const getBatchSize = (n: number) => (n > 200 ? 100 : n > 100 ? 50 : 20);

const checkDuplicates = async (accountId: string, names: string[]): Promise<Set<string>> => {
  const dups = new Set<string>();
  if (!names.length) return dups;
  const CHUNK = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += CHUNK) chunks.push(names.slice(i, i + CHUNK));
  const results = await Promise.allSettled(
    chunks.map((c) =>
      supabase
        .from("audio_files")
        .select("file_name")
        .eq("account_id", accountId)
        .in("file_name", c),
    ),
  );
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value.data) {
      r.value.data.forEach((d) => dups.add(d.file_name.toLowerCase()));
    }
  });
  return dups;
};

const validateFile = (file: File): string | null => {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext))
    return `Formato no soportado: ${file.type || ext}`;
  if (file.size > MAX_SIZE) return `Archivo demasiado grande (máx 100MB)`;
  if (file.size < 1000) return "Archivo demasiado pequeño";
  return null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: () => void;
}

export function AudioUploadDialog({ open, onOpenChange, onUploadComplete }: Props) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("default");
  const [selectedMatrixId, setSelectedMatrixId] = useState<string | null>("default");
  const [isRunning, setIsRunning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing" | "done">("idle");

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  const { data: prompts = [] } = useQuery({
    queryKey: ["prompts-upload", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase
        .from("prompts")
        .select("id, name, category, status, system_instructions")
        .eq("account_id", accountId)
        .in("status", ["active", "draft"])
        .order("name");
      return data || [];
    },
    enabled: !!accountId && open,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: qualityMatrices = [] } = useQualityMatrices(open ? accountId : undefined);
  const { canUpload, hoursUsed, maxHours } = useAccountLimits();

  const addFiles = useCallback(
    async (newFiles: File[]) => {
      if (!accountId) return;
      const validated = newFiles.map((file) => ({
        file,
        id: crypto.randomUUID(),
        error: validateFile(file),
      }));
      const validNames = validated.filter((v) => !v.error).map((v) => v.file.name);
      const existingSet = await checkDuplicates(accountId, validNames);
      const items: FileUploadItem[] = validated.map(({ file, id, error }) => {
        if (error) return { file, id, progress: 0, status: "error" as const, error };
        if (existingSet.has(file.name.toLowerCase()))
          return {
            file,
            id,
            progress: 0,
            status: "duplicate" as const,
            error: `Archivo duplicado: ya existe "${file.name}"`,
          };
        return { file, id, progress: 0, status: "pending" as const };
      });
      const seen = new Set<string>();
      for (const item of items) {
        if (item.status !== "pending") continue;
        const key = item.file.name.toLowerCase();
        if (seen.has(key)) {
          item.status = "duplicate";
          item.error = "Duplicado dentro de este lote";
        }
        seen.add(key);
      }
      const dupCount = items.filter((i) => i.status === "duplicate").length;
      if (dupCount > 0) toast.warning(`${dupCount} archivo(s) duplicado(s) detectado(s)`);
      setFiles((prev) => [...prev, ...items]);
    },
    [accountId],
  );

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const uploadSingleFile = async (
    item: FileUploadItem,
    promptId: string | null,
    matrixId: string | null,
  ): Promise<{ success: boolean; audioId?: string; skipped?: boolean }> => {
    if (item.status === "error" || item.status === "duplicate") return { success: false, skipped: true };
    if (!accountId || !user) return { success: false };
    try {
      const { data: existing } = await supabase
        .from("audio_files")
        .select("id")
        .eq("account_id", accountId)
        .eq("file_name", item.file.name)
        .limit(1);

      if (existing?.length) {
        setFiles((p) =>
          p.map((f) =>
            f.id === item.id
              ? { ...f, status: "duplicate" as const, error: `Ya existe "${item.file.name}"` }
              : f,
          ),
        );
        return { success: false, skipped: true };
      }

      setFiles((p) => p.map((f) => (f.id === item.id ? { ...f, status: "uploading" as const, progress: 20 } : f)));
      const safeName = sanitizeFileName(item.file.name);
      const filePath = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;

      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const { error } = await supabase.storage
            .from("audio-files")
            .upload(filePath, item.file, { contentType: item.file.type });
          if (error) throw error;
          break;
        } catch (err) {
          if (attempts === 3) throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempts));
        }
      }

      setFiles((p) => p.map((f) => (f.id === item.id ? { ...f, progress: 60 } : f)));
      const { data: rec, error: dbErr } = await supabase
        .from("audio_files")
        .insert({
          account_id: accountId,
          file_name: item.file.name,
          file_path: filePath,
          file_size_bytes: item.file.size,
          mime_type: item.file.type,
          uploaded_by: user.id,
          prompt_id: promptId,
          quality_matrix_id: matrixId,
          status: "uploaded",
        } as any)
        .select()
        .single();

      if (dbErr) throw dbErr;
      setFiles((p) =>
        p.map((f) => (f.id === item.id ? { ...f, progress: 100, status: "done" as const, dbId: rec.id } : f)),
      );
      return { success: true, audioId: rec.id };
    } catch (err: any) {
      setFiles((p) =>
        p.map((f) => (f.id === item.id ? { ...f, status: "error" as const, error: formatRlsErrorMessage(err) } : f)),
      );
      return { success: false };
    }
  };

  const processCallsBatch = async (audioIds: string[], promptId: string | null, matrixId: string | null) => {
    const CONCURRENT = 5;
    const batches: string[][] = [];
    for (let i = 0; i < audioIds.length; i += CONCURRENT) batches.push(audioIds.slice(i, i + CONCURRENT));
    for (let bi = 0; bi < batches.length; bi++) {
      await Promise.allSettled(
        batches[bi].map((id) =>
          invokeProcessCall(
            { audio_file_id: id, account_id: accountId, prompt_id: promptId, quality_matrix_id: matrixId },
            { skipRefresh: true },
          ),
        ),
      );
      if (bi < batches.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }
  };

  const startUpload = async () => {
    if (!accountId || !user) return;
    if (!canUpload) {
      toast.error("Límite de transcripción alcanzado", {
        description: `Has consumido ${hoursUsed.toFixed(2)}h de ${maxHours}h este mes. Solicita ampliación al administrador.`,
        duration: 8000,
      });
      return;
    }

    const promptId = selectedPromptId !== "default" ? selectedPromptId : null;

    let matrixId: string | null = null;
    if (selectedMatrixId !== "none" && selectedMatrixId !== null) {
      if (selectedMatrixId === "default") {
        const defaultMat = qualityMatrices.find((m) => m.is_default) || qualityMatrices[0];
        matrixId = defaultMat?.id || null;
      } else {
        matrixId = selectedMatrixId;
      }
    }

    const validFiles = files.filter((f) => f.status === "pending");
    if (!validFiles.length) {
      toast.error("No hay archivos válidos para procesar");
      return;
    }

    setIsRunning(true);
    setUploadProgress(0);
    setUploadPhase("uploading");

    const BATCH_SIZE = getBatchSize(validFiles.length);
    const batches: FileUploadItem[][] = [];
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) batches.push(validFiles.slice(i, i + BATCH_SIZE));

    let totalUploaded = 0;
    const allAudioIds: string[] = [];

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const r = await uploadSingleFile(item, promptId, matrixId);
          if (!r.skipped) {
            totalUploaded++;
            setUploadProgress(Math.round((totalUploaded / validFiles.length) * 100));
          }
          return r;
        }),
      );
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value.success && r.value.audioId) allAudioIds.push(r.value.audioId);
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    setUploadProgress(100);
    setUploadPhase("processing");

    if (allAudioIds.length) {
      toast.info(`Iniciando análisis con IA para ${allAudioIds.length} grabaciones...`);
      processCallsBatch(allAudioIds, promptId, matrixId);
    }

    setUploadPhase("done");
    toast.success(`${allAudioIds.length} archivo(s) subido(s) y enviados a análisis`);
    setIsRunning(false);
    onUploadComplete?.();

    setTimeout(() => {
      setFiles([]);
      setCurrentStep(1);
      setUploadPhase("idle");
      onOpenChange(false);
    }, 2800);
  };

  const handleClose = () => {
    if (isRunning) return;
    setFiles([]);
    setCurrentStep(1);
    setSelectedPromptId("default");
    setSelectedMatrixId("default");
    setUploadPhase("idle");
    onOpenChange(false);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const hasMatrixSelected = selectedMatrixId !== "none" && selectedMatrixId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
        else onOpenChange(o);
      }}
    >
      <DialogContent
        className={cn(
          "overflow-hidden flex flex-col p-6 rounded-3xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl transition-all duration-300",
          currentStep === 1 ? "max-w-6xl w-[95vw] h-[88vh] max-h-[760px]" : "max-w-3xl w-full max-h-[88vh]",
        )}
      >
        {/* Header Principal */}
        <DialogHeader className="pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shadow-2xs border border-accent/20">
                <Upload className="w-4.5 h-4.5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  Subir Llamadas & Configuración de Análisis
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Asistente inteligente en 3 pasos para procesar grabaciones de audio
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Alerta de Límite de Cuenta */}
        {!canUpload && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive mt-1">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Límite de transcripción mensual alcanzado</p>
              <p className="mt-0.5 opacity-90">
                Has consumido {hoursUsed.toFixed(2)}h de {maxHours}h. La carga está bloqueada hasta que se amplíe el cupo.
              </p>
            </div>
          </div>
        )}

        {/* Indicador Visual de 3 Pasos */}
        <WizardStepIndicator
          currentStep={currentStep}
          onStepClick={(s) => setCurrentStep(s)}
          isProcessing={isRunning}
        />

        {/* Contenido Dinámico de cada Paso (Sin doble scroll en Paso 1) */}
        <div
          className={cn(
            "flex-1 min-h-0",
            currentStep === 1
              ? "flex flex-col overflow-hidden py-1"
              : "overflow-y-auto py-2 pr-1 scrollbar-thin max-h-[52vh]",
          )}
        >
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <Step1PromptSelect
                key="step-1"
                accountId={accountId}
                userId={user?.id}
                prompts={prompts}
                selectedPromptId={selectedPromptId}
                onSelectPrompt={setSelectedPromptId}
              />
            )}

            {currentStep === 2 && (
              <Step2QualityMatrix
                key="step-2"
                accountId={accountId}
                qualityMatrices={qualityMatrices}
                selectedMatrixId={selectedMatrixId}
                onSelectMatrix={setSelectedMatrixId}
                onNextStep={() => setCurrentStep(3)}
                onCloseWizard={handleClose}
              />
            )}

            {currentStep === 3 && (
              <Step3AudioFiles
                key="step-3"
                files={files}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                onAddFiles={addFiles}
                onRemoveFile={removeFile}
                isRunning={isRunning}
                uploadProgress={uploadProgress}
                uploadPhase={uploadPhase}
                hasMatrixSelected={hasMatrixSelected}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Footer con Navegación del Wizard */}
        <DialogFooter className="pt-3 border-t border-border/60 flex items-center justify-between gap-3 sm:justify-between w-full">
          {/* Botón Izquierdo (Cancelar o Atrás) */}
          <div>
            {currentStep === 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isRunning}
                className="h-9 text-xs font-semibold rounded-xl hover:bg-secondary"
              >
                Cancelar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
                disabled={isRunning}
                className="h-9 gap-1.5 text-xs font-semibold rounded-xl hover:bg-secondary"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Atrás</span>
              </Button>
            )}
          </div>

          {/* Botón Derecho (Continuar o Iniciar Análisis) */}
          <div className="flex items-center gap-2">
            {currentStep < 3 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setCurrentStep((s) => (s < 3 ? ((s + 1) as WizardStep) : s))}
                className="group h-9 px-4 gap-2 text-xs font-bold rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.97]"
              >
                <span>Continuar</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={startUpload}
                disabled={isRunning || pendingCount === 0 || !canUpload}
                className="h-9 gap-2 text-xs font-bold rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/25 transition-all hover:scale-[1.02] active:scale-[0.97]"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Procesando ({uploadProgress}%)</span>
                  </>
                ) : uploadPhase === "done" ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>¡Completado!</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Iniciar Análisis {pendingCount > 0 ? `(${pendingCount})` : ""}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
