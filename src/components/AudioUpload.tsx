import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatRlsErrorMessage } from "@/lib/supabaseErrors";
import { invokeProcessCall } from "@/lib/invokeProcessCall";
import { PromptSelector } from "@/components/upload/PromptSelector";
import { FileList } from "@/components/upload/FileList";
import { DropZone } from "@/components/upload/DropZone";
import { useAccountLimits } from "@/hooks/useAccountLimits";

const ALLOWED_TYPES = [
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a",
  "audio/ogg", "audio/webm", "audio/flac", "audio/aac",
];
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".webm", ".flac", ".aac"];
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export interface FileUploadItem {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "processing" | "done" | "error" | "duplicate";
  error?: string;
  dbId?: string;
}

interface AudioUploadProps {
  onUploadComplete?: () => void;
}

interface BatchInfo {
  currentBatch: number;
  totalBatches: number;
  uploadedFiles: number;
  totalFiles: number;
  batchSize: number;
}

const sanitizeFileName = (name: string): string => {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 200);
};

const getBatchSize = (totalFiles: number): number => {
  if (totalFiles > 200) return 100;
  if (totalFiles > 100) return 50;
  return 20;
};

const getBatchLabel = (batchSize: number): string => {
  if (batchSize === 100) return "🚀 Modo ultra-masivo: lotes de 100";
  if (batchSize === 50) return "⚡ Modo masivo: lotes de 50";
  return "📦 Modo estándar: lotes de 20";
};

// Check duplicates in batch with chunking for >100 titles
const checkDuplicates = async (accountId: string, names: string[]): Promise<Set<string>> => {
  const duplicates = new Set<string>();
  if (!names.length) return duplicates;
  const CHUNK = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += CHUNK) chunks.push(names.slice(i, i + CHUNK));
  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      supabase.from("audio_files").select("file_name").eq("account_id", accountId).in("file_name", chunk)
    )
  );
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value.data) {
      r.value.data.forEach((d) => duplicates.add(d.file_name.toLowerCase()));
    }
  });
  return duplicates;
};

const validateFile = (file: File): string | null => {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return `Formato no soportado: ${file.type || ext}`;
  }
  if (file.size > MAX_SIZE) return `Archivo demasiado grande (máx ${MAX_SIZE / 1024 / 1024}MB)`;
  if (file.size < 1000) return "Archivo demasiado pequeño (mín 1KB)";
  return null;
};

