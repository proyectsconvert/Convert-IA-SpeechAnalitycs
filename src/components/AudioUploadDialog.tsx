import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, Sparkles, FileAudio, CheckCircle, XCircle, AlertTriangle, Plus, FilePlus, Layers, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRlsErrorMessage } from "@/lib/supabaseErrors";
import { invokeProcessCall } from "@/lib/invokeProcessCall";
import { FileList } from "@/components/upload/FileList";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileUploadItem } from "@/components/AudioUpload";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { useQualityMatrices } from "@/hooks/useQualityMatrix";


const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm", "audio/flac", "audio/aac"];
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".webm", ".flac", ".aac"];
const MAX_SIZE = 100 * 1024 * 1024;

const sanitizeFileName = (name: string): string =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").substring(0, 200);

const getBatchSize = (n: number) => n > 200 ? 100 : n > 100 ? 50 : 20;

const checkDuplicates = async (accountId: string, names: string[]): Promise<Set<string>> => {
  const dups = new Set<string>();
  if (!names.length) return dups;
  const CHUNK = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += CHUNK) chunks.push(names.slice(i, i + CHUNK));
  const results = await Promise.allSettled(
    chunks.map((c) => supabase.from("audio_files").select("file_name").eq("account_id", accountId).in("file_name", c))
  );
  results.forEach((r) => { if (r.status === "fulfilled" && r.value.data) r.value.data.forEach((d) => dups.add(d.file_name.toLowerCase())); });
  return dups;
};

