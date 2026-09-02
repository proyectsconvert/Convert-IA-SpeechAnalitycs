import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileAudio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Sparkles,
  Layers,
  BrainCircuit,
  Database,
  FileCheck,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AudioWaveVisualizer } from "./AudioWaveVisualizer";
import { cn } from "@/lib/utils";
import type { FileUploadItem } from "@/components/AudioUpload";

interface Props {
  files: FileUploadItem[];
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  isRunning: boolean;
  uploadProgress: number;
  uploadPhase: "idle" | "uploading" | "processing" | "done";
  hasMatrixSelected: boolean;
}

export function Step3AudioFiles({
  files,
  isDragging,
  setIsDragging,
  onAddFiles,
  onRemoveFile,
  isRunning,
  uploadProgress,
  uploadPhase,
  hasMatrixSelected,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error" || f.status === "duplicate").length;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length) onAddFiles(droppedFiles);
    },
    [onAddFiles, setIsDragging],
  );

  // Etapas del pipeline de procesamiento
  const pipelineSteps = [
    { id: "upload", label: "Subiendo Audio", icon: Upload, active: uploadPhase === "uploading" },
    { id: "transcribe", label: "Transcribiendo", icon: FileAudio, active: uploadPhase === "processing" && uploadProgress < 40 },
    { id: "ai", label: "Analizando con IA", icon: BrainCircuit, active: uploadPhase === "processing" && uploadProgress >= 40 && uploadProgress < 75 },
    ...(hasMatrixSelected
      ? [{ id: "matrix", label: "Evaluando Matriz", icon: Layers, active: uploadPhase === "processing" && uploadProgress >= 75 && uploadProgress < 90 }]
      : []),
    { id: "save", label: "Guardando Resultados", icon: Database, active: uploadPhase === "processing" && uploadProgress >= 90 },
    { id: "done", label: "Completado", icon: CheckCircle2, active: uploadPhase === "done" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-accent" />
            3. Seleccionar y Cargar Llamadas de Audio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sube los archivos de grabación para iniciar la transcripción y el análisis inteligente.
          </p>
        </div>
      </div>

      {/* MONITOR EN VIVO DURANTE EL PROCESAMIENTO */}
      {isRunning || uploadPhase === "done" ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-accent/30 bg-gradient-to-br from-card via-card to-accent/5 p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                {uploadPhase === "done" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {uploadPhase === "uploading"
                    ? "Subiendo archivos al almacenamiento seguro..."
                    : uploadPhase === "processing"
                    ? "Procesando audio y extrayendo insights con IA..."
                    : "¡Procesamiento Completado con Éxito!"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {doneCount} de {files.length} archivo(s) procesados correctamente
                </p>
              </div>
            </div>
            <span className="text-lg font-bold text-accent">{uploadProgress}%</span>
          </div>

          <Progress value={uploadProgress} className="h-2 rounded-full" />

          {/* Visualizador de ondas en tiempo real */}
          {uploadPhase !== "done" && (
            <div className="py-2 bg-secondary/30 rounded-xl border border-border/40">
              <AudioWaveVisualizer isActive={true} barCount={24} />
            </div>
          )}

          {/* Etapas del Pipeline */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1">
            {pipelineSteps.map((st, i) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-xl border text-[11px] font-semibold transition-all",
                    st.active
                      ? "border-accent bg-accent/15 text-accent ring-1 ring-accent/30 scale-102"
                      : uploadPhase === "done" || (uploadPhase === "processing" && i < 2)
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                      : "border-border/50 bg-secondary/20 text-muted-foreground",
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{st.label}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      ) : null}

      {/* DROPZONE / ÁREA DE ARRASTRAR ARCHIVOS */}
      {files.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "group relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden",
            isDragging
              ? "border-accent bg-accent/10 scale-[1.01]"
              : "border-border/80 bg-gradient-to-b from-card/80 to-secondary/20 hover:border-accent/50 hover:bg-secondary/40",
          )}
        >
          {/* Ondas sutiles en background */}
          <div className="mb-3 opacity-60 group-hover:opacity-100 transition-opacity">
            <AudioWaveVisualizer isActive={isDragging} barCount={16} />
          </div>

          <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-2xs">
            <Upload className="w-6 h-6" />
          </div>

          <h3 className="text-sm font-bold text-foreground">
            Arrastra tus archivos de audio aquí
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            o haz clic para explorar en tu equipo
          </p>

          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            {["MP3", "WAV", "M4A", "OGG", "FLAC", "AAC"].map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 rounded-md bg-secondary text-[10px] font-bold text-muted-foreground uppercase"
              >
                {ext}
              </span>
            ))}
            <span className="text-[10px] text-muted-foreground">· Máx 100MB por archivo</span>
          </div>
        </div>
      ) : (
        /* LISTA DE ARCHIVOS CARGADOS */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span>Archivos seleccionados ({files.length})</span>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {pendingCount} listos para procesar
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {errorCount} con observaciones
                </Badge>
              )}
            </div>

            {!isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 gap-1 text-xs font-semibold rounded-xl"
              >
                + Agregar más
              </Button>
            )}
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={cn(
              "space-y-2 max-h-[35vh] overflow-y-auto pr-1 scrollbar-thin p-1 rounded-xl border border-border/50",
              isDragging ? "border-accent bg-accent/5" : "bg-card/40",
            )}
          >
            {files.map((item) => {
              const sizeMb = (item.file.size / (1024 * 1024)).toFixed(1);

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-secondary/40 transition-all text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate max-w-[280px]">
                          {item.file.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{sizeMb} MB</span>
                      </div>

                      {item.status === "uploading" && (
                        <div className="mt-1.5 space-y-1">
                          <Progress value={item.progress} className="h-1 rounded-full" />
                          <span className="text-[10px] text-muted-foreground">
                            Subiendo... {item.progress}%
                          </span>
                        </div>
                      )}

                      {item.error && (
                        <p className="text-[10px] text-destructive mt-0.5">{item.error}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status === "done" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {item.status === "error" && (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    {item.status === "duplicate" && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    {item.status === "uploading" && (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    )}

                    {!isRunning && (item.status === "pending" || item.status === "error" || item.status === "duplicate") && (
                      <button
                        type="button"
                        onClick={() => onRemoveFile(item.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Quitar archivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input de archivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.m4a,.mp4,.ogg,.webm,.flac,.aac"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onAddFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
