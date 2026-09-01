import { forwardRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Award,
  Target,
  Calendar,
  FileText,
  Loader2,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { TotalAnalyzerV2Response } from "@/lib/analizador-total/reporteIaSchema";

interface Props {
  response: TotalAnalyzerV2Response;
  isStale?: boolean;
  onRegenerate: () => void;
  onExportPptx: () => void;
  onExportPdf: () => void;
  isExporting?: boolean;
  isExportingPdf?: boolean;
  /** Oculta la barra inferior de acciones (usado en vista pública compartida). */
  hideActions?: boolean;
}

const PRIORITY_TONE: Record<string, string> = {
  CRÍTICO: "bg-destructive/10 text-destructive border-destructive/30",
  ALTO: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  MEDIO: "bg-muted text-muted-foreground border-border",
};

/**
 * Section wrapper. Each section becomes its own page in the PDF export
 * via the `data-pdf-page` attribute. The exporter iterates these blocks
 * one-by-one, scaling each to fit a single A4 landscape page so nothing
 * is split across pages.
 */
function PdfPage({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: typeof Award;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-pdf-page
      className={cn(
        "space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export const ReporteEjecutivoView = forwardRef<HTMLDivElement, Props>(function ReporteEjecutivoView(
  { response, isStale, onRegenerate, onExportPptx, onExportPdf, isExporting, isExportingPdf, hideActions },
  ref,
) {
  const { meta, stats, analysis } = response;

  const channelChart = stats.by_canal.map((c) => ({ name: c.label, value: c.count }));
  const sentimentByChannel = Object.entries(stats.canal_x_sentimiento).flatMap(([canal, sentMap]) =>
    Object.entries(sentMap).map(([sent, count]) => ({ canal, sent, count })),
  );
  const promesaChart = stats.by_promesa_pago.map((p) => ({ name: p.label, value: p.count }));
  const asesorChart = stats.by_asesor.slice(0, 10).map((a) => ({ name: a.label, value: a.count }));


  return (
    <>
      <div ref={ref} className="space-y-6 pb-28">
        {/* Status bar (not a PDF page, just visual context) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">
              {meta.source.mode === "upload"
                ? `${meta.source.fileName ?? "archivo.xlsx"}`
                : "Datos Maestros · filtrado"}
            </span>
            <span>·</span>
            <span>{meta.rowsAnalyzed.toLocaleString("es")} interacciones</span>
            {meta.dateRange && (
              <>
                <span>·</span>
                <span>{meta.dateRange}</span>
              </>
            )}
            <span>·</span>
            <span>Generado {new Date(meta.generatedAt).toLocaleString("es")}</span>
          </div>
          {isStale && (
            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
              Filtros modificados — regenerar
            </Badge>
          )}
        </div>

        {/* ============ HOJA 1 · Resumen ejecutivo ============ */}
        <PdfPage title="Resumen ejecutivo" subtitle="Visión general del periodo analizado" icon={FileText}>
          <p className="text-base leading-relaxed text-foreground">
            {analysis.executive_summary?.narrative || "Sin datos suficientes para esta sección."}
          </p>
          {analysis.executive_summary?.headline_stats?.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {analysis.executive_summary.headline_stats.map((s, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-3xl font-bold text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </PdfPage>

        {/* ============ HOJA 2 · Hallazgos clave ============ */}
        <PdfPage
          title="Hallazgos clave"
          subtitle="Hallazgo crítico y análisis por asesor"
          icon={AlertCircle}
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="border-l-4 border-destructive bg-card p-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                Hallazgo crítico
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground">
                {analysis.critical_finding?.title || "Sin hallazgo crítico identificado"}
              </h3>
              <p className="mt-3 text-5xl font-bold text-foreground">
                {analysis.critical_finding?.statistic || "—"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {analysis.critical_finding?.detail || "Sin datos suficientes para esta sección."}
              </p>
            </Card>

            {analysis.advisor_analysis ? (
              <Card className="border border-border bg-card p-6">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Análisis por asesor
                </p>
                <p className="mt-2 text-5xl font-bold text-foreground">
                  {analysis.advisor_analysis.top_load_pct || "—"}
                </p>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  carga concentrada en top asesores
                </p>
                <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
                  {(analysis.advisor_analysis.observations ?? []).map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 text-primary">·</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card className="border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  Sin análisis por asesor disponible.
                </p>
              </Card>
            )}
          </div>
        </PdfPage>

        {/* ============ HOJA 3 · Métricas clave ============ */}
        {analysis.key_metrics?.length > 0 && (
          <PdfPage title="Métricas clave" subtitle="Indicadores cuantitativos del periodo" icon={TrendingUp}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {analysis.key_metrics.map((m, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-2xl font-bold text-foreground">{m.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground/80">{m.label}</p>
                  {m.context && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{m.context}</p>
                  )}
                </div>
              ))}
            </div>
          </PdfPage>
        )}

        {/* ============ HOJA 4 · Distribución (gráficos) ============ */}
        <PdfPage title="Distribución del volumen" subtitle="Canales, resultados de gestión y asesores" icon={Target}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard title="Volumen por canal" data={channelChart} />
            <ChartCard title="Resultados de gestión / Compromiso" data={promesaChart} highlightLabel="Sí" />
            <ChartCard title="Top asesores por carga" data={asesorChart} />
            {sentimentByChannel.length > 0 && (
              <Card className="border border-border bg-card p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Sentimiento por canal</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left font-semibold">Canal</th>
                        {[...new Set(sentimentByChannel.map((s) => s.sent))].map((s) => (
                          <th key={s} className="px-2 py-1 text-right font-semibold">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(sentimentByChannel.map((s) => s.canal))].map((c) => (
                        <tr key={c} className="border-t border-border/40">
                          <td className="px-2 py-1 font-medium text-foreground">{c}</td>
                          {[...new Set(sentimentByChannel.map((s) => s.sent))].map((s) => {
                            const v =
                              sentimentByChannel.find((x) => x.canal === c && x.sent === s)?.count ??
                              0;
                            return (
                              <td key={s} className="px-2 py-1 text-right text-foreground/90">
                                {v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </PdfPage>

        {/* ============ HOJA 5 · Fortalezas ============ */}
        <PdfPage title="Fortalezas detectadas" subtitle="Buenas prácticas observadas" icon={Award}>
          {analysis.positive_points?.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.positive_points.map((p, i) => (
                <Card key={i} className="border border-emerald-500/20 bg-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      ✓
                    </span>
                    <h4 className="font-semibold text-foreground">{p.title}</h4>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{p.detail}</p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptySection />
          )}
        </PdfPage>

        {/* ============ HOJA 6 · Oportunidades ============ */}
        <PdfPage title="Oportunidades de mejora" subtitle="Áreas con mayor potencial de impacto" icon={TrendingUp}>
          {analysis.improvement_opportunities?.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.improvement_opportunities.map((o, i) => (
                <Card key={i} className="border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Badge className={cn("text-[10px]", PRIORITY_TONE[o.priority] ?? PRIORITY_TONE.MEDIO)}>
                      {o.priority}
                    </Badge>
                  </div>
                  <h4 className="mb-2 font-semibold text-foreground">{o.title}</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">{o.detail}</p>
                  {o.evidence && (
                    <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-xs italic text-muted-foreground">
                      "{o.evidence}"
                    </blockquote>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <EmptySection />
          )}
        </PdfPage>

        {/* ============ HOJA 7 · Casos destacados ============ */}
        <PdfPage title="Casos destacados" subtitle="Conversaciones representativas" icon={Target}>
          {analysis.highlighted_cases?.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.highlighted_cases.map((c, i) => (
                <Card key={i} className="border border-border bg-card p-4">
                  <Badge variant="outline" className="mb-2 text-[10px] uppercase">
                    {c.tag}
                  </Badge>
                  <h4 className="mb-2 font-semibold text-foreground">{c.title}</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                  {c.lesson && (
                    <p className="mt-3 rounded border-l-2 border-primary/40 bg-muted/40 p-2 text-xs text-foreground">
                      <span className="font-semibold">Lección:</span> {c.lesson}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <EmptySection />
          )}
        </PdfPage>

        {/* ============ HOJA 8 · Roadmap 90 días ============ */}
        <PdfPage title="Plan 90 días" subtitle="Hoja de ruta secuenciada" icon={Calendar}>
          {analysis.roadmap_90_days?.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {analysis.roadmap_90_days.map((p, i) => (
                <Card key={i} className="border border-border bg-card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {p.phase}
                  </p>
                  <h4 className="mb-3 mt-1 font-semibold text-foreground">{p.focus}</h4>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {(p.items ?? []).map((it, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="text-primary">→</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          ) : (
            <EmptySection />
          )}
        </PdfPage>

        {/* ============ HOJA 9 · Recomendaciones ============ */}
        {analysis.recommendations?.length > 0 && (
          <PdfPage title="Recomendaciones priorizadas" subtitle="Acciones ordenadas por impacto/esfuerzo" icon={Target}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">#</th>
                    <th className="px-2 py-2 text-left font-semibold">Recomendación</th>
                    <th className="px-2 py-2 text-left font-semibold">Detalle</th>
                    <th className="px-2 py-2 text-left font-semibold">Impacto</th>
                    <th className="px-2 py-2 text-left font-semibold">Esfuerzo</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.recommendations.map((r, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-2 py-3 font-medium text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-3 font-semibold text-foreground">{r.title}</td>
                      <td className="px-2 py-3 text-foreground/80">{r.detail}</td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">{r.impact}</Badge>
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">{r.effort}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PdfPage>
        )}
      </div>

      {/* Sticky actions bar (outside captured area) */}
      {!hideActions && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onExportPptx} disabled={isExporting} className="gap-1.5">
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              PPTX
            </Button>
            <Button size="sm" onClick={onExportPdf} disabled={isExportingPdf} variant="secondary" className="gap-1.5">
              {isExportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onRegenerate} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar
            </Button>
          </div>
        </div>
      )}
    </>
  );
});

function ChartCard({
  title,
  data,
  highlightLabel,
}: {
  title: string;
  data: { name: string; value: number }[];
  highlightLabel?: string;
}) {
  if (data.length === 0) return null;
  return (
    <Card className="border border-border bg-card p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={Math.max(180, Math.min(360, 40 + data.length * 28))}>
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
          <XAxis
            type="number"
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.name === highlightLabel
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground) / 0.6)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function EmptySection() {
  return (
    <Card className="border border-border bg-card p-8 text-center">
      <AlertCircle className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Sin datos suficientes para esta sección.</p>
    </Card>
  );
}
