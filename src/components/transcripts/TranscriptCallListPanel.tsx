import type { ReactNode } from "react";
import { format } from "date-fns";
import {
  Phone,
  Search,
  FileSpreadsheet,
  Filter,
  X,
  ChevronRight,
  Calendar,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type TranscriptSortOrder = "newest" | "oldest" | "name_asc" | "name_desc";
export type TranscriptSentimentFilter = "all" | "positive" | "negative" | "neutral";

interface TranscriptCallListPanelProps {
  filteredTranscriptions: unknown[];
  totalCount: number;
  selectedAudioId: string | null;
  onSelectCall: (audioFileId: string) => void;
  callSearchTerm: string;
  setCallSearchTerm: (v: string) => void;
  sortOrder: TranscriptSortOrder;
  setSortOrder: (v: TranscriptSortOrder) => void;
  sentimentFilter: TranscriptSentimentFilter;
  setSentimentFilter: (v: TranscriptSentimentFilter) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  onOpenExport: () => void;
  analysisMap: Map<string, { overall_sentiment?: string; tags?: string[] } | undefined>;
  formatTime: (seconds: number) => string;
  getSentimentColor: (sentiment?: string) => string;
  getSentimentIcon: (sentiment?: string) => ReactNode;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TranscriptCallListPanel({
  filteredTranscriptions,
  totalCount,
  selectedAudioId,
  onSelectCall,
  callSearchTerm,
  setCallSearchTerm,
  sortOrder,
  setSortOrder,
  sentimentFilter,
  setSentimentFilter,
  showFilters,
  setShowFilters,
  onOpenExport,
  analysisMap,
  formatTime,
  getSentimentColor,
  getSentimentIcon,
  currentPage,
  totalPages,
  onPageChange,
}: TranscriptCallListPanelProps) {
  const sortOptions: [TranscriptSortOrder, string][] = [
    ["newest", "Más nuevas"],
    ["oldest", "Más antiguas"],
    ["name_asc", "Nombre A-Z"],
    ["name_desc", "Nombre Z-A"],
  ];
  const sentimentOptions: [TranscriptSentimentFilter, string][] = [
    ["all", "Todos"],
    ["positive", "Positivo"],
    ["negative", "Negativo"],
    ["neutral", "Neutral"],
  ];

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-border bg-card/40">
      <div className="flex-shrink-0 p-3 sm:p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Llamadas</h2>
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * filteredTranscriptions.length + 1}-{Math.min(currentPage * filteredTranscriptions.length, totalCount)} de {totalCount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={onOpenExport}
              title="Exportar todas las llamadas"
            >
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            </Button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showFilters ? "bg-accent text-accent-foreground" : "hover:bg-secondary text-muted-foreground",
              )}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar llamada..."
            className="pl-10 h-9 text-sm bg-background"
            value={callSearchTerm}
            onChange={(e) => setCallSearchTerm(e.target.value)}
          />
          {callSearchTerm && (
            <button
              type="button"
              onClick={() => setCallSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
            >
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-3 animate-fade-in">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Ordenar por</p>
              <div className="grid grid-cols-2 gap-1.5">
                {sortOptions.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSortOrder(val)}
                    className={cn(
                      "text-xs py-1.5 px-2.5 rounded-md transition-colors",
                      sortOrder === val
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Sentimiento</p>
              <div className="flex gap-1.5 flex-wrap">
                {sentimentOptions.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSentimentFilter(val)}
                    className={cn(
                      "text-xs py-1.5 px-2.5 rounded-full transition-colors",
                      sentimentFilter === val
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {filteredTranscriptions.length === 0 ? (
            <div className="py-12 text-center px-2">
              <Search className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin resultados</p>
              <button
                type="button"
                onClick={() => {
                  setCallSearchTerm("");
                  setSentimentFilter("all");
                }}
                className="text-sm text-accent hover:underline mt-2"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            filteredTranscriptions.map((t) => {
              const row = t as { id: string; audio_files: { id?: string; file_name?: string; created_at?: string; duration_seconds?: number } };
              const af = row.audio_files;
              const an = analysisMap.get(af?.id || "");
              const isSelected = af?.id === selectedAudioId;
              const sentiment = an?.overall_sentiment;
              const tags = (an?.tags as string[]) || [];

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onSelectCall(af?.id || "")}
                  className={cn(
                    "w-full text-left rounded-xl border-l-[3px] p-4 transition-all group",
                    isSelected
                      ? "bg-accent/10 border-l-accent shadow-sm ring-1 ring-accent/20"
                      : `${getSentimentColor(sentiment)} border hover:bg-secondary/60 hover:border-l-accent/50`,
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-snug line-clamp-2",
                        isSelected ? "text-accent" : "text-foreground group-hover:text-accent",
                      )}
                    >
                      {af?.file_name || "Sin nombre"}
                    </p>
                    {isSelected && <ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      {af?.created_at ? format(new Date(af.created_at), "dd MMM yy") : "—"}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      {formatTime(af?.duration_seconds || 0)}
                    </span>
                    {sentiment && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          {getSentimentIcon(sentiment)}
                          <span
                            className={
                              sentiment === "positive"
                                ? "text-emerald-400"
                                : sentiment === "negative"
                                  ? "text-red-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {sentiment === "positive" ? "Positivo" : sentiment === "negative" ? "Negativo" : "Neutral"}
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs uppercase tracking-wide font-semibold bg-secondary/80 px-2 py-0.5 rounded-full text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {totalPages > 1 && (
        <div className="p-3 border-t border-border flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Anterior
          </Button>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
