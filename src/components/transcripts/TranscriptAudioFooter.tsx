import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { RefObject } from "react";

interface TranscriptAudioFooterProps {
  audioUrl: string | null | undefined;
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  togglePlay: () => void;
  skip: (secs: number) => void;
  fileName?: string;
  currentTime: number;
  duration: number;
  fileDurationSeconds?: number;
  formatTime: (seconds: number) => string;
  volume: number;
  setVolume: (v: number) => void;
  handleProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  playbackRate: number;
  cycleSpeed: () => void;
}

export function TranscriptAudioFooter({
  audioUrl,
  audioRef,
  isPlaying,
  togglePlay,
  skip,
  fileName,
  currentTime,
  duration,
  fileDurationSeconds,
  formatTime,
  volume,
  setVolume,
  handleProgressClick,
  playbackRate,
  cycleSpeed,
}: TranscriptAudioFooterProps) {
  const totalDur = duration || fileDurationSeconds || 0;
  return (
    <div className="fixed bottom-0 md:left-64 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border z-50">
      <div className="h-1 bg-secondary cursor-pointer" onClick={handleProgressClick}>
        <div
          className="h-full bg-accent transition-all duration-100 ease-linear"
          style={{ width: `${totalDur ? (currentTime / totalDur) * 100 : 0}%` }}
        />
      </div>

      <div className="min-h-[4.5rem] px-4 py-2 flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 min-w-[200px]">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!audioUrl}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-1 fill-current" />}
          </button>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{fileName}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(currentTime)} / {formatTime(totalDur)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-4 overflow-x-auto">
          <button type="button" onClick={() => skip(-10)} className="text-muted-foreground hover:text-foreground transition-transform active:scale-90 p-2">
            <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button type="button" onClick={() => skip(10)} className="text-muted-foreground hover:text-foreground transition-transform active:scale-90 p-2">
            <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          <div className="h-4 w-px bg-border mx-1 md:mx-2" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const v = volume > 0 ? 0 : 1;
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="w-16 md:w-20 accent-accent"
            />
          </div>

          <div className="flex items-center gap-2 ml-1 md:ml-2">
            <button
              type="button"
              onClick={cycleSpeed}
              className="w-10 md:w-12 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground py-1.5 rounded transition-colors text-center"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
