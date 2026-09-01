import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Download,
  Gauge,
  FileAudio,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface TranscriptStickyAudioPlayerProps {
  audioUrl: string | null | undefined;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  currentTime: number;
  duration: number;
  fileName?: string;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  volume: number;
  onChangeVolume: (volume: number) => void;
  formatTime: (seconds: number) => string;
  isLoadingAudio?: boolean;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function TranscriptStickyAudioPlayer({
  audioUrl,
  audioRef,
  isPlaying,
  onTogglePlay,
  onSkip,
  onSeek,
  currentTime,
  duration,
  fileName,
  playbackRate,
  onChangePlaybackRate,
  volume,
  onChangeVolume,
  formatTime,
  isLoadingAudio = false,
}: TranscriptStickyAudioPlayerProps) {
  const [prevVolume, setPrevVolume] = useState(1);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const totalDuration = duration || 0;
  const progressPercent = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  const handleMuteToggle = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      onChangeVolume(0);
    } else {
      onChangeVolume(prevVolume || 1);
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || totalDuration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pos * totalDuration);
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || totalDuration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * totalDuration);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverTime(null);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = fileName || "audio-grabacion.mp3";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="sticky top-0 z-30 w-full bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
      {/* Interactive Progress Bar */}
      <div
        ref={progressBarRef}
        onClick={handleProgressBarClick}
        onMouseMove={handleProgressBarMouseMove}
        onMouseLeave={handleProgressBarMouseLeave}
        className="group relative h-2.5 bg-secondary/80 hover:h-3.5 transition-all duration-150 cursor-pointer w-full"
      >
        {/* Fill */}
        <div
          className="h-full bg-gradient-to-r from-accent to-accent/80 transition-all duration-75 relative"
          style={{ width: `${progressPercent}%` }}
        >
          {/* Scrubber handle */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform duration-150" />
        </div>

        {/* Hover timestamp tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute bottom-full mb-1.5 -translate-x-1/2 px-2 py-0.5 rounded bg-popover text-popover-foreground text-[10px] font-mono shadow-md border border-border pointer-events-none"
            style={{ left: `${hoverPosition}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Playback Controls & Info */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            size="icon"
            onClick={onTogglePlay}
            disabled={!audioUrl || isLoadingAudio}
            className={cn(
              "w-10 h-10 rounded-full flex-shrink-0 shadow-sm transition-transform active:scale-95",
              isPlaying
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title={isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {isLoadingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 ml-0.5 fill-current" />
            )}
          </Button>

          {/* Skip buttons */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onSkip(-10)}
              title="Retroceder 10 segundos"
              disabled={!audioUrl}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onSkip(10)}
              title="Adelantar 10 segundos"
              disabled={!audioUrl}
            >
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Time & File info */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-foreground">
                {formatTime(currentTime)}
              </span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-mono text-muted-foreground">
                {formatTime(totalDuration)}
              </span>
            </div>
            {fileName && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-[320px]">
                {fileName}
              </span>
            )}
          </div>
        </div>

        {/* Right: Volume, Speed & Download Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap ml-auto">
          {/* Volume Control */}
          <div className="flex items-center gap-2 bg-secondary/40 px-2.5 py-1 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={handleMuteToggle}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={volume === 0 ? "Activar sonido" : "Silenciar"}
            >
              {volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="w-16 sm:w-20">
              <Slider
                value={[volume * 100]}
                min={0}
                max={100}
                step={1}
                onValueChange={(val) => onChangeVolume(val[0] / 100)}
                className="cursor-pointer"
              />
            </div>
          </div>

          {/* Speed Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs font-medium gap-1.5 bg-secondary/40 border-border/60"
                title="Velocidad de reproducción"
              >
                <Gauge className="w-3.5 h-3.5 text-accent" />
                <span className="font-mono">{playbackRate}x</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {SPEED_OPTIONS.map((rate) => (
                <DropdownMenuItem
                  key={rate}
                  onClick={() => onChangePlaybackRate(rate)}
                  className={cn(
                    "text-xs flex items-center justify-between font-mono",
                    playbackRate === rate && "font-bold text-accent bg-accent/10"
                  )}
                >
                  <span>{rate}x</span>
                  {playbackRate === rate && <span className="text-[10px]">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Download button */}
          {audioUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs gap-1.5"
              onClick={handleDownload}
              title="Descargar grabación"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Descargar</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
