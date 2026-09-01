import { useState, useMemo } from "react";
import {
  User,
  VolumeX,
  Search,
  X,
  Play,
  Clock,
  Mic,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { highlightText } from "./highlightText";
import { cn } from "@/lib/utils";

export interface TranscriptItem {
  id?: string;
  speaker?: string | null;
  start_time?: number;
  startSeconds?: number;
  time?: string;
  text: string;
  sentiment?: string | null;
}

interface TranscriptConversationTabProps {
  segments: TranscriptItem[];
  fullText?: string | null;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  formatTime: (seconds: number) => string;
}

function formatDurationWords(totalSeconds: number): string {
  const secs = Math.round(totalSeconds);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) {
    return `${m} min ${s.toString().padStart(2, "0")} seg`;
  }
  return `${s} segundos`;
}

export function TranscriptConversationTab({
  segments,
  fullText,
  currentTime,
  duration,
  onSeek,
  formatTime,
}: TranscriptConversationTabProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Normalizar segmentos
  const parsedSegments = useMemo(() => {
    if (segments && segments.length > 0) {
      return segments.map((s, idx) => {
        const startSec = s.start_time != null ? Number(s.start_time) : (s.startSeconds ?? 0);
        const rawSpk = (s.speaker || "").toLowerCase().trim();
        const isAgent =
          rawSpk.includes("agente") ||
          rawSpk.includes("asesor") ||
          rawSpk.includes("speaker 1") ||
          rawSpk === "hablante 1" ||
          rawSpk === "1" ||
          rawSpk.includes("agent") ||
          rawSpk.includes("representante");
        
        return {
          id: s.id || `seg-${idx}`,
          speaker: isAgent ? "Asesor" : "Cliente",
          isAgent,
          text: s.text || "",
          startSeconds: startSec,
          formattedTime: s.time || formatTime(startSec),
        };
      });
    }

    if (!fullText) return [];

    // Parsear full_text si no hay segmentos en BD
    const lines = fullText.split("\n").filter((l) => l.trim());
    const parsed: Array<{
      id: string;
      speaker: string;
      isAgent: boolean;
      text: string;
      startSeconds: number;
      formattedTime: string;
    }> = [];

    const SPEAKER_RX =
      /^(?:\[(\d+):(\d{2})\]\s*)?\[?(asesor|agente|cliente|agent|advisor|customer|representante)\]?\s*:\s*(.+)$/i;
    let runningSeconds = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const match = line.match(SPEAKER_RX);
      if (!match) {
        // Línea sin prefijo claro
        parsed.push({
          id: `line-${idx}`,
          speaker: idx % 2 === 0 ? "Asesor" : "Cliente",
          isAgent: idx % 2 === 0,
          text: line.trim(),
          startSeconds: runningSeconds,
          formattedTime: formatTime(runningSeconds),
        });
        runningSeconds += 4;
        continue;
      }

      const minutes = match[1] ? parseInt(match[1], 10) : null;
      const secs = match[2] ? parseInt(match[2], 10) : null;
      const rawSpeaker = match[3].toLowerCase();
      const isAgent = !(rawSpeaker.includes("clien") || rawSpeaker.includes("custom"));
      const startSeconds =
        minutes !== null && secs !== null ? minutes * 60 + secs : runningSeconds;

      parsed.push({
        id: `line-${idx}`,
        speaker: isAgent ? "Asesor" : "Cliente",
        isAgent,
        text: match[4].trim(),
        startSeconds,
        formattedTime: formatTime(startSeconds),
      });

      if (minutes === null) {
        const words = match[4].split(/\s+/).length;
        runningSeconds += Math.max(2, Math.round(words / 2.5));
      } else {
        runningSeconds = startSeconds;
      }
    }

    return parsed;
  }, [segments, fullText, formatTime]);

  // Cálculo de estadísticas de voz y silencios
  const stats = useMemo(() => {
    if (!parsedSegments.length) {
      return {
        asesorSecs: 0,
        clienteSecs: 0,
        asesorPct: 50,
        clientePct: 50,
        silenceCount: 0,
        totalSilenceSecs: 0,
      };
    }

    let asesorSecs = 0;
    let clienteSecs = 0;
    let silenceCount = 0;
    let totalSilenceSecs = 0;

    for (let i = 0; i < parsedSegments.length; i++) {
      const current = parsedSegments[i];
      const next = parsedSegments[i + 1];

      // Duración estimada del turno actual
      let turnDuration = 0;
      if (next && next.startSeconds > current.startSeconds) {
        const span = next.startSeconds - current.startSeconds;
        // Si hay una pausa mayor a 3s entre turnos, se considera silencio prolongado
        const estimatedSpeech = Math.min(span, Math.max(2, current.text.split(/\s+/).length / 2.5));
        turnDuration = estimatedSpeech;

        const gap = span - estimatedSpeech;
        if (gap >= 3) {
          silenceCount++;
          totalSilenceSecs += gap;
        }
      } else {
        turnDuration = Math.max(2, current.text.split(/\s+/).length / 2.5);
      }

      if (current.isAgent) {
        asesorSecs += turnDuration;
      } else {
        clienteSecs += turnDuration;
      }
    }

    const totalSpoken = asesorSecs + clienteSecs;
    const asesorPct = totalSpoken > 0 ? Math.round((asesorSecs / totalSpoken) * 100) : 50;
    const clientePct = 100 - asesorPct;

    return {
      asesorSecs,
      clienteSecs,
      asesorPct,
      clientePct,
      silenceCount,
      totalSilenceSecs: Math.round(totalSilenceSecs),
    };
  }, [parsedSegments]);

  // Filtrado por búsqueda
  const filteredSegments = useMemo(() => {
    if (!searchTerm.trim()) return parsedSegments;
    const term = searchTerm.toLowerCase();
    return parsedSegments.filter((seg) => seg.text.toLowerCase().includes(term));
  }, [parsedSegments, searchTerm]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background/50">
      {/* 1. Cards Superiores (Idénticas a la imagen de referencia) */}
      <div className="p-5 border-b border-border/70 bg-card/40 flex-shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {/* Card Asesor */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-blue-500">Asesor</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {stats.asesorPct}%
            </div>
            <div className="text-xs text-muted-foreground font-medium">del tiempo hablado</div>
            <div className="text-xs font-semibold text-foreground/80 mt-2">
              Tiempo: {formatDurationWords(stats.asesorSecs)}
            </div>
          </div>

          {/* Card Cliente */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-500">Cliente</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {stats.clientePct}%
            </div>
            <div className="text-xs text-muted-foreground font-medium">del tiempo hablado</div>
            <div className="text-xs font-semibold text-foreground/80 mt-2">
              Tiempo: {formatDurationWords(stats.clienteSecs)}
            </div>
          </div>

          {/* Card Silencios */}
          <div className="bg-secondary/60 border border-border/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <VolumeX className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">Silencios</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {stats.silenceCount}
            </div>
            <div className="text-xs text-muted-foreground font-medium">silencios prolongados</div>
            <div className="text-xs font-semibold text-foreground/80 mt-2">
              Duración total: {stats.totalSilenceSecs} segundos
            </div>
          </div>
        </div>

        {/* 2. Buscador */}
        <div className="max-w-6xl mx-auto mt-4 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar en la transcripción..."
            className="pl-10 pr-10 h-10 text-sm bg-background border-border/80 rounded-xl shadow-inner"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Lista de Intervenciones */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-foreground">Transcripción de la llamada</h3>
            {searchTerm && (
              <span className="text-xs text-muted-foreground font-medium">
                {filteredSegments.length} de {parsedSegments.length} intervenciones encontradas
              </span>
            )}
          </div>

          {filteredSegments.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-xl bg-card/30">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? "No se encontraron coincidencias para la búsqueda."
                  : "No hay segmentos de transcripción disponibles para esta llamada."}
              </p>
            </div>
          ) : (
            filteredSegments.map((seg, idx) => {
              const nextSeg = filteredSegments[idx + 1];
              const isCurrentPlaying =
                currentTime >= seg.startSeconds &&
                (nextSeg ? currentTime < nextSeg.startSeconds : currentTime < seg.startSeconds + 15);

              return (
                <div
                  key={seg.id}
                  onClick={() => onSeek(seg.startSeconds)}
                  className={cn(
                    "group flex items-start gap-3 p-3.5 sm:p-4 rounded-xl border transition-all duration-150 cursor-pointer select-text",
                    seg.isAgent
                      ? "bg-card/70 border-border/80 border-l-[4px] border-l-blue-500 hover:bg-blue-500/5 hover:border-l-blue-400"
                      : "bg-card/70 border-border/80 border-l-[4px] border-l-emerald-500 hover:bg-emerald-500/5 hover:border-l-emerald-400",
                    isCurrentPlaying &&
                      (seg.isAgent
                        ? "ring-2 ring-blue-500/50 bg-blue-500/10 shadow-md"
                        : "ring-2 ring-emerald-500/50 bg-emerald-500/10 shadow-md")
                  )}
                >
                  {/* Icono del Hablante */}
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm",
                      seg.isAgent
                        ? "bg-blue-500/15 text-blue-500"
                        : "bg-emerald-500/15 text-emerald-500"
                    )}
                  >
                    <User className="w-4 h-4" />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs font-semibold text-foreground/90 mb-0.5">
                      <span
                        className={cn(
                          "font-bold mr-1.5",
                          seg.isAgent ? "text-blue-500" : "text-emerald-500"
                        )}
                      >
                        {seg.speaker}:
                      </span>
                      <span className="font-normal text-foreground/90 leading-relaxed text-sm">
                        {searchTerm ? highlightText(seg.text, searchTerm) : seg.text}
                      </span>
                    </p>
                  </div>

                  {/* Timestamp Interactivo a la derecha */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(seg.startSeconds);
                    }}
                    className={cn(
                      "text-xs font-mono px-2 py-1 rounded-md transition-colors flex items-center gap-1 flex-shrink-0",
                      isCurrentPlaying
                        ? "bg-accent text-accent-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                    title="Reproducir desde este momento"
                  >
                    <Play className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                    <span>{seg.formattedTime}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