const validateFile = (file: File): string | null => {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) return `Formato no soportado: ${file.type || ext}`;
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
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("default");
  const [selectedMatrixId, setSelectedMatrixId] = useState<string>("default");
  const [isRunning, setIsRunning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [step, setStep] = useState<"select" | "upload">("select");
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  const { data: prompts } = useQuery({
    queryKey: ["prompts-upload", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase.from("prompts").select("id, name, category, status").eq("account_id", accountId).in("status", ["active", "draft"]).order("name");
      return data || [];
    },
    enabled: !!accountId && open,
  });

  const { data: qualityMatrices = [] } = useQualityMatrices(open ? accountId : undefined);

  const saveDraftPrompt = async () => {
    if (!accountId || !user || !draftName.trim()) return;
    setSavingDraft(true);
    try {
      const { data, error } = await supabase.from("prompts").insert({
        account_id: accountId,
        name: draftName.trim(),
        system_instructions: draftInstructions.trim() || "Analiza la llamada y proporciona un resumen detallado.",
        status: "draft" as any,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      toast.success("Prompt borrador creado");
      setSelectedPromptId(data.id);
      setShowDraftForm(false);
      setDraftName("");
      setDraftInstructions("");
      queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
    } catch (err: any) {
      toast.error(err.message || "Error al crear prompt");
    } finally {
      setSavingDraft(false);
    }
  };

  const addFiles = useCallback(async (newFiles: File[]) => {
    if (!accountId) return;
    const validated = newFiles.map((file) => ({ file, id: crypto.randomUUID(), error: validateFile(file) }));
    const validNames = validated.filter((v) => !v.error).map((v) => v.file.name);
    const existingSet = await checkDuplicates(accountId, validNames);
    const items: FileUploadItem[] = validated.map(({ file, id, error }) => {
      if (error) return { file, id, progress: 0, status: "error" as const, error };
      if (existingSet.has(file.name.toLowerCase())) return { file, id, progress: 0, status: "duplicate" as const, error: `Archivo duplicado: ya existe "${file.name}"` };
      return { file, id, progress: 0, status: "pending" as const };
    });
    const seen = new Set<string>();
    for (const item of items) {
      if (item.status !== "pending") continue;
      const key = item.file.name.toLowerCase();
      if (seen.has(key)) { item.status = "duplicate"; item.error = "Duplicado dentro de este lote"; }
      seen.add(key);
    }
    const dupCount = items.filter((i) => i.status === "duplicate").length;
    if (dupCount > 0) toast.warning(`${dupCount} archivo(s) duplicado(s) detectado(s)`);
    setFiles((prev) => [...prev, ...items]);
    setStep("upload");
  }, [accountId]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const d = Array.from(e.dataTransfer.files); if (d.length) addFiles(d); }, [addFiles]);
  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const uploadSingleFile = async (
    item: FileUploadItem,
    promptId: string | null,
    matrixId: string | null
  ): Promise<{ success: boolean; audioId?: string; skipped?: boolean }> => {
    if (item.status === "error" || item.status === "duplicate") return { success: false, skipped: true };
    if (!accountId || !user) return { success: false };
    try {
      const { data: existing } = await supabase.from("audio_files").select("id").eq("account_id", accountId).eq("file_name", item.file.name).limit(1);
      if (existing?.length) { setFiles((p) => p.map((f) => f.id === item.id ? { ...f, status: "duplicate" as const, error: `Ya existe "${item.file.name}"` } : f)); return { success: false, skipped: true }; }
      setFiles((p) => p.map((f) => f.id === item.id ? { ...f, status: "uploading" as const, progress: 15 } : f));
      const safeName = sanitizeFileName(item.file.name);
      const filePath = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try { const { error } = await supabase.storage.from("audio-files").upload(filePath, item.file, { contentType: item.file.type }); if (error) throw error; break; }
        catch (err) { if (attempts === 3) throw err; await new Promise((r) => setTimeout(r, 1000 * attempts)); }
      }
      setFiles((p) => p.map((f) => f.id === item.id ? { ...f, progress: 55 } : f));
      const { data: rec, error: dbErr } = await supabase.from("audio_files").insert({
        account_id: accountId, file_name: item.file.name, file_path: filePath, file_size_bytes: item.file.size,
        mime_type: item.file.type, uploaded_by: user.id, prompt_id: promptId, quality_matrix_id: matrixId, status: "uploaded",
      } as any).select().single();
      if (dbErr) throw dbErr;
      setFiles((p) => p.map((f) => f.id === item.id ? { ...f, progress: 100, status: "done" as const, dbId: rec.id } : f));
      return { success: true, audioId: rec.id };
    } catch (err: any) {
      setFiles((p) => p.map((f) => f.id === item.id ? { ...f, status: "error" as const, error: formatRlsErrorMessage(err) } : f));
      return { success: false };
    }
  };

  const processCallsBatch = async (audioIds: string[], promptId: string | null, matrixId: string | null) => {
    const CONCURRENT = 5;
    const batches: string[][] = [];
    for (let i = 0; i < audioIds.length; i += CONCURRENT) batches.push(audioIds.slice(i, i + CONCURRENT));
    for (let bi = 0; bi < batches.length; bi++) {
      // NO llamar refreshSession() manualmente — el cliente Supabase lo hace automáticamente.
      // Hacerlo manualmente invalida el refresh token en otras pestañas abiertas,
      // causando cierre de sesión inesperado (error 400 en refresh_token).
      await Promise.allSettled(
        batches[bi].map((id) =>
          invokeProcessCall(
            { audio_file_id: id, account_id: accountId, prompt_id: promptId, quality_matrix_id: matrixId },
            { skipRefresh: true }
          )
        )
      );
      if (bi < batches.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }
  };

  const { canUpload, hoursUsed, maxHours } = useAccountLimits();

  const startUpload = async () => {
    if (!accountId || !user) return;
    if (!canUpload) {
      toast.error("Límite de transcripción alcanzado", {
        description: `Has consumido ${hoursUsed.toFixed(2)}h de ${maxHours}h este mes. Solicita ampliación al administrador.`,
        duration: 8000,
      });
      return;
    }
    if (selectedPromptId === "new") { toast.error("Guarda el prompt borrador antes de subir"); return; }
    const promptId = selectedPromptId !== "default" ? selectedPromptId : null;
    const defaultMat = qualityMatrices.find((m) => m.is_default);
    const matrixId = selectedMatrixId !== "default" ? selectedMatrixId : defaultMat?.id || null;
    const validFiles = files.filter((f) => f.status === "pending");
    if (!validFiles.length) { toast.error("No hay archivos válidos"); return; }
    setIsRunning(true); setUploadProgress(0); setUploadPhase("uploading");
    const BATCH_SIZE = getBatchSize(validFiles.length);
    const batches: FileUploadItem[][] = [];
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) batches.push(validFiles.slice(i, i + BATCH_SIZE));
    let totalUploaded = 0; const allAudioIds: string[] = [];
    for (const batch of batches) {
      const results = await Promise.allSettled(batch.map(async (item) => {
        const r = await uploadSingleFile(item, promptId, matrixId);
        if (!r.skipped) { totalUploaded++; setUploadProgress(Math.round((totalUploaded / validFiles.length) * 100)); }
        return r;
      }));
      results.forEach((r) => { if (r.status === "fulfilled" && r.value.success && r.value.audioId) allAudioIds.push(r.value.audioId); });
      await new Promise((r) => setTimeout(r, 500));
    }
    setUploadProgress(100); setUploadPhase("processing");
    if (allAudioIds.length) {
      toast.info(`Procesando ${allAudioIds.length} grabaciones en segundo plano...`);
      processCallsBatch(allAudioIds, promptId, matrixId);
    }
    setUploadPhase("done");
    toast.success(`${allAudioIds.length} archivo(s) subido(s)`);
    setIsRunning(false);
    onUploadComplete?.();
    setTimeout(() => { setFiles([]); setStep("select"); setUploadPhase("idle"); onOpenChange(false); }, 3000);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error" || f.status === "duplicate").length;

  const handleClose = () => {
    if (isRunning) return;
    setFiles([]); setStep("select"); setSelectedPromptId("default"); setSelectedMatrixId("default"); setShowDraftForm(false); setDraftName(""); setDraftInstructions(""); setUploadPhase("idle"); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
              <Upload className="w-4 h-4 text-accent" />
            </div>
            Subir Llamadas
          </DialogTitle>
          <DialogDescription>
            Configura el prompt de análisis y la matriz de calidad para evaluar las grabaciones.
          </DialogDescription>
        </DialogHeader>

        {!canUpload && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Límite de transcripción alcanzado este mes</p>
              <p className="mt-0.5 opacity-90">
                Consumido: {hoursUsed.toFixed(2)}h de {maxHours}h. La carga está bloqueada hasta que el administrador amplíe el cupo.
              </p>
            </div>
          </div>
        )}

        {/* Dual Selection: Prompt + Matriz de Calidad */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-border/70 bg-muted/20">
          {/* Prompt selection */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Prompt de análisis *
            </label>
            <Select value={selectedPromptId} onValueChange={(v) => { setSelectedPromptId(v); if (v !== "new") setShowDraftForm(false); }}>
              <SelectTrigger className="h-11 text-sm bg-background">
                <SelectValue placeholder="Seleccionar prompt..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <span className="flex items-center gap-2 font-medium">Análisis predeterminado</span>
                </SelectItem>
                {prompts?.filter(p => p.status === "active").map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.category ? ` (${p.category})` : ""}
                  </SelectItem>
                ))}
                {prompts?.filter(p => p.status === "draft").length ? (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Borradores</div>
                    {prompts?.filter(p => p.status === "draft").map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">{p.name} <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">borrador</span></span>
                      </SelectItem>
                    ))}
                  </>
                ) : null}
              </SelectContent>
            </Select>

            {!showDraftForm && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full sm:w-auto" onClick={() => { setShowDraftForm(true); setSelectedPromptId("new"); }}>
                <FilePlus className="w-3.5 h-3.5" /> Crear prompt borrador
              </Button>
            )}

            {showDraftForm && (
              <div className="border border-border rounded-lg p-3 space-y-2.5 bg-background/80">
                <p className="text-xs font-semibold text-foreground">Nuevo prompt borrador</p>
                <Input
                  placeholder="Nombre del prompt"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="text-xs h-9"
                />
                <Textarea
                  placeholder="Instrucciones de análisis (opcional)..."
                  value={draftInstructions}
                  onChange={(e) => setDraftInstructions(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveDraftPrompt} disabled={!draftName.trim() || savingDraft} className="gap-1.5 h-8 text-xs">
                    {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowDraftForm(false); setSelectedPromptId("default"); }} className="h-8 text-xs">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Matriz de Calidad selection */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Matriz de Calidad para evaluación
            </label>
            <Select value={selectedMatrixId} onValueChange={(v) => setSelectedMatrixId(v)}>
              <SelectTrigger className="h-11 text-sm bg-background">
                <SelectValue placeholder="Seleccionar matriz de calidad..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <span className="flex items-center gap-2 font-medium">
                    Predeterminada {qualityMatrices.find(m => m.is_default) ? `(${qualityMatrices.find(m => m.is_default)?.label})` : ""}
                  </span>
                </SelectItem>
                {qualityMatrices.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.label || `Matriz v${m.version}`}</span>
                      {m.macroproceso && (
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded capitalize">
                          {m.macroproceso}
                        </span>
                      )}
                      {m.is_default && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {selectedMatrixId === "default"
                ? qualityMatrices.find(m => m.is_default)
                  ? `Se evaluará con la matriz predeterminada de la cuenta: "${qualityMatrices.find(m => m.is_default)?.label}".`
                  : "Se evaluará automáticamente con la matriz activa por defecto."
                : `Se evaluará contra: "${qualityMatrices.find(m => m.id === selectedMatrixId)?.label || ''}".`}
            </p>
          </div>
        </div>

        {/* File selection / Upload area */}
        {step === "select" ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all relative overflow-hidden group",
              isDragging
                ? "border-accent bg-accent/5 scale-[1.005]"
                : "border-border hover:border-accent/50 hover:bg-secondary/30"
            )}
          >
            {/* Animated background effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5" />
            </div>
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8 text-accent" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">Arrastra archivos de audio aquí</p>
              <p className="text-sm text-muted-foreground">o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-2">
                <FileAudio className="w-3.5 h-3.5" />
                MP3, WAV, M4A, OGG, FLAC • Máx 100MB por archivo
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Upload progress */}
            {isRunning && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-accent/5 to-primary/5 border border-accent/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {uploadPhase === "uploading" && <Loader2 className="w-4 h-4 text-accent animate-spin" />}
                    {uploadPhase === "processing" && (
                      <div className="relative w-4 h-4">
                        <div className="absolute inset-0 rounded-full border-2 border-accent animate-ping" />
                        <div className="absolute inset-0.5 rounded-full bg-accent" />
                      </div>
                    )}
                    {uploadPhase === "done" && <CheckCircle className="w-4 h-4 text-accent" />}
                    <span className="text-sm font-medium text-foreground">
                      {uploadPhase === "uploading" ? "Subiendo archivos..." : uploadPhase === "processing" ? "Iniciando procesamiento..." : "¡Completado!"}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-accent">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {doneCount > 0 && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-accent" /> {doneCount} subido(s)</span>}
                  {errorCount > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-destructive" /> {errorCount} error(es)</span>}
                </div>
              </div>
            )}

            {/* File list header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                Archivos ({files.length})
                {pendingCount > 0 && <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{pendingCount} pendientes</span>}
                {errorCount > 0 && <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">{errorCount} errores</span>}
              </span>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRunning}>
                + Agregar más
              </Button>
            </div>

            {/* File list */}
             <div
              className={cn(
                "border border-dashed rounded-xl p-3 max-h-[40vh] overflow-y-auto transition-colors",
                isDragging ? "border-accent bg-accent/5" : "border-border"
              )}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
            >
              <FileList files={files} onRemove={removeFile} />
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(",")} className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isRunning}>Cancelar</Button>
          {pendingCount > 0 && (
            <Button onClick={startUpload} disabled={isRunning} className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isRunning ? "Procesando..." : `Subir y Procesar (${pendingCount})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
