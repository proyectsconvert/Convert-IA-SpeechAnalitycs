import type { TranscriptViewMode } from "@/hooks/useTranscriptViewPreference";
import { TranscriptsViewModeSelector } from "./TranscriptsViewModeSelector";

interface TranscriptsPageHeaderProps {
  viewMode?: TranscriptViewMode;
  onChangeViewMode?: (mode: TranscriptViewMode) => void;
  isSavingPreference?: boolean;
}

export function TranscriptsPageHeader({
  viewMode,
  onChangeViewMode,
  isSavingPreference,
}: TranscriptsPageHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-border bg-card/30 px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Transcripciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revisa y gestiona las transcripciones de las grabaciones de voz.
        </p>
      </div>

      {viewMode && onChangeViewMode && (
        <div className="flex items-center gap-2">
          <TranscriptsViewModeSelector
            viewMode={viewMode}
            onChangeViewMode={onChangeViewMode}
            isSaving={isSavingPreference}
          />
        </div>
      )}
    </div>
  );
}

