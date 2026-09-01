import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { format } from "date-fns";
import { Activity, AlertTriangle, Phone, Smartphone, TrendingUp, Zap } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";
import { filterAudioFiles, filterWhatsappConversations, mapWaSentimentToKey, waTagsFromResultRow } from "@/lib/analiticas/filterDatasets";
import { getAnaliticasTrendDays } from "@/lib/analiticas/trendInterval";
import { topTagsFromRows } from "@/lib/analiticas/tagMining";
import { buildOperationalInsights } from "@/lib/analiticas/insights";
import { jsonToRecord } from "@/lib/extractions/applyExtractionRules";
import { useAnaliticasOutlet } from "./useAnaliticasOutlet";
import { TagFrequencyList } from "@/components/analiticas/TagFrequencyList";
import { Card, CardContent } from "@/components/ui/card";

export default function AnaliticasResumenPage() {
  const { data } = useAnaliticasOutlet();
  const filters = useAnaliticasFilters();

  const filteredFiles = useMemo(
    () =>
      filterAudioFiles(
        data.files,
        data.analysesByFileId,
        data.mergedExtByFile,
        filters,
        data.callExtKeys,
      ),
    [data.files, data.analysesByFileId, data.mergedExtByFile, filters, data.callExtKeys],
  );

  const filteredWa = useMemo(
    () =>
      filterWhatsappConversations(
        data.waConversations,
        data.waByConvId,
        data.waExtCellsByConv,
        data.waAgentFallbackRecord,
        filters,
        data.waExtKeys,
      ),
    [
      data.waConversations,
      data.waByConvId,
      data.waExtCellsByConv,
      data.waAgentFallbackRecord,
      filters,
      data.waExtKeys,
    ],
  );

  const stats = useMemo(() => {
    const totalCalls = filteredFiles.length;
    const totalWA = filteredWa.length;
    const totalConvs = totalCalls + totalWA;
    const completedCalls = filteredFiles.filter((f) => f.status === "completed").length;
    const analyzedWA = filteredWa.filter((c) => c.status === "analizado").length;
    const errorCalls = filteredFiles.filter((f) => f.status === "error").length;
    const errorWA = filteredWa.filter((c) => c.status === "error").length;
    const totalMin = Math.round(filteredFiles.reduce((s, f) => s + (f.duration_seconds || 0), 0) / 60);
    const totalWAMsgs = filteredWa.reduce((s, c) => s + (c.total_messages || 0), 0);

    const sentiments: Record<string, number> = {};
    filteredFiles.forEach((f) => {
      if (f.status !== "completed") return;
      const an = data.analysesByFileId.get(f.id);
      const s = String(an?.overall_sentiment || "neutral").trim().toLowerCase();
      sentiments[s] = (sentiments[s] || 0) + 1;
    });
    filteredWa.forEach((c) => {
      if (c.status !== "analizado") return;
      const r = data.waByConvId.get(c.id);
      const rec = jsonToRecord((r?.results as Parameters<typeof jsonToRecord>[0]) ?? null);
      const raw = String(rec.sentimiento_cliente || c.sentiment || "").toLowerCase();
      const k = mapWaSentimentToKey(raw);
      sentiments[k] = (sentiments[k] || 0) + 1;
    });

    const callScores = filteredFiles
      .filter((f) => f.status === "completed")
      .map((f) => data.analysesByFileId.get(f.id))
      .filter(Boolean)
      .map((a) => Number(a!.sentiment_score))
      .filter((n) => !Number.isNaN(n));
    const callScored = callScores.map((s) => (s <= 1.5 ? s * 100 : s));

    const waScores = filteredWa
      .filter((c) => c.status === "analizado" && c.score_general != null)
      .map((c) => Number(c.score_general));
    const waScored = waScores.map((s) => (s <= 1.5 ? s * 100 : s));

    const allScores = [...callScored, ...waScored];
    const avgScore = allScores.length ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length) : 0;
    const avgScoreCalls =
      callScored.length > 0 ? Math.round(callScored.reduce((a, b) => a + b, 0) / callScored.length) : null;
    const avgScoreWa =
      waScored.length > 0 ? Math.round(waScored.reduce((a, b) => a + b, 0) / waScored.length) : null;

    const analysisRate = totalConvs > 0 ? Math.round(((completedCalls + analyzedWA) / totalConvs) * 100) : 0;

    return {
      totalConvs,
      totalCalls,
      totalWA,
      completedCalls,
      analyzedWA,
      errorCalls,
      errorWA,
      totalMin,
      totalWAMsgs,
      sentiments,
      avgScore,
      avgScoreCalls,
      avgScoreWa,
      analysisRate,
      callsPct: totalConvs > 0 ? Math.round((totalCalls / totalConvs) * 100) : 0,
      waPct: totalConvs > 0 ? Math.round((totalWA / totalConvs) * 100) : 0,
    };
  }, [filteredFiles, filteredWa, data.analysesByFileId, data.waByConvId]);

  const sentimentDist = [
    { name: "Positivo", value: stats.sentiments.positive || 0, color: "hsl(var(--success))" },
    { name: "Neutral", value: stats.sentiments.neutral || 0, color: "hsl(var(--info))" },
    { name: "Negativo", value: stats.sentiments.negative || 0, color: "hsl(var(--destructive))" },
    { name: "Mixto", value: stats.sentiments.mixed || 0, color: "hsl(var(--warning))" },
  ].filter((s) => s.value > 0);

  const channelDist = [
    { name: "Llamadas", value: stats.totalCalls, color: "hsl(var(--primary))" },
    { name: "WhatsApp", value: stats.totalWA, color: "hsl(var(--success))" },
  ].filter((s) => s.value > 0);

  const dailyTrend = useMemo(() => {
    const days = getAnaliticasTrendDays(filters.dateRange);
    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      let calls = 0;
      for (const f of filteredFiles) {
        const metadata = f.metadata as Record<string, any> | null;
        const callDate = metadata?.start_time || f.created_at;
        
        if (filters.dateBasisCalls === "upload") {
          if (String(callDate || "").startsWith(dayStr)) calls++;
        } else {
          if (f.status !== "completed") continue;
          const an = data.analysesByFileId.get(f.id);
          // Si es SFTP, preferir fecha de llamada, si no, fecha de análisis
          const analysisDate = metadata?.start_time || an?.created_at;
          if (analysisDate && String(analysisDate).startsWith(dayStr)) calls++;
        }
      }
      let wa = 0;
      for (const c of filteredWa) {
        if (filters.dateBasisWa === "carga") {
          const raw = c.created_at || c.start_date;
          if (raw && String(raw).startsWith(dayStr)) wa++;
        } else {
          if (c.status !== "analizado") continue;
          const r = data.waByConvId.get(c.id);
          const raw = (r?.analyzed_at || r?.created_at) as string | undefined;
          if (raw && String(raw).startsWith(dayStr)) wa++;
        }
      }
      return { day: format(day, "dd/MM"), llamadas: calls, whatsapp: wa, total: calls + wa };
    });
  }, [filteredFiles, filteredWa, filters.dateRange, filters.dateBasisCalls, filters.dateBasisWa, data.analysesByFileId, data.waByConvId]);

  const callTagRows = useMemo(
    () =>
      filteredFiles.map((f) => ({
        tags: (data.analysesByFileId.get(f.id)?.tags as string[]) || [],
      })),
    [filteredFiles, data.analysesByFileId],
  );

  const waTagRows = useMemo(
    () =>
      filteredWa.map((c) => ({
        tags: waTagsFromResultRow(data.waByConvId.get(c.id)),
      })),
    [filteredWa, data.waByConvId],
  );

  const topCallTags = useMemo(() => topTagsFromRows(callTagRows, 8), [callTagRows]);
  const topWaTags = useMemo(() => topTagsFromRows(waTagRows, 8), [waTagRows]);

  const insights = useMemo(
    () =>
      buildOperationalInsights({
        totalCalls: stats.totalCalls,
        totalWa: stats.totalWA,
        completedCalls: stats.completedCalls,
        analyzedWa: stats.analyzedWA,
        errorCalls: stats.errorCalls,
        errorWa: stats.errorWA,
        sentiments: stats.sentiments,
        avgScoreCalls: stats.avgScoreCalls,
        avgScoreWa: stats.avgScoreWa,
        topCallTag: topCallTags[0]?.tag,
        topWaTag: topWaTags[0]?.tag,
      }),
    [stats, topCallTags, topWaTags],
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total conversaciones" value={stats.totalConvs.toString()} icon={Activity} />
        <StatCard title="Llamadas" value={stats.totalCalls.toString()} icon={Phone} subtitle={`${stats.callsPct}%`} />
        <StatCard title="WhatsApp" value={stats.totalWA.toString()} icon={Smartphone} subtitle={`${stats.waPct}%`} />
        <StatCard title="Score promedio" value={stats.avgScore.toString()} icon={TrendingUp} />
        <StatCard title="Tasa análisis" value={`${stats.analysisRate}%`} icon={Zap} />
        <StatCard title="Errores" value={(stats.errorCalls + stats.errorWA).toString()} icon={AlertTriangle} />
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Insights</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Tendencia por canal</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area type="monotone" dataKey="llamadas" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth={2} name="Llamadas" />
              <Area type="monotone" dataKey="whatsapp" fill="hsl(var(--success)/0.15)" stroke="hsl(var(--success))" strokeWidth={2} name="WhatsApp" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Distribución de sentimiento</h2>
          {sentimentDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sentimentDist} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={4}>
                    {sentimentDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-1 flex-wrap">
                {sentimentDist.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">Sin datos de sentimiento.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Distribución por canal</h2>
          {channelDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={channelDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={4}>
                    {channelDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-1">
                {channelDist.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos.</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Resumen operativo</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Llamadas completadas</span>
              <span className="text-sm font-bold">{stats.completedCalls}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">WhatsApp analizadas</span>
              <span className="text-sm font-bold">{stats.analyzedWA}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Minutos (llamadas)</span>
              <span className="text-sm font-bold">{stats.totalMin} min</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Mensajes WhatsApp</span>
              <span className="text-sm font-bold">{stats.totalWAMsgs}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Errores</span>
              <span className="text-sm font-bold text-destructive">{stats.errorCalls + stats.errorWA}</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 lg:col-span-1">
          <h2 className="text-base font-semibold text-foreground mb-4">Tags destacados</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Llamadas</p>
              <TagFrequencyList tags={topCallTags} emptyLabel="Sin tags en llamadas filtradas." />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">WhatsApp</p>
              <TagFrequencyList tags={topWaTags} emptyLabel="Sin tags en WhatsApp filtrado." />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
