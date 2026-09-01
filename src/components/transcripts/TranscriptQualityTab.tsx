import { useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  Award,
  ShieldAlert,
  Layers,
  Sparkles,
  FileCheck,
  Play,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useEvaluationsForSource,
  useEvaluationDetail,
} from "@/hooks/useQualityEvaluations";
import type { EvalStatus } from "@/components/analizador-total/quality/types";
import { cn } from "@/lib/utils";

interface TranscriptQualityTabProps {
  audioFileId: string | null | undefined;
  onSeek: (seconds: number) => void;
  formatTime: (seconds: number) => string;
}

export function TranscriptQualityTab({
  audioFileId,
  onSeek,
  formatTime,
}: TranscriptQualityTabProps) {
  const { data: evaluation, isLoading: evalLoading } = useEvaluationsForSource({
    audioFileId: audioFileId || null,
  });

  const { data: items, isLoading: itemsLoading } = useEvaluationDetail(
    evaluation?.id || null
  );

  const isLoading = evalLoading || itemsLoading;

  // Extraer marcas de tiempo de textos como "[01:25]" o "(02:30)" o "01:25"
  const parseTimestampSeconds = (text: string | null | undefined): number | null => {
    if (!text) return null;
    const match = text.match(/(?:\[|\(|\b)(\d{1,2}):(\d{2})(?:\]|\)|\b)/);
    if (!match) return null;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    return minutes * 60 + seconds;
  };

  // Resumen de métricas
  const metrics = useMemo(() => {
    if (!items || !items.length) {
      return {
        total: 0,
        cumple: 0,
        noCumple: 0,
        na: 0,
        critico: 0,
      };
    }

    let cumple = 0;
    let noCumple = 0;
    let na = 0;
    let critico = 0;

    for (const item of items) {
      if (item.status === "cumple") cumple++;
      else if (item.status === "no_cumple") noCumple++;
      else if (item.status === "critico") critico++;
      else na++;
    }

    return {
      total: items.length,
      cumple,
      noCumple,
      na,
      critico,
    };
  }, [items]);

  // Agrupar items por categoría / sección
  const groupedItems = useMemo(() => {
    if (!items || !items.length) return {};
    const map: Record<string, typeof items> = {};
    for (const item of items) {
      const section = item.section_name || "Criterios Generales";
      if (!map[section]) map[section] = [];
      map[section].push(item);
    }
    return map;
  }, [items]);

  const getStatusBadge = (status: EvalStatus) => {
    switch (status) {
      case "cumple":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 text-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Cumple</span>
          </Badge>
        );
      case "no_cumple":
        return (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-400 border-red-500/30 gap-1 text-xs"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>No cumple</span>
          </Badge>
        );
      case "critico":
        return (
          <Badge
            variant="outline"
            className="bg-red-600/20 text-red-400 border-red-600/50 gap-1 text-xs font-bold animate-pulse"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Error Crítico</span>
          </Badge>
        );
      case "na":
      default:
        return (
          <Badge
            variant="outline"
            className="bg-secondary text-muted-foreground border-border gap-1 text-xs"
          >
            <MinusCircle className="w-3.5 h-3.5" />
            <span>No aplica</span>
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <Loader2 className="w-8 h-8 text-accent animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Cargando evaluación de calidad...</p>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Award className="w-8 h-8 text-primary/60" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Sin evaluación de calidad</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Esta llamada aún no ha sido evaluada contra la Matriz de Calidad activa. Puedes ejecutar la evaluación automática desde el módulo Analizador Total.
        </p>
      </div>
    );
  }

  const scorePct = evaluation.percent_score != null ? Math.round(evaluation.percent_score) : 0;
  const isPassed = scorePct >= 70 && !evaluation.has_critical_error;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Alerta de Error Crítico si aplica */}
        {evaluation.has_critical_error && (
          <div className="bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4 flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-400">Error Crítico Detectado</p>
              <p className="text-xs text-foreground/80">
                La llamada presenta un fallo crítico que anula el cumplimiento del protocolo.
              </p>
            </div>
          </div>
        )}

        {/* 1. Métricas Superiores */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Score Total */}
          <div className="bg-card/70 border border-border rounded-xl p-3.5 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Puntaje
            </span>
            <div className="text-lg font-bold text-foreground font-mono">
              {evaluation.total_score} / {evaluation.max_total_score}
            </div>
          </div>

          {/* Porcentaje Cumplimiento */}
          <div
            className={cn(
              "border rounded-xl p-3.5 shadow-sm space-y-1",
              isPassed
                ? "bg-emerald-500/5 border-emerald-500/30"
                : "bg-red-500/5 border-red-500/30"
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Cumplimiento
            </span>
            <div
              className={cn(
                "text-xl font-extrabold font-mono",
                isPassed ? "text-emerald-400" : "text-red-400"
              )}
            >
              {scorePct}%
            </div>
          </div>

          {/* Criterios Evaluados */}
          <div className="bg-card/70 border border-border rounded-xl p-3.5 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Criterios
            </span>
            <div className="text-lg font-bold text-foreground font-mono">{metrics.total}</div>
          </div>

          {/* Cumplidos */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Cumplidos
            </span>
            <div className="text-lg font-bold text-emerald-400 font-mono">{metrics.cumple}</div>
          </div>

          {/* No Cumplidos */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3.5 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              No Cumple
            </span>
            <div className="text-lg font-bold text-red-400 font-mono">{metrics.noCumple}</div>
          </div>

          {/* No Aplican */}
          <div className="bg-secondary/60 border border-border rounded-xl p-3.5 shadow-sm space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              No Aplica
            </span>
            <div className="text-lg font-bold text-muted-foreground font-mono">{metrics.na}</div>
          </div>
        </div>

        {/* Resumen de Calidad si existe */}
        {evaluation.summary && (
          <div className="bg-card/70 border border-border rounded-xl p-4 shadow-sm space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-accent" />
              Observaciones Generales de Calidad
            </span>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {evaluation.summary}
            </p>
          </div>
        )}

        {/* 2. Criterios Evaluados Agrupados por Categoría */}
        <div className="space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            Detalle de Criterios Evaluados
          </h3>

          {Object.entries(groupedItems).map(([sectionName, sectionItems]) => (
            <div
              key={sectionName}
              className="bg-card/70 border border-border rounded-xl p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                <h4 className="text-sm font-bold text-foreground">{sectionName}</h4>
                <span className="text-xs text-muted-foreground font-mono">
                  {sectionItems.length} {sectionItems.length === 1 ? "criterio" : "criterios"}
                </span>
              </div>

              <div className="divide-y divide-border/40 space-y-3">
                {sectionItems.map((item) => {
                  const tsSeconds = parseTimestampSeconds(item.observation);

                  return (
                    <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            {item.attribute || "Criterio de Evaluación"}
                          </p>
                          {item.sub_attribute && (
                            <p className="text-xs text-muted-foreground">{item.sub_attribute}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                            {item.score} / {item.max_score} pts
                          </span>
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Observación / Evidencia */}
                      {item.observation && (
                        <div className="bg-secondary/30 rounded-lg p-3 text-xs text-foreground/90 border border-border/40 space-y-1.5">
                          <p className="font-medium text-muted-foreground">Evidencia / Nota:</p>
                          <p className="leading-relaxed whitespace-pre-wrap">{item.observation}</p>

                          {tsSeconds !== null && (
                            <button
                              type="button"
                              onClick={() => onSeek(tsSeconds)}
                              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-mono mt-1 font-semibold"
                            >
                              <Play className="w-3 h-3" />
                              <span>Escuchar evidencia en {formatTime(tsSeconds)}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
