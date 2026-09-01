import { useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  CalendarDays,
  Clock,
  FileText,
  LineChart as LineChartIcon,
  Medal,
  MessageCircle,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  ArrowUpDown,
  X,
  ShieldCheck,
  Calendar,
  CheckCircle,
  Phone,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AnalizadorUnifiedRow } from "./types";
import { buildChartData, buildSentimentByChannel, buildSentimentByCampaign } from "@/lib/analizador-total/deriveData";
import { MultiSelect } from "@/components/ui/multi-select";
import { getMacroprocesoConfig, classifyOperationResult } from "@/lib/analizador-total/macroprocesoConfigs";

interface Props {
  filteredData: AnalizadorUnifiedRow[];
  previousData: AnalizadorUnifiedRow[];
  campaigns: string[];
  selectedAgent: string;
  onSelectedAgentChange: (agent: string) => void;
  macroproceso?: string;
}

type PeriodMode = "day" | "week" | "month";

interface AgentMetric {
  name: string;
  count: number;
  callCount: number;
  whatsappCount: number;
  avgScore: number;
  avgCallScore: number;
  avgWhatsappScore: number;
  positivePct: number;
  sentiments: { positive: number; neutral: number; negative: number };
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#ec4899"];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

function scoreValue(row: AnalizadorUnifiedRow) {
  if (row.channel === "whatsapp") return row.sentiment === "positive" ? 100 : row.sentiment === "negative" ? 0 : 50;
  const s = row.score || 0;
  return s <= 1.5 ? s * 100 : s;
}

function periodKey(date: Date, mode: PeriodMode) {
  const d = new Date(date);
  if (mode === "day") return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  if (mode === "week") {
    const start = new Date(d.setDate(d.getDate() - d.getDay()));
    return `Sem ${start.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}`;
  }
  return d.toLocaleDateString("es-ES", { month: "long" });
}

function deltaPct(curr: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function buildMetrics(rows: AnalizadorUnifiedRow[]): AgentMetric[] {
  const map = new Map<string, AgentMetric>();
  rows.forEach((row) => {
    const name = row.agent || "Sin asesor";
    const current = map.get(name) ?? {
      name,
      count: 0,
      callCount: 0,
      whatsappCount: 0,
      avgScore: 0,
      avgCallScore: 0,
      avgWhatsappScore: 0,
      positivePct: 0,
      sentiments: { positive: 0, neutral: 0, negative: 0 },
    };

    current.count += 1;
    if (row.channel === "whatsapp") current.whatsappCount += 1;
    else current.callCount += 1;

    if (row.sentiment === "positive") current.sentiments.positive += 1;
    else if (row.sentiment === "negative") current.sentiments.negative += 1;
    else current.sentiments.neutral += 1;

    map.set(name, current);
  });

  return Array.from(map.values())
    .map((m) => {
      const agentRows = rows.filter((r) => (r.agent || "Sin asesor") === m.name);
      const callRows = agentRows.filter((r) => r.channel !== "whatsapp");
      const waRows = agentRows.filter((r) => r.channel === "whatsapp");

      return {
        ...m,
        avgScore: Math.round(agentRows.reduce((sum, r) => sum + scoreValue(r), 0) / Math.max(1, agentRows.length)),
        avgCallScore: Math.round(callRows.reduce((sum, r) => sum + scoreValue(r), 0) / Math.max(1, callRows.length)),
        avgWhatsappScore: Math.round(waRows.reduce((sum, r) => sum + scoreValue(r), 0) / Math.max(1, waRows.length)),
        positivePct: Math.round((m.sentiments.positive / m.count) * 100),
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore || b.count - a.count);
}

export function CentroVisualAgentesTab({
  filteredData,
  previousData,
  campaigns,
  selectedAgent,
  onSelectedAgentChange,
  macroproceso = "ventas",
}: Props) {
  const [query, setQuery] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [campaign, setCampaign] = useState<string[]>([]); // [] = todas
  const [multiAgents, setMultiAgents] = useState<string[]>([]); // [] = todos
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [agentSortConfig, setAgentSortConfig] = useState<{ key: keyof AgentMetric | "name"; direction: "asc" | "desc" }>({ key: "avgScore", direction: "desc" });

  const mpConfig = useMemo(() => getMacroprocesoConfig(macroproceso), [macroproceso]);
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    mpConfig.categories.forEach((cat, i) => {
      map[cat.name] = cat.color || COLORS[i % COLORS.length];
    });
    return map;
  }, [mpConfig]);

  const scopedRows = useMemo(() => {
    let rows = filteredData;
    if (campaign.length > 0) {
      const set = new Set(campaign);
      rows = rows.filter((row) => set.has(row.campaign || "Sin campaña"));
    }
    if (multiAgents.length > 0) {
      const set = new Set(multiAgents);
      rows = rows.filter((row) => set.has(row.agent || "Sin agente"));
    }
    if (selectedAgent !== "all") rows = rows.filter((row) => (row.agent || "Sin agente") === selectedAgent);
    if (selectedResult) {
      rows = rows.filter((row) => {
        const res = classifyOperationResult(row as any, macroproceso);
        return res === selectedResult;
      });
    }
    return rows;
  }, [filteredData, campaign, multiAgents, selectedAgent, selectedResult, macroproceso]);

  const metrics = useMemo(() => buildMetrics(scopedRows), [scopedRows]);
  const prevMetrics = useMemo(() => buildMetrics(previousData), [previousData]);
  const agents = useMemo(() => buildMetrics(filteredData).map((a) => a.name), [filteredData]);
  const chartData = useMemo(() => buildChartData(scopedRows, macroproceso), [scopedRows, macroproceso]);

  const visibleMetrics = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = metrics.filter((item) => !q || item.name.toLowerCase().includes(q));

    if (agentSortConfig) {
      const { key, direction } = agentSortConfig;
      result = [...result].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        if (direction === "asc") return av > bv ? 1 : -1;
        return av < bv ? 1 : -1;
      });
    }
    return result;
  }, [metrics, query, agentSortConfig]);

  const topAgents = visibleMetrics.slice(0, 8).map((item) => ({ ...item, shortName: item.name.length > 18 ? `${item.name.slice(0, 18)}…` : item.name }));
  const bestAgent = metrics[0];
  const improvementAgents = [...metrics].sort((a, b) => a.avgScore - b.avgScore).slice(0, 5);
  const avgScore = metrics.length ? Math.round(metrics.reduce((sum, a) => sum + a.avgScore * a.count, 0) / Math.max(1, metrics.reduce((sum, a) => sum + a.count, 0))) : 0;
  const totalInteractions = metrics.reduce((sum, a) => sum + a.count, 0);
  const prevTotal = prevMetrics.reduce((sum, a) => sum + a.count, 0);
  const prevAvg = prevMetrics.length ? Math.round(prevMetrics.reduce((sum, a) => sum + a.avgScore * a.count, 0) / Math.max(1, prevMetrics.reduce((sum, a) => sum + a.count, 0))) : 0;
  const volumeDelta = deltaPct(totalInteractions, prevTotal);
  const scoreDelta = deltaPct(avgScore, prevAvg);

  const trend = useMemo(() => {
    const map = new Map<string, { interactions: number; scoreSum: number }>();
    scopedRows.forEach((row) => {
      const key = periodKey(new Date(row.created_at), periodMode);
      const current = map.get(key) ?? { interactions: 0, scoreSum: 0 };
      current.interactions += 1;
      current.scoreSum += scoreValue(row);
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([period, value]) => ({
      period,
      interacciones: value.interactions,
      nota: Math.round(value.scoreSum / Math.max(1, value.interactions)),
    }));
  }, [scopedRows, periodMode]);

  const campaignDist = useMemo(() => {
    const map = new Map<string, { count: number; scoreSum: number }>();
    scopedRows.forEach((row) => {
      const c = row.campaign || "Sin campaña";
      const current = map.get(c) ?? { count: 0, scoreSum: 0 };
      current.count += 1;
      current.scoreSum += scoreValue(row);
      map.set(c, current);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ 
      name, 
      value: v.count,
      avgScore: Math.round(v.scoreSum / v.count)
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [scopedRows]);

  const sentimentData = useMemo(() => {
    return topAgents.map(a => ({
      name: a.shortName,
      Positivo: a.sentiments.positive,
      Neutral: a.sentiments.neutral,
      Negativo: a.sentiments.negative,
    }));
  }, [topAgents]);

  const sentimentByChannelData = useMemo(() => buildSentimentByChannel(scopedRows), [scopedRows]);
  const sentimentByCampaignData = useMemo(() => buildSentimentByCampaign(scopedRows, 10), [scopedRows]);

  // Resultados de la Operación (total periodo) — adaptado al macroproceso
  const resultDistribution = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(mpConfig.categories.map((c) => [c.name, 0]));
    scopedRows.forEach((row) => {
      const cat = classifyOperationResult(row as any, macroproceso);
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return mpConfig.categories.map((c) => ({ name: c.name, value: counts[c.name] ?? 0 })).filter((d) => d.value > 0);
  }, [scopedRows, mpConfig, macroproceso]);

  const hourlyActivity = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, count: 0 }));
    scopedRows.forEach(row => {
      const date = new Date(row.created_at);
      const h = date.getHours();
      hours[h].count += 1;
    });
    return hours;
  }, [scopedRows]);

  const efficiencyData = useMemo(() => {
    return metrics.map(m => ({
      name: m.name,
      x: m.count,
      y: m.avgScore,
      z: m.count
    }));
  }, [metrics]);

  const toggleSort = (key: keyof AgentMetric | "name") => {
    setAgentSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const SortButton = ({ k, label, className }: { k: keyof AgentMetric | "name", label: string, className?: string }) => {
    const active = agentSortConfig.key === k;
    return (
      <button 
        onClick={() => toggleSort(k)}
        className={cn(
          "flex items-center gap-1.5 hover:text-foreground transition-colors uppercase font-bold tracking-wider",
          active ? "text-primary" : "text-muted-foreground",
          className
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Centro Visual Agentes
            </h2>
            <Badge variant="outline" className="text-[11px] font-medium bg-muted/30">
              {mpConfig.emoji} {mpConfig.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Desempeño, volumen, ranking y evolución por asesor.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar agente" className="h-9 pl-9 text-xs" />
          </div>
          <div className="sm:w-56">
            <MultiSelect
              options={agents.map((a) => ({ value: a, label: a }))}
              selected={multiAgents}
              onChange={setMultiAgents}
              allLabel="Todos los agentes"
              placeholder="Buscar agente"
            />
          </div>
          <div className="sm:w-56">
            <MultiSelect
              options={campaigns.map((c) => ({ value: c, label: c }))}
              selected={campaign}
              onChange={setCampaign}
              allLabel="Todas las campañas"
              placeholder="Buscar campaña"
            />
          </div>
          <Select value={periodMode} onValueChange={(v: PeriodMode) => setPeriodMode(v)}>
            <SelectTrigger className="h-9 sm:w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="day">Diario</SelectItem><SelectItem value="week">Semanal</SelectItem><SelectItem value="month">Mensual</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      {(selectedAgent !== "all" || selectedResult) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Filtros activos:</span>
          {selectedAgent !== "all" && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              Agente: {selectedAgent}
              <button onClick={() => onSelectedAgentChange(selectedAgent)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedResult && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              {mpConfig.resultColumnLabel}: {selectedResult}
              <button onClick={() => setSelectedResult(null)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard title="Agentes" value={String(metrics.length)} icon={Users} />
        <StatCard title="Interacciones" value={totalInteractions.toLocaleString()} icon={BarChart3} trend={volumeDelta !== null ? { value: `${volumeDelta > 0 ? "+" : ""}${volumeDelta}%`, positive: volumeDelta >= 0 } : undefined} />
        <StatCard title="Nota global" value={`${avgScore}%`} icon={Award} trend={scoreDelta !== null ? { value: `${scoreDelta > 0 ? "+" : ""}${scoreDelta}%`, positive: scoreDelta >= 0 } : undefined} />
        <StatCard title="Mejor agente" value={bestAgent ? `${bestAgent.avgScore}%` : "—"} subtitle={bestAgent?.name} icon={Medal} />
        <StatCard title="Volumen promedio" value={metrics.length ? Math.round(totalInteractions / metrics.length).toLocaleString() : "0"} icon={CalendarDays} />
      </div>

      {/* Resultados de la Operación (total periodo) — adaptable a la cuenta */}
      <ChartCard title={mpConfig.resultChartTitle} icon={<FileText className="h-4 w-4 text-primary" />}>
        {resultDistribution.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">Sin datos clasificados en el período</div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={resultDistribution} margin={{ bottom: 20, left: 4, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={110} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                cursor="pointer"
                onClick={(payload: { name?: string }) => {
                  if (!payload?.name) return;
                  setSelectedResult((prev) => (prev === payload.name ? null : (payload.name as string)));
                }}
              >
                {resultDistribution.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={categoryColorMap[entry.name] ?? COLORS[i % COLORS.length]}
                    opacity={!selectedResult || selectedResult === entry.name ? 1 : 0.35}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Ranking de agentes" icon={<Medal className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topAgents} layout="vertical" margin={{ left: 10, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" hide />
              <YAxis dataKey="shortName" type="category" width={120} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="avgScore" name="Nota" radius={[0, 6, 6, 0]} barSize={16}>{topAgents.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolución temporal" icon={<LineChartIcon className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="left" type="monotone" dataKey="nota" name="Nota" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="interacciones" name="Interacciones" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="Comparativo por volumen" icon={<BarChart3 className="h-4 w-4 text-primary" />} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topAgents}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="callCount" name="Llamadas" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="whatsappCount" name="WhatsApp" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Oportunidades de mejora</h3>
          <div className="space-y-2">
            {improvementAgents.map((agent, index) => (
              <button key={agent.name} onClick={() => onSelectedAgentChange(agent.name)} className="w-full rounded-lg border border-border bg-muted/15 p-3 text-left hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground truncate">{index + 1}. {agent.name}</span>
                  <span className={cn("text-sm font-bold", agent.avgScore >= 80 ? "text-success" : "text-destructive")}>{agent.avgScore}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{agent.count} interacciones · {agent.positivePct}% positivas</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Sentimiento por Agente" icon={<MessageCircle className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sentimentData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" height={36} />
              <Bar dataKey="Positivo" stackId="s" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Neutral" stackId="s" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Negativo" stackId="s" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Calidad por Canal (Nota %)" icon={<Target className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topAgents} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" height={36} />
              <Bar dataKey="avgCallScore" name="Nota Llamadas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgWhatsappScore" name="Nota WhatsApp" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Sentimiento por canal" icon={<MessageCircle className="h-4 w-4 text-primary" />}>
          {sentimentByChannelData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sentimentByChannelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="channel" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Positivo" stackId="s" fill="#10b981" />
                <Bar dataKey="Neutral" stackId="s" fill="#94a3b8" />
                <Bar dataKey="Negativo" stackId="s" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sentimiento por campaña (Top 10)" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
          {sentimentByCampaignData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sentimentByCampaignData} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="campaign" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} height={70} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Positivo" stackId="c" fill="#10b981" />
                <Bar dataKey="Neutral" stackId="c" fill="#94a3b8" />
                <Bar dataKey="Negativo" stackId="c" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Eficiencia: Volumen vs Calidad" icon={<BarChart3 className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" dataKey="x" name="Interacciones" unit="" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Nota" unit="%" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[60, 400]} />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} />
              <Scatter name="Agentes" data={efficiencyData} fill="#8b5cf6">
                {efficiencyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Actividad por Hora del Día" icon={<CalendarDays className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Interacciones" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Distribución de Volumen por Campaña" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campaignDist}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Interacciones" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Calidad Promedio por Campaña" icon={<Award className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campaignDist}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="avgScore" name="Nota Promedio" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <ChartCard title="Intensidad horaria y Contactación" icon={<Clock className="w-4 h-4 text-blue-600" />}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData.heatmap}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(val: number, name: string) => [name.includes("%") ? `${val}%` : val, name]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="calls" name="Llamadas" stackId="h" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="whatsapp" name="WhatsApp" stackId="h" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="contactRateGlobal" name="% Contacto General" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Volumen de Contacto Exitoso por Hora" icon={<Users className="w-4 h-4 text-emerald-600" />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData.heatmap}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="callsContacted" name="Voz (Responde)" stackId="c" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar dataKey="waContacted" name="WA (Responde)" stackId="c" fill="#059669" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Duración Promedio de Interacción por Hora" icon={<Clock className="w-4 h-4 text-orange-500" />}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData.heatmap}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(val: number) => [`${val} min`, "Promedio"]} />
              <Line type="monotone" dataKey="avgDurationMin" name="Minutos" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ========================================================================= */}
      {/* RANKING DETALLADO DE AGENTES - CONSERVADO EXACTAMENTE IGUAL SIN MODIFICAR */}
      {/* ========================================================================= */}
      <Card className="border border-border shadow-sm overflow-hidden flex flex-col min-h-[500px] max-h-[85vh] resize-y">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Medal className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Ranking Detallado de Agentes</h3>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
            {visibleMetrics.length} Agentes
          </Badge>
        </div>
        <div className="overflow-auto flex-1 relative">
          <Table>
            <TableHeader className="bg-muted/20 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-[10px] uppercase font-bold">
                  <SortButton k="name" label="Agente" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="count" label="Interacciones" className="mx-auto" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="callCount" label="Llamadas" className="mx-auto" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="whatsappCount" label="WhatsApp" className="mx-auto" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="avgCallScore" label="Nota Llamadas" className="mx-auto" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="avgWhatsappScore" label="Nota WhatsApp" className="mx-auto" />
                </TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-center">
                  <SortButton k="avgScore" label="Nota General" className="mx-auto" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMetrics.map((agent) => (
                <TableRow 
                  key={agent.name} 
                  className={cn(
                    "hover:bg-muted/10 transition-colors cursor-pointer",
                    selectedAgent === agent.name && "bg-primary/5 border-l-2 border-l-primary"
                  )} 
                  onClick={() => onSelectedAgentChange(agent.name)}
                >
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground">{agent.positivePct}% Positivas</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{agent.count}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{agent.callCount}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{agent.whatsappCount}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold",
                      agent.avgCallScore >= 80 ? "bg-success/10 text-success" : agent.avgCallScore >= 60 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                    )}>
                      {agent.avgCallScore > 0 ? `${agent.avgCallScore}%` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold",
                      agent.avgWhatsappScore >= 80 ? "bg-success/10 text-success" : agent.avgWhatsappScore >= 60 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                    )}>
                      {agent.avgWhatsappScore > 0 ? `${agent.avgWhatsappScore}%` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "text-sm font-black",
                        agent.avgScore >= 80 ? "text-success" : agent.avgScore >= 60 ? "text-warning" : "text-destructive"
                      )}>
                        {agent.avgScore}%
                      </span>
                      <div className="w-16 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            agent.avgScore >= 80 ? "bg-success" : agent.avgScore >= 60 ? "bg-warning" : "bg-destructive"
                          )} 
                          style={{ width: `${agent.avgScore}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      
      {/* Spacer */}
      <div className="h-20" />
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, trend, className }: { title: string; value: string; subtitle?: string; icon: any; trend?: { value: string; positive: boolean }; className?: string }) {
  return (
    <Card className={cn("p-3 border border-border shadow-sm flex flex-col justify-between overflow-hidden relative", className)}>
      <div className="flex items-center justify-between gap-2 relative z-10">
        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{title}</p>
        <div className="p-1.5 rounded-lg bg-primary/5 text-primary"><Icon className="h-3 w-3" /></div>
      </div>
      <div className="mt-2 relative z-10">
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-black text-foreground tracking-tight">{value}</p>
          {trend && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{trend.value}</span>}
        </div>
        {subtitle && <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">{subtitle}</p>}
      </div>
    </Card>
  );
}

function ChartCard({ title, icon, children, className }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 border border-border shadow-sm", className)}>
      <div className="flex items-center gap-2 mb-6">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </Card>
  );
}
