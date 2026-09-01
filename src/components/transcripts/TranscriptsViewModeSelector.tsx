import { Columns2, LayoutGrid, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptViewMode } from "@/hooks/useTranscriptViewPreference";

interface TranscriptsViewModeSelectorProps {
  viewMode: TranscriptViewMode;
  onChangeViewMode: (mode: TranscriptViewMode) => void;
  isSaving?: boolean;
}

export function TranscriptsViewModeSelector({
  viewMode,
  onChangeViewMode,
  isSaving = false,
}: TranscriptsViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border/80 shadow-inner">
      <button
        type="button"
        onClick={() => onChangeViewMode("classic")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
          viewMode === "classic"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground hover:bg-background/40"
        )}
        title="Vista Clásica con paneles redimensionables"
      >
        <Columns2 className="w-3.5 h-3.5" />
        <span>Vista Clásica</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeViewMode("detail")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
          viewMode === "detail"
            ? "bg-accent text-accent-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/40"
        )}
        title="Vista Detalle como explorador y workspace modal"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span>Vista Detalle</span>
        {isSaving && <Loader2 className="w-3 h-3 animate-spin ml-0.5 opacity-70" />}
      </button>
    </div>
  );
}
