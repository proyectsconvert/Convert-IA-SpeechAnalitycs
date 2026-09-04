import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  Mic,
  Award,
  MessageSquare,
  FileAudio,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TranscriptStickyAudioPlayer } from "./TranscriptStickyAudioPlayer";
import { TranscriptInfoTab } from "./TranscriptInfoTab";
import { TranscriptAiInsightsTab } from "./TranscriptAiInsightsTab";
import { TranscriptConversationTab } from "./TranscriptConversationTab";
import { TranscriptQualityTab } from "./TranscriptQualityTab";
import { TranscriptChatTab } from "./TranscriptChatTab";
import { cn } from "@/lib/utils";

interface TranscriptRow {
  id: string;
  audio_file_id?: string;
  full_text?: string | null;
  audio_files?: {
    id?: string;
    file_name?: string;
    file_path?: string;
    duration_seconds?: number;
    created_at?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
}

interface TranscriptDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAudioId: string | null;
  onSelectAudioId: (id: string) => void;
  allTranscriptions: TranscriptRow[];
}

export function TranscriptDetailModal({
  open,
  onOpenChange,
  selectedAudioId,
  onSelectAudioId,
  allTranscriptions,
}: TranscriptDetailModalProps) {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const { can } = usePermissions();
  const canPlay = can("library", "play") || can("library.calls", "play");
  const canDownload = can("library", "download") || can("library.calls", "download");

  const [activeTab, setActiveTab] = useState<string>("info");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Encontrar la llamada actual y su índice
  const currentIndex = useMemo(() => {
    return allTranscriptions.findIndex(
      (t) => (t.audio_files?.id || t.audio_file_id) === selectedAudioId
    );
  }, [allTranscriptions, selectedAudioId]);

  const currentTranscription = useMemo(() => {
    if (currentIndex >= 0) return allTranscriptions[currentIndex];
    return null;
  }, [allTranscriptions, currentIndex]);

  const audioFile = currentTranscription?.audio_files;

  // Consultar URL firmada de audio
  const { data: audioUrl, isLoading: isLoadingAudio } = useQuery({
    queryKey: ["audio-signed-url", audioFile?.file_path],
    queryFn: async () => {
      if (!audioFile?.file_path) return null;
      const path = String(audioFile.file_path);
      const { data } = await supabase.storage.from("audio-files").createSignedUrl(path, 3600);
      if (data?.signedUrl) return data.signedUrl;
      if (accountId) {
        const { data: d2 } = await supabase.storage
          .from("audio-files")
          .createSignedUrl(`${accountId}/${path}`, 3600);
        if (d2?.signedUrl) return d2.signedUrl;
      }
      return null;
    },
    enabled: !!audioFile?.file_path,
  });

  // Consultar segmentos de la llamada
  const { data: segments } = useQuery({
    queryKey: ["transcription-segments", currentTranscription?.id],
    queryFn: async () => {
      if (!currentTranscription?.id) return [];
      const { data } = await supabase
        .from("transcription_segments")
        .select("*")
        .eq("transcription_id", currentTranscription.id)
        .order("start_time");
      return data || [];
    },
    enabled: !!currentTranscription?.id,
  });

  // Consultar todos los análisis generados para este audio (soporte de selector de prompts)
  const { data: analyses } = useQuery({
    queryKey: ["audio-analyses-all", selectedAudioId],
    queryFn: async () => {
      if (!selectedAudioId) return [];
      const { data } = await supabase
        .from("analyses")
        .select("*, prompts(id, name)")
        .eq("audio_file_id", selectedAudioId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedAudioId,
  });

  // Consultar campos extraídos por reglas
  const { data: callExtractions } = useQuery({
    queryKey: ["audio-call-extractions", selectedAudioId],
    queryFn: async () => {
      if (!selectedAudioId) return [];
      const { data } = await supabase
        .from("call_extractions")
        .select("*, extraction_rules(name)")
        .eq("audio_file_id", selectedAudioId);
      return data || [];
    },
    enabled: !!selectedAudioId,
  });

  // Funciones de control de audio
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSkip = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  }, []);

  const handleChangePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const handleChangeVolume = useCallback((vol: number) => {
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, []);

  // Navegación Anterior / Siguiente
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prev = allTranscriptions[currentIndex - 1];
      const prevId = prev.audio_files?.id || prev.audio_file_id;
      if (prevId) {
        setIsPlaying(false);
        setCurrentTime(0);
        onSelectAudioId(prevId);
      }
    }
  }, [currentIndex, allTranscriptions, onSelectAudioId]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < allTranscriptions.length - 1) {
      const next = allTranscriptions[currentIndex + 1];
      const nextId = next.audio_files?.id || next.audio_file_id;
      if (nextId) {
        setIsPlaying(false);
        setCurrentTime(0);
        onSelectAudioId(nextId);
      }
    }
  }, [currentIndex, allTranscriptions, onSelectAudioId]);

  // Atajos de teclado: ESC para cerrar, Flechas para anterior/siguiente
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Si el foco está en un input o textarea, no capturar atajos de navegación
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === "ArrowLeft" && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight" && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        handleNext();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange, handlePrev, handleNext, togglePlay]);

  // Formateador de tiempo
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalDuration = duration || Number(audioFile?.duration_seconds) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] h-[93vh] p-0 flex flex-col gap-0 border-border bg-background shadow-2xl overflow-hidden rounded-2xl [&>button:last-child]:hidden"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
      >
        <DialogTitle className="sr-only">Workspace de Análisis de Llamada</DialogTitle>
        <DialogDescription className="sr-only">
          Análisis en profundidad, reproducción, transcripción, matriz de calidad y consultas de IA.
        </DialogDescription>

        {/* Elemento de Audio Oculto Persistente */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {/* 1. Cabecera Superior del Workspace */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0 text-accent">
              <FileAudio className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground truncate max-w-[280px] sm:max-w-md md:max-w-lg">
                  {audioFile?.file_name || "Llamada"}
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase bg-secondary/80 hidden sm:inline-flex">
                  {audioFile?.status || "completado"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {audioFile?.created_at ? new Date(audioFile.created_at).toLocaleString() : ""} ·{" "}
                {formatTime(totalDuration)}
              </p>
            </div>
          </div>

          {/* Acciones de Navegación y Cierre */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Navegación Anterior / Siguiente */}
            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border/60">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={currentIndex <= 0}
                onClick={handlePrev}
                title="Llamada anterior (Alt + ←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[11px] font-mono font-semibold px-2 text-muted-foreground select-none">
                {currentIndex >= 0 ? currentIndex + 1 : 1} / {allTranscriptions.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={currentIndex >= allTranscriptions.length - 1}
                onClick={handleNext}
                title="Siguiente llamada (Alt + →)"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={() => onOpenChange(false)}
              title="Cerrar (ESC)"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 2. Reproductor de Audio Fijo (Sticky) */}
        <TranscriptStickyAudioPlayer
          audioUrl={audioUrl}
          audioRef={audioRef}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onSkip={handleSkip}
          onSeek={handleSeek}
          currentTime={currentTime}
          duration={totalDuration}
          fileName={audioFile?.file_name}
          playbackRate={playbackRate}
          onChangePlaybackRate={handleChangePlaybackRate}
          volume={volume}
          onChangeVolume={handleChangeVolume}
          formatTime={formatTime}
          isLoadingAudio={isLoadingAudio}
          canPlay={canPlay}
          canDownload={canDownload}
        />

        {/* 3. Navegación por Submódulos (Tabs) */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-6 border-b border-border bg-card/40 flex-shrink-0">
            <TabsList className="bg-transparent h-12 p-0 gap-6 border-b-0">
              <TabsTrigger
                value="info"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none h-12 px-1 text-xs sm:text-sm font-semibold gap-2 transition-all"
              >
                <Info className="w-4 h-4" />
                <span>1. Información</span>
              </TabsTrigger>

              <TabsTrigger
                value="insights"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none h-12 px-1 text-xs sm:text-sm font-semibold gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>2. Insight IA</span>
              </TabsTrigger>

              <TabsTrigger
                value="transcription"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none h-12 px-1 text-xs sm:text-sm font-semibold gap-2 transition-all"
              >
                <Mic className="w-4 h-4" />
                <span>3. Transcripción</span>
              </TabsTrigger>

              <TabsTrigger
                value="quality"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none h-12 px-1 text-xs sm:text-sm font-semibold gap-2 transition-all"
              >
                <Award className="w-4 h-4" />
                <span>4. Matriz de Calidad</span>
              </TabsTrigger>

              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent rounded-none h-12 px-1 text-xs sm:text-sm font-semibold gap-2 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>5. Consultar IA</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Contenido de cada Pestaña (1 a 5) */}
          <div className="flex-1 min-h-0 relative">
            <TabsContent value="info" className="m-0 h-full">
              <TranscriptInfoTab
                audioFile={audioFile}
                analysis={analyses?.[0]}
                callExtractions={callExtractions || []}
                formatTime={formatTime}
              />
            </TabsContent>

            <TabsContent value="insights" className="m-0 h-full">
              <TranscriptAiInsightsTab analyses={analyses || []} />
            </TabsContent>

            <TabsContent value="transcription" className="m-0 h-full">
              <TranscriptConversationTab
                segments={segments || []}
                fullText={currentTranscription?.full_text}
                currentTime={currentTime}
                duration={totalDuration}
                onSeek={handleSeek}
                formatTime={formatTime}
              />
            </TabsContent>

            <TabsContent value="quality" className="m-0 h-full">
              <TranscriptQualityTab
                audioFileId={selectedAudioId}
                onSeek={handleSeek}
                formatTime={formatTime}
              />
            </TabsContent>

            <TabsContent value="chat" className="m-0 h-full">
              <TranscriptChatTab
                audioFileId={selectedAudioId}
                onSeek={handleSeek}
                formatTime={formatTime}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
