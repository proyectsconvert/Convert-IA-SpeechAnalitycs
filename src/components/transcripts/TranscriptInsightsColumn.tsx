import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { applyLimitsToAnalysisResults } from "@/lib/analysis/analysisFieldLimits";
import { formatCleanSummary } from "@/lib/utils/formatSummary";

interface TranscriptInsightsColumnProps {
  analysis: Record<string, unknown> | null | undefined;
  results: Record<string, unknown>;
  getSentimentIcon: (sentiment?: string) => React.ReactNode;
  /** Por defecto “Resumen de la llamada”; p. ej. WhatsApp: “Resumen de la conversación”. */
  summarySectionTitle?: string;
}

export function TranscriptInsightsColumn({
  analysis,
  results,
  getSentimentIcon,
  summarySectionTitle = "Resumen de la llamada",
}: TranscriptInsightsColumnProps) {
  /** Muestra todo el texto guardado (hasta 2000); el modelo se pide resumir ~600 al generar. */
  const displayResults = useMemo(() => applyLimitsToAnalysisResults(results), [results]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-border bg-card/50 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-foreground">Insights de IA</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
            {analysis ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                  <div className="bg-accent/5 border border-accent/10 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Prompt</p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {(analysis as { prompts?: { name?: string } }).prompts?.name || "Predeterminado"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "border rounded-xl p-4",
                      analysis.overall_sentiment === "positive"
                        ? "bg-emerald-500/5 border-emerald-500/10"
                        : analysis.overall_sentiment === "negative"
                          ? "bg-red-500/5 border-red-500/10"
                          : "bg-muted/30 border-border",
                    )}
                  >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Sentimiento</p>
                    <div className="flex items-center gap-2">
                      {getSentimentIcon(analysis.overall_sentiment as string | undefined)}
                      <p
                        className={cn(
                          "text-sm font-bold capitalize",
                          analysis.overall_sentiment === "positive"
                            ? "text-emerald-500"
                            : analysis.overall_sentiment === "negative"
                              ? "text-red-500"
                              : "text-muted-foreground",
                        )}
                      >
                        {analysis.overall_sentiment === "positive"
                          ? "Positivo"
                          : analysis.overall_sentiment === "negative"
                            ? "Negativo"
                            : "Neutral"}
                        {analysis.sentiment_score != null && (
                          <span className="text-xs ml-1.5 opacity-70">
                            ({(Number(analysis.sentiment_score) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {displayResults.score != null && (
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-5 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full border-[3px] border-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-primary">{String(displayResults.score)}</span>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Score de Calidad</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Evaluación del cumplimiento del prompt</p>
                    </div>
                  </div>
                )}

                {analysis.summary && (
                  <div className="bg-secondary/30 rounded-xl p-5 border border-border">
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                      {summarySectionTitle}
                    </p>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{formatCleanSummary(analysis.summary)}</p>
                  </div>
                )}

                {displayResults.analysis && (
                  <div className="bg-accent/5 rounded-xl p-5 border border-accent/10 min-w-0">
                    <p className="text-xs uppercase tracking-wider font-semibold text-accent mb-2">Análisis según Prompt</p>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words min-w-0 max-w-full">
                      {String(displayResults.analysis)}
                    </p>
                  </div>
                )}

                {Array.isArray(displayResults.positive) && displayResults.positive.length > 0 && (
                  <div className="bg-emerald-500/5 rounded-xl p-5 border border-emerald-500/10">
                    <p className="text-xs uppercase tracking-wider font-semibold text-emerald-500 mb-2">Puntos Positivos</p>
                    <ul className="space-y-2">
                      {(displayResults.positive as string[]).map((p, i) => (
                        <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">✓</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(displayResults.negative) && displayResults.negative.length > 0 && (
                  <div className="bg-red-500/5 rounded-xl p-5 border border-red-500/10">
                    <p className="text-xs uppercase tracking-wider font-semibold text-red-500 mb-2">Puntos Negativos</p>
                    <ul className="space-y-2">
                      {(displayResults.negative as string[]).map((n, i) => (
                        <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">✗</span>
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(displayResults.opportunities) && displayResults.opportunities.length > 0 && (
                  <div className="bg-amber-500/5 rounded-xl p-5 border border-amber-500/10">
                    <p className="text-xs uppercase tracking-wider font-semibold text-amber-500 mb-2">Oportunidades</p>
                    <ul className="space-y-2">
                      {(displayResults.opportunities as string[]).map((o, i) => (
                        <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">◆</span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {displayResults.insights && (
                  <div className="bg-secondary/20 rounded-xl p-5 border border-border border-l-amber-500 border-l-[3px]">
                    <p className="text-xs uppercase tracking-wider font-semibold text-amber-500 mb-2">Insights</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{String(displayResults.insights)}</p>
                  </div>
                )}

                {displayResults.conclusions && (
                  <div className="bg-secondary/20 shadow-sm rounded-xl p-5 border border-border border-l-blue-500 border-l-[3px]">
                    <p className="text-xs uppercase tracking-wider font-semibold text-blue-500 mb-2">Conclusiones</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{String(displayResults.conclusions)}</p>
                  </div>
                )}

                {displayResults.recommendations && (
                  <div className="bg-emerald-500/5 rounded-xl p-5 border border-emerald-500/10 border-l-emerald-500 border-l-[3px]">
                    <p className="text-xs uppercase tracking-wider font-semibold text-emerald-500 mb-2">Recomendaciones</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{String(displayResults.recommendations)}</p>
                  </div>
                )}

                {Array.isArray(displayResults.entities) && displayResults.entities.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Entidades detectadas</p>
                    <div className="flex flex-wrap gap-2">
                      {(displayResults.entities as string[]).map((e) => (
                        <span
                          key={e}
                          className="text-xs font-semibold bg-primary/10 px-2.5 py-1 rounded-full text-primary border border-primary/20"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.tags && (analysis.tags as string[]).length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Etiquetas</p>
                    <div className="flex flex-wrap gap-2">
                      {(analysis.tags as string[]).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-semibold uppercase bg-secondary/80 px-2.5 py-1 rounded-full text-muted-foreground border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-14">
                <div className="w-16 h-16 rounded-2xl bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="w-8 h-8 text-amber-400/50" />
                </div>
                <p className="text-sm text-muted-foreground">No hay análisis disponible.</p>
                <p className="text-xs text-muted-foreground mt-2">Procesa la llamada con un prompt para generar insights.</p>
              </div>
            )}
        </div>
      </ScrollArea>
    </div>
  );
}
