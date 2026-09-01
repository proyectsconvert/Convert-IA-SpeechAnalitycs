import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Smartphone, MessageCircle, TrendingUp, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";
import { filterWhatsappConversations, mapWaSentimentToKey, waTagsFromResultRow } from "@/lib/analiticas/filterDatasets";
import { jsonToRecord } from "@/lib/extractions/applyExtractionRules";
import { WA_MESSAGE_BUCKETS, waMessageBucketId } from "@/lib/analiticas/buckets";
import { topTagsPerBucket } from "@/lib/analiticas/tagMining";
import { useAnaliticasOutlet } from "./useAnaliticasOutlet";
import { TagFrequencyList } from "@/components/analiticas/TagFrequencyList";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function AnaliticasWhatsappPage() {
  const { data } = useAnaliticasOutlet();
  const filters = useAnaliticasFilters();

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
    const analyzed = filteredWa.filter((c) => c.status === "analizado").length;
    const errors = filteredWa.filter((c) => c.status === "error").length;
    const msgs = filteredWa.reduce((s, c) => s + (c.total_messages || 0), 0);
    const scores = filteredWa
      .filter((c) => c.status === "analizado" && c.score_general != null)
      .map((c) => {
        const n = Number(c.score_general);
        return n <= 1.5 ? n * 100 : n;
      });
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { total: filteredWa.length, analyzed, errors, msgs, avgScore: avg };
  }, [filteredWa]);

  const sentimentDist = useMemo(() => {
    const sentiments: Record<string, number> = {};
    filteredWa.forEach((c) => {
      if (c.status !== "analizado") return;
      const r = data.waByConvId.get(c.id);
      const rec = jsonToRecord((r?.results as Parameters<typeof jsonToRecord>[0]) ?? null);
      const raw = String(rec.sentimiento_cliente || c.sentiment || "").toLowerCase();
      const k = mapWaSentimentToKey(raw);
      sentiments[k] = (sentiments[k] || 0) + 1;
    });
    return [
      { name: "Positivo", value: sentiments.positive || 0, color: "hsl(var(--success))" },
      { name: "Neutral", value: sentiments.neutral || 0, color: "hsl(var(--info))" },
      { name: "Negativo", value: sentiments.negative || 0, color: "hsl(var(--destructive))" },
    ].filter((s) => s.value > 0);
  }, [filteredWa, data.waByConvId]);

  const messageBarData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(WA_MESSAGE_BUCKETS.map((b) => [b.id, 0]));
    for (const c of filteredWa) {
      const id = waMessageBucketId(c.total_messages);
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return WA_MESSAGE_BUCKETS.map((b) => ({ label: b.label, count: counts[b.id] || 0 }));
  }, [filteredWa]);

  const bucketTagSummaries = useMemo(() => {
    const rows = filteredWa.map((c) => ({
      tags: waTagsFromResultRow(data.waByConvId.get(c.id)),
      total_messages: c.total_messages as number | null,
    }));
    return topTagsPerBucket(
      rows,
      (row) => waMessageBucketId(row.total_messages),
      WA_MESSAGE_BUCKETS.map((b) => ({ id: b.id, label: b.label })),
      5,
    );
  }, [filteredWa, data.waByConvId]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Conversaciones" value={stats.total.toString()} icon={Smartphone} />
        <StatCard title="Analizadas" value={stats.analyzed.toString()} icon={MessageCircle} />
        <StatCard title="Score medio" value={stats.avgScore.toString()} icon={TrendingUp} />
        <StatCard title="Errores" value={stats.errors.toString()} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Volumen por mensajes</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={messageBarData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} textAnchor="end" height={65} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Chats" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Sentimiento (WhatsApp)</h2>
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
        <h2 className="text-base font-semibold text-foreground mb-2">Tags frecuentes por volumen de mensajes</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Cubetas: 1–10, 11–20, 21–35 y más de 35 mensajes. N = conversaciones en cada cubeta.
        </p>
        <Accordion type="multiple" className="w-full">
          {bucketTagSummaries.map((b) => (
            <AccordionItem key={b.bucketId} value={b.bucketId}>
              <AccordionTrigger className="text-sm">
                {b.bucketLabel}
                <span className="ml-2 text-muted-foreground font-normal">({b.sampleSize} chats)</span>
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