export function AudioUpload({ onUploadComplete }: AudioUploadProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("none");
  const [isRunning, setIsRunning] = useState(false);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { canUpload, hoursUsed, maxHours, hoursRemaining } = useAccountLimits();
  const { currentAccount } = useAccount();

  const addFiles = useCallback(async (newFiles: File[]) => {
    const accountId = currentAccount?.account_id;
    if (!accountId) return;

    // 1. Validate format/size
    const validated = newFiles.map((file) => {
      const error = validateFile(file);
      return { file, id: crypto.randomUUID(), error };
    });

    // 2. Batch duplicate check
    const validNames = validated.filter((v) => !v.error).map((v) => v.file.name);
    const existingSet = await checkDuplicates(accountId, validNames);

    // 3. Build items
    const items: FileUploadItem[] = validated.map(({ file, id, error }) => {
      if (error) return { file, id, progress: 0, status: "error" as const, error };
      if (existingSet.has(file.name.toLowerCase())) {
        return { file, id, progress: 0, status: "duplicate" as const, error: `Archivo duplicado: ya existe "${file.name}"` };
      }
      return { file, id, progress: 0, status: "pending" as const };
    });

    // 4. Check duplicates within batch
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
    if (dupCount > 0) {
      toast.warning(`${dupCount} archivo(s) duplicado(s) detectado(s)`, {
        description: "No se subirán grabaciones que ya existen",
      });
    }

    setFiles((prev) => [...prev, ...items]);
    setIsOpen(true);
  }, [currentAccount?.account_id]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // Upload single file with retries
  const uploadSingleFile = async (
    item: FileUploadItem,
    accountId: string,
    userId: string,
    promptId: string | null
  ): Promise<{ success: boolean; audioId?: string; skipped?: boolean }> => {
    if (item.status === "error" || item.status === "duplicate") {
      return { success: false, skipped: true };
    }

    try {
      // Re-verify duplicate (race condition protection)
      const { data: existing } = await supabase
        .from("audio_files")
        .select("id")
        .eq("account_id", accountId)
        .eq("file_name", item.file.name)
        .limit(1);
      if (existing && existing.length > 0) {
        setFiles((prev) => prev.map((f) =>
          f.id === item.id ? { ...f, status: "duplicate" as const, error: `Ya existe "${item.file.name}"` } : f
        ));
        return { success: false, skipped: true };
      }

      setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "uploading" as const, progress: 15 } : f));

      const safeName = sanitizeFileName(item.file.name);
      const filePath = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;

      // Upload with retries
      let uploadAttempts = 0;
      while (uploadAttempts < 3) {
        uploadAttempts++;
        try {
          const { error } = await supabase.storage
            .from("audio-files")
            .upload(filePath, item.file, { contentType: item.file.type });
          if (error) throw error;
          break;
        } catch (err) {
          if (uploadAttempts === 3) throw err;
          await new Promise((r) => setTimeout(r, 1000 * uploadAttempts));
        }
      }

      setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, progress: 55 } : f));

      // Create DB record
      const { data: audioRecord, error: dbErr } = await (supabase
        .from("audio_files")
        .insert({
          account_id: accountId,
          file_name: item.file.name,
          file_path: filePath,
          file_size_bytes: item.file.size,
          mime_type: item.file.type,
          uploaded_by: userId,
          prompt_id: promptId,
          status: "uploaded",
        } as any)
        .select()
        .single());
      if (dbErr) throw dbErr;

      setFiles((prev) => prev.map((f) =>
        f.id === item.id ? { ...f, progress: 100, status: "done" as const, dbId: audioRecord.id } : f
      ));

      return { success: true, audioId: audioRecord.id };
    } catch (err: any) {
      setFiles((prev) => prev.map((f) =>
        f.id === item.id ? { ...f, status: "error" as const, error: formatRlsErrorMessage(err) } : f
      ));
      return { success: false };
    }
  };

  // Process calls in parallel batches of 20
  const processCallsBatch = async (audioIds: string[], accountId: string, promptId: string | null) => {
    const CONCURRENT = 20;
    const batches: string[][] = [];
    for (let i = 0; i < audioIds.length; i += CONCURRENT) {
      batches.push(audioIds.slice(i, i + CONCURRENT));
    }

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      console.log(`🔄 Procesando lote ${bi + 1}/${batches.length} (${batch.length} llamadas en paralelo)`);

      // NO llamar refreshSession() — invalida tokens en otras pestañas
      // El cliente Supabase refresca tokens automáticamente cuando es necesario
      await Promise.allSettled(
        batch.map((audioId) =>
          invokeProcessCall(
            { audio_file_id: audioId, account_id: accountId, prompt_id: promptId },
            { skipRefresh: true }
          )
        )
      );

      if (bi < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  const startBatchUpload = async () => {
    if (!currentAccount || !user) {
      toast.error("Selecciona una cuenta primero");
      return;
    }

    if (!canUpload) {
      toast.error("Límite de transcripción alcanzado", {
        description: `Has consumido ${hoursUsed.toFixed(2)}h de ${maxHours}h disponibles este mes. Solicita más horas al administrador.`,
        duration: 8000,
      });
      return;
    }

    const accountId = currentAccount.account_id;
    const promptId = selectedPromptId !== "none" ? selectedPromptId : null;
    const validFiles = files.filter((f) => f.status === "pending");

    if (validFiles.length === 0) {
      toast.error("No hay archivos válidos para subir");
      return;
    }

    setIsRunning(true);
    setUploadProgress(0);
    setBatchInfo(null);

    const BATCH_SIZE = getBatchSize(validFiles.length);
    const batches: FileUploadItem[][] = [];
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
      batches.push(validFiles.slice(i, i + BATCH_SIZE));
    }

    toast.info(`Iniciando carga: ${validFiles.length} archivos`, {
      description: `${getBatchLabel(BATCH_SIZE)}. Subida paralela activa.`,
      duration: 8000,
    });

    let totalUploaded = 0;
    const allAudioIds: string[] = [];
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      setBatchInfo({
        currentBatch: batchIndex + 1,
        totalBatches: batches.length,
        uploadedFiles: totalUploaded,
        totalFiles: validFiles.length,
        batchSize: BATCH_SIZE,
      });

      // Upload batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const result = await uploadSingleFile(item, accountId, user.id, promptId);
          if (!result.skipped) {
            totalUploaded++;
            setUploadProgress(Math.round((totalUploaded / validFiles.length) * 100));
            setBatchInfo((prev) => prev ? { ...prev, uploadedFiles: totalUploaded } : prev);
          }
          return result;
        })
      );

      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value.success && r.value.audioId) {
          allAudioIds.push(r.value.audioId);
        } else if (r.status === "fulfilled" && !r.value.skipped && !r.value.success) {
          totalFailed++;
        } else if (r.status === "rejected") {
          totalFailed++;
        }
      });

      // Pause between upload batches
      if (batchIndex < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setUploadProgress(100);

    // Now trigger processing for all uploaded files in batches
    if (allAudioIds.length > 0) {
      toast.info(`Iniciando procesamiento de ${allAudioIds.length} grabaciones en segundo plano...`);
      // Fire and forget — processing happens in background
      processCallsBatch(allAudioIds, accountId, promptId).then(() => {
        console.log(`✅ Procesamiento iniciado para ${allAudioIds.length} llamadas`);
      });
    }

    if (allAudioIds.length > 0) {
      toast.success(`${allAudioIds.length} archivo(s) subido(s) exitosamente`, {
        description: "El análisis se procesará automáticamente en segundo plano.",
        duration: 10000,
      });
    }
    if (totalFailed > 0) {
      toast.warning(`${totalFailed} archivo(s) con errores durante la subida`);
    }

    setIsRunning(false);
    setBatchInfo(null);
    onUploadComplete?.();

    // Clean up completed files after delay
    setTimeout(() => {
      setFiles((prev) => prev.filter((f) => f.status === "error" || f.status === "duplicate"));
      if (files.every((f) => f.status === "done" || f.status === "error" || f.status === "duplicate")) {
        setIsOpen(false);
      }
    }, 8000);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;

  if (!isOpen) {
    return (
      <div className="space-y-4">
        <PromptSelector
          accountId={currentAccount?.account_id}
          selectedPromptId={selectedPromptId}
          onSelect={setSelectedPromptId}
        />
        {!canUpload && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Límite de transcripción alcanzado</p>
              <p className="mt-0.5 opacity-90">
                {hoursUsed.toFixed(2)}h de {maxHours}h consumidas este mes. La carga está bloqueada hasta que el administrador amplíe el límite.
              </p>
            </div>
          </div>
        )}
        <div className={cn(!canUpload && "pointer-events-none opacity-50")}>
          <DropZone
            isDragging={isDragging}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => canUpload && fileInputRef.current?.click()}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <PromptSelector
        accountId={currentAccount?.account_id}
        selectedPromptId={selectedPromptId}
        onSelect={setSelectedPromptId}
      />

      {/* Batch progress */}
      {isRunning && (
        <div className="p-4 border rounded-lg bg-secondary/10 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">Subiendo archivos en paralelo</p>
            <span className="text-xs font-medium text-primary">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
          {batchInfo && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{batchInfo.uploadedFiles} / {batchInfo.totalFiles}</span> archivos subidos — Lote{" "}
                <span className="font-medium text-foreground">{batchInfo.currentBatch} de {batchInfo.totalBatches}</span>
              </p>
              <p className="text-xs text-muted-foreground">{getBatchLabel(batchInfo.batchSize)} — subida paralela activa</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Archivos ({files.length})
          {pendingCount > 0 && <span className="ml-1 text-xs text-muted-foreground font-normal">• {pendingCount} pendientes</span>}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRunning}>
            + Agregar más
          </Button>
          {pendingCount > 0 && (
            <Button size="sm" onClick={startBatchUpload} disabled={isRunning}>
              {isRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              {isRunning ? "Procesando..." : `Subir y Procesar (${pendingCount})`}
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "border border-dashed rounded-lg p-3 transition-colors max-h-64 overflow-y-auto",
          isDragging ? "border-accent bg-accent/5" : "border-border"
        )}
      >
        <FileList files={files} onRemove={removeFile} />
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setFiles([]); setIsOpen(false); }} disabled={isRunning}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
