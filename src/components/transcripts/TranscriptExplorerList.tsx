import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  FileAudio,
  Calendar,
  Clock,
  User,
  Briefcase,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Award,
  Search,
  Filter,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { useQualityEvaluations } from "@/hooks/useQualityEvaluations";
import type {
  TranscriptSortOrder,
  TranscriptSentimentFilter,
} from "@/components/transcripts/TranscriptCallListPanel";

interface TranscriptExplorerListProps {
  transcriptions: unknown[];
  totalCount: number;
  isLoading: boolean;
  isFetching?: boolean;
  onSelectCall: (audioId: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOrder: TranscriptSortOrder;
  setSortOrder: (order: TranscriptSortOrder) => void;
  sentimentFilter: TranscriptSentimentFilter;
  setSentimentFilter: (sentiment: TranscriptSentimentFilter) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  analysisMap: Map<string, { overall_sentiment?: string; tags?: string[]; sentiment_score?: number } | undefined>;
  onOpenExport: () => void;
  formatTime: (seconds: number) => string;
}

export function TranscriptExplorerList({
  transcriptions,
  totalCount,
  isLoading,
  isFetching = false,
  onSelectCall,
  searchTerm,
  setSearchTerm,
  sortOrder,
  setSortOrder,
  sentimentFilter,
  setSentimentFilter,
  currentPage,
  totalPages,
  onPageChange,
  analysisMap,
  onOpenExport,
  formatTime,
}: TranscriptExplorerListProps) {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const [showFilters, setShowFilters] = useState(false);

  // Evaluaciones de calidad para saber si la llamada fue evaluada
  const { data: allQualityEvals } = useQualityEvaluations(accountId);

  const qualityEvalMap = useMemo(() => {
    const map = new Map<string, typeof allQualityEvals[0]>();
    if (allQualityEvals) {
      allQualityEvals.forEach((e) => {
        if (e.audio_file_id) map.set(e.audio_file_id, e);
      });
    }
    return map;
  }, [allQualityEvals]);

  const sortOptions: [TranscriptSortOrder, string][] = [
    ["newest", "Más nuevas"],
    ["oldest", "Más antiguas"],
    ["name_asc", "Nombre (A - Z)"],
    ["name_desc", "Nombre (Z - A)"],
  ];

  const sentimentOptions: [TranscriptSentimentFilter, string][] = [
    ["all", "Todos"],
    ["positive", "Positivo"],
    ["negative", "Negativo"],
    ["neutral", "Neutral"],
  ];

  const hasActiveFilters = sentimentFilter !== "all" || sortOrder !== "newest";

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      {/* 1. Barra Superior de Búsqueda, Filtros y Acciones (Fija / Sticky) */}
      <div className="sticky top-0 z-20 px-6 py-3.5 border-b border-border bg-background/95 backdrop-blur-md shadow-2xs space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Contador y Título */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <FileAudio className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Explorador de Grabaciones
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {totalCount > 0
                  ? `Mostrando ${(currentPage - 1) * transcriptions.length + 1} - ${Math.min(
                      currentPage * transcriptions.length,
                      totalCount
                    )} de ${totalCount} grabaciones`
                  : "0 grabaciones encontradas"}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8.5 gap-1.5 text-xs font-semibold rounded-xl"
              onClick={onOpenExport}
              title="Exportar listado a Excel / CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>

            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              className="h-8.5 gap-1.5 text-xs font-semibold rounded-xl"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              )}
            </Button>
          </div>
        </div>

        {/* Campo de Búsqueda con indicador de carga suave (cero parpadeo y espacio correcto) */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre de archivo, asesor, campaña o texto transcrito..."
            className="pl-10 pr-10 h-9 text-xs rounded-xl bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-accent"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
            ) : searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Panel Desplegable de Filtros */}
        {showFilters && (
          <div className="p-3.5 bg-secondary/30 border border-border/70 rounded-2xl space-y-3 animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Ordenamiento */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Ordenar por
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {sortOptions.map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSortOrder(val)}
                      className={cn(
                        "text-xs py-1 px-2.5 rounded-lg font-medium transition-all",
                        sortOrder === val
                          ? "bg-accent text-accent-foreground shadow-2xs font-bold"
                          : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro de Sentimiento */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-accent" /> Sentimiento
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {sentimentOptions.map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSentimentFilter(val)}
                      className={cn(
                        "text-xs py-1 px-2.5 rounded-lg font-medium transition-all",
                        sentimentFilter === val
                          ? "bg-accent text-accent-foreground shadow-2xs font-bold"
                          : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Grid de Grabaciones: Ancho completo + Mayor cantidad de columnas */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-4 w-full">
          {/* Carga Inicial Únicamente (Evita parpadeo durante búsquedas) */}
          {isLoading && (!transcriptions || transcriptions.length === 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4 border border-border/70 rounded-2xl bg-card/60 space-y-2.5">
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                  <Skeleton className="h-3 w-1/2 rounded-md" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="py-20 text-center border border-dashed rounded-2xl bg-card/30 max-w-md mx-auto">
              <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">Sin grabaciones</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto mb-4">
                No se encontraron grabaciones con los criterios de búsqueda seleccionados.
              </p>
              {(searchTerm || sentimentFilter !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSentimentFilter("all");
                  }}
                  className="rounded-xl text-xs"
                >
                  Restablecer filtros
                </Button>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 transition-opacity duration-150",
                isFetching ? "opacity-80" : "opacity-100"
              )}
            >
              {transcriptions.map((item) => {
                const row = item as {
                  id: string;
                  audio_files?: {
                    id?: string;
                    file_name?: string;
                    created_at?: string;
                    duration_seconds?: number;
                    status?: string;
                    metadata?: Record<string, unknown>;
                  };
                };

                const af = row.audio_files;
                const audioId = af?.id || row.id;
                const metadata = (af?.metadata || {}) as Record<string, unknown>;
                const an = analysisMap.get(audioId);
                const qualityEval = qualityEvalMap.get(audioId);

                const agentName =
                  (typeof metadata.agent === "string" ? metadata.agent : undefined) ||
                  (typeof metadata.agent_name === "string" ? metadata.agent_name : undefined) ||
                  (af?.file_name && String(af.file_name).includes("-")
                    ? String(af.file_name).split("-")[0].trim()
                    : null);

                const campaign = metadata.campaign as string | undefined;
                const sentiment = an?.overall_sentiment;
                const score = an?.sentiment_score != null ? Math.round(Number(an.sentiment_score) * 100) : null;
                const durationSeconds = Number(af?.duration_seconds) || 0;

                return (
                  <div
                    key={row.id}
                    onClick={() => onSelectCall(audioId)}
                    className="group relative bg-card hover:bg-card/90 border border-border/80 hover:border-accent/40 rounded-2xl p-3.5 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between gap-3 hover:-translate-y-0.5"
                  >
                    {/* Header: Nombre y flecha */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                            <FileAudio className="w-3.5 h-3.5" />
                          </div>
                          <h3 className="text-xs font-bold text-foreground leading-snug truncate group-hover:text-accent transition-colors" title={af?.file_name || "Grabación"}>
                            {af?.file_name || "Grabación de audio"}
                          </h3>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
                      </div>

                      {/* Fecha y Duración */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          {af?.created_at
                            ? format(new Date(af.created_at), "dd/MM/yyyy · HH:mm")
                            : "—"}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {formatTime(durationSeconds)}
                        </span>
                      </div>

                      {/* Asesor y Campaña */}
                      {(agentName || campaign) && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5 text-[11px] text-foreground/80 flex-wrap">
                          {agentName && (
                            <span className="inline-flex items-center gap-1 bg-secondary/80 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              <User className="w-2.5 h-2.5 text-blue-400" />
                              <span className="truncate max-w-[110px]">{agentName}</span>
                            </span>
                          )}
                          {campaign && (
                            <span className="inline-flex items-center gap-1 bg-secondary/80 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              <Briefcase className="w-2.5 h-2.5 text-purple-400" />
                              <span className="truncate max-w-[100px]">{campaign}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer: Badges de Sentimiento, Score y Matriz de Calidad */}
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-1.5 flex-wrap text-xs">
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Sentimiento */}
                        {sentiment ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] capitalize font-semibold px-1.5 py-0.2",
                              sentiment === "positive"
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                : sentiment === "negative"
                                  ? "bg-red-500/10 text-red-500 border-red-500/30"
                                  : "bg-secondary text-muted-foreground border-border/60"
                            )}
                          >
                            {sentiment === "positive" ? (
                              <TrendingUp className="w-2.5 h-2.5 mr-1" />
                            ) : sentiment === "negative" ? (
                              <TrendingDown className="w-2.5 h-2.5 mr-1" />
                            ) : (
                              <Minus className="w-2.5 h-2.5 mr-1" />
                            )}
                            {sentiment}
                          </Badge>
                        ) : (
                          <span className="text-[9px] text-muted-foreground">Sin análisis</span>
                        )}

                        {/* Score IA */}
                        {score !== null && (
                          <span className="text-[9px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.2 rounded border border-primary/20">
                            Score: {score}%
                          </span>
                        )}
                      </div>

                      {/* Indicador de Matriz de Calidad */}
                      {qualityEval ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-mono font-semibold px-1.5 py-0.2 gap-1",
                            qualityEval.has_critical_error
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : qualityEval.percent_score >= 70
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          )}
                          title={`Calidad: ${Math.round(qualityEval.percent_score)}%`}
                        >
                          <Award className="w-2.5 h-2.5" />
                          <span>Calidad {Math.round(qualityEval.percent_score)}%</span>
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                          <Award className="w-2.5 h-2.5 opacity-40" />
                          <span>Sin matriz</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 3. Paginación Inferior */}
      {totalPages > 1 && (
        <div className="px-6 py-2.5 border-t border-border bg-card/60 flex items-center justify-between gap-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7.5 text-xs font-semibold rounded-lg"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Anterior
          </Button>

          <span className="text-xs font-mono font-semibold text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-7.5 text-xs font-semibold rounded-lg"
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
