import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Phone, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";
import { filterAudioFiles } from "@/lib/analiticas/filterDatasets";
import { CALL_DURATION_BUCKETS, callDurationBucketId } from "@/lib/analiticas/buckets";
import { topTagsPerBucket } from "@/lib/analiticas/tagMining";
import { useAnaliticasOutlet } from "./useAnaliticasOutlet";
import { TagFrequencyList } from "@/components/analiticas/TagFrequencyList";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function AnaliticasLlamadasPage() {
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

  const stats = useMemo(() => {
    const completed = filteredFiles.filter((f) => f.status === "completed").length;
    const errors = filteredFiles.filter((f) => f.status === "error").length;
    const totalMin = Math.round(filteredFiles.reduce((s, f) => s + (f.duration_seconds || 0), 0) / 60);
    const scores = filteredFiles
      .filter((f) => f.status === "completed")
      .map((f) => data.analysesByFileId.get(f.id))
      .filter(Boolean)
      .map((a) => Number(a!.sentiment_score))
      .filter((n) => !Number.isNaN(n))
      .map((s) => (s <= 1.5 ? s * 100 : s));
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { total: filteredFiles.length, completed, errors, totalMin, avgScore: avg };
  }, [filteredFiles, data.analysesByFileId]);

  const sentimentDist = useMemo(() => {
    const sentiments: Record<string, number> = {};
    filteredFiles.forEach((f) => {
      if (f.status !== "completed") return;
      const an = data.analysesByFileId.get(f.id);
      const s = String(an?.overall_sentiment || "neutral").trim().toLowerCase();
      sentiments[s] = (sentiments[s] || 0) + 1;
    });
    return [
      { name: "Positivo", value: sentiments.positive || 0, color: "hsl(var(--success))" },
      { name: "Neutral", value: sentiments.neutral || 0, color: "hsl(var(--info))" },
      { name: "Negativo", value: sentiments.negative || 0, color: "hsl(var(--destructive))" },
      { name: "Mixto", value: sentiments.mixed || 0, color: "hsl(var(--warning))" },
    ].filter((s) => s.value > 0);
  }, [filteredFiles, data.analysesByFileId]);

  const durationBarData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(CALL_DURATION_BUCKETS.map((b) => [b.id, 0]));
    for (const f of filteredFiles) {
      const id = callDurationBucketId(f.duration_seconds);
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return CALL_DURATION_BUCKETS.map((b) => ({ label: b.label, count: counts[b.id] || 0 }));
  }, [filteredFiles]);

  const bucketTagSummaries = useMemo(() => {
    const rows = filteredFiles.map((f) => ({
      tags: (data.analysesByFileId.get(f.id)?.tags as string[]) || [],
      duration_seconds: f.duration_seconds as number | null,
    }));
    return topTagsPerBucket(
      rows,
      (row) => callDurationBucketId(row.duration_seconds),
      CALL_DURATION_BUCKETS.map((b) => ({ id: b.id, label: b.label })),
      5,
    );
  }, [filteredFiles, data.analysesByFileId]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Llamadas" value={stats.total.toString()} icon={Phone} />
        <StatCard title="Completadas" value={stats.completed.toString()} icon={Clock} />
        <StatCard title="Score medio" value={stats.avgScore.toString()} icon={TrendingUp} />
        <StatCard title="Errores" value={stats.errors.toString()} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Volumen por duración</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={durationBarData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Llamadas" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Sentimiento (llamadas)</h2>
          {sentimentDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sentimentDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {sentimentDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
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

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-foreground mb-2">Tags frecuentes por duración</h2>
        <p className="text-xs text-muted-foreground mb-4">
          En cada rango de minutos, los tags más repetidos entre las llamadas filtradas (N = conversaciones en la cubeta).
        </p>
        <Accordion type="multiple" className="w-full">
          {bucketTagSummaries.map((b) => (
            <AccordionItem key={b.bucketId} value={b.bucketId}>
              <AccordionTrigger className="text-sm">
                {b.bucketLabel}
                <span className="ml-2 text-muted-foreground font-normal">({b.sampleSize} llamadas)</span>
              </AccordionTrigger>
              <AccordionContent>
                <TagFrequencyList tags={b.topTags} emptyLabel="Sin tags en esta cubeta." />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </>
  );
}
