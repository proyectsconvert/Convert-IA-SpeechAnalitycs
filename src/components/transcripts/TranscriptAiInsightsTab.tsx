import { useState, useMemo } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  FileText,
  Tag,
  Users,
  Target,
  ChevronDown,
  Award,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyLimitsToAnalysisResults } from "@/lib/analysis/analysisFieldLimits";
import { formatCleanSummary } from "@/lib/utils/formatSummary";
import { cn } from "@/lib/utils";

interface AnalysisRecord {
  id: string;
  audio_file_id: string;
  prompt_id?: string | null;
  overall_sentiment?: string | null;
  sentiment_score?: number | null;
  summary?: string | null;
  tags?: string[] | null;
  results?: Record<string, unknown> | null;
  created_at?: string;
  prompts?: { id?: string; name?: string } | null;
}

interface TranscriptAiInsightsTabProps {
  analyses: AnalysisRecord[];
  getSentimentIcon?: (sentiment?: string) => React.ReactNode;
}

export function TranscriptAiInsightsTab({
  analyses,
  getSentimentIcon,
}: TranscriptAiInsightsTabProps) {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(() => {
    return analyses[0]?.id || "";
  });

  // Mantener sincronizado si la lista de análisis cambia
  const activeAnalysis = useMemo(() => {
    return analyses.find((a) => a.id === selectedAnalysisId) || analyses[0] || null;
  }, [analyses, selectedAnalysisId]);

  const rawResults = (activeAnalysis?.results || {}) as Record<string, unknown>;
  const displayResults = useMemo(
    () => applyLimitsToAnalysisResults(rawResults),
    [rawResults]
  );

  if (!analyses.length || !activeAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Sin análisis de IA</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Esta llamada aún no cuenta con un análisis generado por IA. Procesa la llamada desde Gestión de Grabaciones con un prompt.
        </p>
      </div>
    );
  }

  const sentiment = activeAnalysis.overall_sentiment;
  const sentimentScore = activeAnalysis.sentiment_score;
  const promptName = activeAnalysis.prompts?.name || "Análisis Predeterminado";
  const qualityScore = displayResults.score != null ? Number(displayResults.score) : null;

  const positiveItems = Array.isArray(displayResults.positive)
    ? (displayResults.positive as string[]).filter(Boolean)
    : [];

  const negativeItems = Array.isArray(displayResults.negative)
    ? (displayResults.negative as string[]).filter(Boolean)
    : [];

  const opportunityItems = Array.isArray(displayResults.opportunities)
    ? (displayResults.opportunities as string[]).filter(Boolean)
    : [];

  const entitiesList = Array.isArray(displayResults.entities)
    ? (displayResults.entities as string[]).filter(Boolean)
    : [];

  const tagsList = Array.isArray(activeAnalysis.tags) ? activeAnalysis.tags.filter(Boolean) : [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Selector de Prompt si hay múltiples */}
        {analyses.length > 1 && (
          <div className="flex items-center justify-between gap-4 p-3.5 bg-card border border-border rounded-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-foreground">
                Seleccionar Análisis / Prompt:
              </span>
            </div>
            <Select
              value={activeAnalysis.id}
              onValueChange={(val) => setSelectedAnalysisId(val)}
            >
              <SelectTrigger className="w-64 h-8 text-xs bg-background">
                <SelectValue placeholder="Seleccionar prompt" />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((an) => (
                  <SelectItem key={an.id} value={an.id} className="text-xs">
                    {an.prompts?.name || "Predeterminado"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 3 Cards Superiores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CARD 1: Prompt / Tipo de análisis */}
          <div className="bg-card/70 border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Prompt / Tipo de Análisis
            </span>
            <p className="text-base font-bold text-foreground truncate">{promptName}</p>
            <p className="text-xs text-muted-foreground">
              {activeAnalysis.created_at
                ? `Generado el ${new Date(activeAnalysis.created_at).toLocaleDateString()}`
                : "Análisis activo"}
            </p>
          </div>

          {/* CARD 2: Sentimiento general */}
          <div
            className={cn(
              "border rounded-xl p-4 shadow-sm space-y-1",
              sentiment === "positive"
                ? "bg-emerald-500/5 border-emerald-500/20"
                : sentiment === "negative"
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-card/70 border-border"
            )}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Sentimiento General
            </span>
            <div className="flex items-center gap-2">
              {sentiment === "positive" ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : sentiment === "negative" ? (
                <TrendingDown className="w-5 h-5 text-red-400" />
              ) : (
                <Minus className="w-5 h-5 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "text-base font-bold capitalize",
                  sentiment === "positive"
                    ? "text-emerald-400"
                    : sentiment === "negative"
                      ? "text-red-400"
                      : "text-foreground"
                )}
              >
                {sentiment === "positive"
                  ? "Positivo"
                  : sentiment === "negative"
                    ? "Negativo"
                    : "Neutral"}
              </span>
              {sentimentScore != null && (
                <span className="text-xs font-mono bg-secondary/80 px-2 py-0.5 rounded-md text-muted-foreground ml-auto">
                  {(Number(sentimentScore) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Tono detectado en la conversación</p>
          </div>

          {/* CARD 3: Score obtenido */}
          <div className="bg-card/70 border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Score Obtenido
            </span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center font-bold text-primary text-sm font-mono flex-shrink-0">
                {qualityScore !== null
                  ? `${qualityScore}`
                  : sentimentScore != null
                    ? `${(Number(sentimentScore) * 100).toFixed(0)}%`
                    : "N/A"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Evaluación IA</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Cumplimiento según objetivo
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RESUMEN */}
        {activeAnalysis.summary && (
          <div className="bg-card/70 border border-border rounded-xl p-5 shadow-sm space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              Resumen de la Llamada
            </h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {formatCleanSummary(activeAnalysis.summary)}
            </p>
          </div>
        )}

        {/* ANÁLISIS COMPLETO */}
        {displayResults.analysis && (
          <div className="bg-accent/5 border border-accent/15 rounded-xl p-5 shadow-sm space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Análisis Detallado según Prompt
            </h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
              {String(displayResults.analysis)}
            </p>
          </div>
        )}

        {/* PUNTOS CLAVE (3 Columnas: Positivos, Negativos, Oportunidades) */}
        {(positiveItems.length > 0 || negativeItems.length > 0 || opportunityItems.length > 0) && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Puntos Clave
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Positivos */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Aspectos Positivos ({positiveItems.length})
                </span>
                {positiveItems.length > 0 ? (
                  <ul className="space-y-2">
                    {positiveItems.map((p, i) => (
                      <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                        <span className="text-emerald-400 font-bold mt-0.5">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No se registraron puntos positivos.</p>
                )}
              </div>

              {/* Negativos */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400" />
                  Problemas / Negativos ({negativeItems.length})
                </span>
                {negativeItems.length > 0 ? (
                  <ul className="space-y-2">
                    {negativeItems.map((n, i) => (
                      <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                        <span className="text-red-400 font-bold mt-0.5">•</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No se detectaron problemas críticos.</p>
                )}
              </div>

              {/* Oportunidades */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Oportunidades de Mejora ({opportunityItems.length})
                </span>
                {opportunityItems.length > 0 ? (
                  <ul className="space-y-2">
                    {opportunityItems.map((o, i) => (
                      <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                        <span className="text-amber-400 font-bold mt-0.5">•</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sin oportunidades identificadas.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SEGUIMIENTO (3 Columnas: Oportunidades / Recomendaciones, Insights, Conclusiones) */}
        {(displayResults.recommendations || displayResults.insights || displayResults.conclusions) && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              Seguimiento y Conclusiones
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Oportunidades / Recomendaciones */}
              <div className="bg-card/70 border border-border border-l-4 border-l-amber-500 rounded-xl p-4 space-y-2 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Recomendaciones / Acciones
                </span>
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {String(displayResults.recommendations || "Sin recomendaciones específicas.")}
                </p>
              </div>

              {/* Insights */}
              <div className="bg-card/70 border border-border border-l-4 border-l-cyan-500 rounded-xl p-4 space-y-2 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Hallazgos / Insights
                </span>
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {String(displayResults.insights || "Sin insights adicionales.")}
                </p>
              </div>

              {/* Conclusiones */}
              <div className="bg-card/70 border border-border border-l-4 border-l-blue-500 rounded-xl p-4 space-y-2 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Conclusiones Principales
                </span>
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {String(displayResults.conclusions || "Sin conclusiones registradas.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ENTIDADES Y ETIQUETAS (2 Columnas) */}
        {(entitiesList.length > 0 || tagsList.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Entidades Detectadas */}
            {entitiesList.length > 0 && (
              <div className="bg-card/70 border border-border rounded-xl p-4 space-y-3 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Entidades Detectadas
                </span>
                <div className="flex flex-wrap gap-2">
                  {entitiesList.map((ent, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1"
                    >
                      {ent}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Etiquetas */}
            {tagsList.length > 0 && (
              <div className="bg-card/70 border border-border rounded-xl p-4 space-y-3 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Etiquetas Asociadas
                </span>
                <div className="flex flex-wrap gap-2">
                  {tagsList.map((t, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-xs uppercase bg-secondary/80 border-border text-muted-foreground px-2.5 py-1"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
