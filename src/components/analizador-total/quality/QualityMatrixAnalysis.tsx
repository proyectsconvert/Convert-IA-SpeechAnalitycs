import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/contexts/AccountContext";
import { useQualityEvaluations, useEvaluationDetail, useEvaluateInteractions } from "@/hooks/useQualityEvaluations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Trophy, AlertTriangle, Phone, MessageCircle, Users, TrendingUp,
  Search, ArrowUpDown, Target, Award, BarChart3, Medal, ClipboardCheck, FileText, Sparkles, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, PieChart, Pie } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { InteractionDetailPanel } from "@/components/analizador-total/InteractionDetailPanel";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#ec4899"];
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

interface Props {
  rawData?: AnalizadorUnifiedRow[];
}

/** Encuentra el agente EXT en una fila unificada (busca cualquier columna ext_* con "asesor"/"agente"). */
function pickExtAgent(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const keys = Object.keys(row).filter((k) => k.startsWith("ext_"));
  // Preferencia: columnas EXT que contengan "asesor"/"agente" y no contengan "campa"/"mensaje"
  const found = keys.find((k) => {
    const b = norm(k.slice(4));
    if (b.includes("campa") || b.includes("mensaje")) return false;
    return b.includes("asesor") || b.includes("agente");
  });
  if (!found) return null;
  const v = row[found];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

type RankRow = {
  name: string;
  count: number;
  avg: number;
  crits: number;
  excelente: number;
  bajo: number;
  callCount: number;
  waCount: number;
  callAvg: number;
  waAvg: number;
  callCrits: number;
  waCrits: number;
  _callSum: number;
  _waSum: number;
};

type SortKey = keyof RankRow | "name";
type Direction = "asc" | "desc";

export function QualityMatrixAnalysis({ rawData = [] }: Props) {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const { data: evals, isLoading } = useQualityEvaluations(accountId);
  const evaluateMutation = useEvaluateInteractions(accountId);
  const qc = useQueryClient();

  const handleRunEvaluation = async (forceAll = false) => {
    try {
      toast.loading(forceAll ? "Reevaluando interacciones..." : "Evaluando interacciones pendientes con la matriz activa...", { id: "eval-quality" });
      const res = await evaluateMutation.mutateAsync({ forceAll });
      qc.invalidateQueries({ queryKey: ["quality-evaluations", accountId] });
      toast.success(res.message, { id: "eval-quality" });
    } catch (e: any) {
      toast.error(e?.message || "Error al evaluar interacciones", { id: "eval-quality" });
    }
  };

  const [agentQuery, setAgentQuery] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]); // [] = todos
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]); // [] = todos
  const [selectedScores, setSelectedScores] = useState<string[]>([]); // [] = todos
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [matrixDialogEvalId, setMatrixDialogEvalId] = useState<string | null>(null);
  const [rankSort, setRankSort] = useState<{ key: SortKey; dir: Direction }>({ key: "avg", dir: "desc" });
  const [interSort, setInterSort] = useState<{ key: string; dir: Direction }>({ key: "created_at", dir: "desc" });
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  // Filtro de fechas (independiente del filtro global)
  type DatePreset = "all" | "today" | "7d" | "15d" | "30d" | "month" | "lastMonth" | "custom";
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const dateRange = useMemo<{ from: Date | null; to: Date | null }>(() => {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: endOfDay(now) };
      case "7d": { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to: endOfDay(now) }; }
      case "15d": { const f = new Date(now); f.setDate(f.getDate() - 14); return { from: startOfDay(f), to: endOfDay(now) }; }
      case "30d": { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: startOfDay(f), to: endOfDay(now) }; }
      case "month": return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
      case "lastMonth": {
        const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const t = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: startOfDay(f), to: endOfDay(t) };
      }
      case "custom": return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
      default: return { from: null, to: null };
    }
  }, [datePreset, customFrom, customTo]);

  // Mapa rawId → fila unificada (para resolver EXT)
  const rowsById = useMemo(() => {
    const m = new Map<string, AnalizadorUnifiedRow>();
    rawData.forEach((r) => {
      if (r.channel === "call") m.set(`call:${r.id}`, r);
      if (r.channel === "whatsapp" && r.waConversationId) m.set(`wa:${r.waConversationId}`, r);
    });
    return m;
  }, [rawData]);

  /** Enriquecidos con el asesor EXT, la fila unificada y nombre de archivo/chat. */
  const enriched = useMemo(() => {
    return (evals ?? []).map((e) => {
      const key = e.source_type === "call"
        ? `call:${e.audio_file_id}`
        : `wa:${e.whatsapp_conversation_id}`;
      const row = rowsById.get(key);
      const rowRec = row as unknown as Record<string, unknown> | undefined;
      const extAgent = pickExtAgent(rowRec);
      const rowAgent = row && typeof row.agent === "string" ? row.agent : null;
      const agent = extAgent || rowAgent || e.agent_name || "Sin asesor";
      const file_name = row?.file_name || (e.source_type === "call" ? "Llamada" : "Conversación WhatsApp");
      return { ...e, agent, row, file_name };
    });
  }, [evals, rowsById]);

  const allAgents = useMemo(
    () => Array.from(new Set(enriched.map((e) => e.agent))).sort(),
    [enriched],
  );

  const filtered = useMemo(() => {
    const agentSet = new Set(selectedAgents);
    const chanSet = new Set(selectedChannels);
    const scoreSet = new Set(selectedScores);
    const fromMs = dateRange.from ? dateRange.from.getTime() : null;
    const toMs = dateRange.to ? dateRange.to.getTime() : null;
    return enriched.filter((e) => {
      if (fromMs !== null || toMs !== null) {
        const t = new Date(e.created_at).getTime();
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
      if (selectedAgents.length > 0 && !agentSet.has(e.agent)) return false;
      if (selectedChannels.length > 0 && !chanSet.has(e.source_type)) return false;
      if (selectedScores.length > 0) {
        const p = Number(e.percent_score);
        const isCrit = e.has_critical_error || p < 50;
        const bucket = isCrit ? "critico" : p < 70 ? "bajo" : p < 85 ? "estandar" : "excelente";
        if (!scoreSet.has(bucket)) return false;
      }
      return true;
    });
  }, [enriched, selectedAgents, selectedChannels, selectedScores, dateRange]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const avg = total ? Math.round((filtered.reduce((s, e) => s + Number(e.percent_score), 0) / total) * 10) / 10 : 0;
    const crits = filtered.filter((e) => e.has_critical_error).length;
    const agents = new Set(filtered.map((e) => e.agent)).size;
    const excel = filtered.filter((e) => !e.has_critical_error && Number(e.percent_score) >= 85).length;
    return { total, avg, crits, agents, excel };
  }, [filtered]);

  /** Métricas separadas por canal (Llamadas vs WhatsApp). */
  const channelMetrics = useMemo(() => {
    const make = (list: typeof filtered) => {
      const total = list.length;
      const avg = total ? Math.round((list.reduce((s, e) => s + Number(e.percent_score), 0) / total) * 10) / 10 : 0;
      const crits = list.filter((e) => e.has_critical_error).length;
      const excel = list.filter((e) => !e.has_critical_error && Number(e.percent_score) >= 85).length;
      const agents = new Set(list.map((e) => e.agent)).size;
      return { total, avg, crits, excel, agents };
    };
    return {
      call: make(filtered.filter((e) => e.source_type === "call")),
      whatsapp: make(filtered.filter((e) => e.source_type === "whatsapp")),
    };
  }, [filtered]);

  const ranking: RankRow[] = useMemo(() => {
    const map = new Map<string, RankRow>();
    filtered.forEach((e) => {
      const cur = map.get(e.agent) ?? {
        name: e.agent, count: 0, avg: 0, crits: 0, excelente: 0, bajo: 0,
        callCount: 0, waCount: 0, callAvg: 0, waAvg: 0, callCrits: 0, waCrits: 0,
        _callSum: 0, _waSum: 0,
      };
      const score = Number(e.percent_score);
      cur.count += 1;
      cur.avg += score;
      if (e.has_critical_error) cur.crits += 1;
      if (!e.has_critical_error && score >= 85) cur.excelente += 1;
      if (e.has_critical_error || score < 70) cur.bajo += 1;
      if (e.source_type === "call") {
        cur.callCount += 1; cur._callSum += score; if (e.has_critical_error) cur.callCrits += 1;
      } else {
        cur.waCount += 1; cur._waSum += score; if (e.has_critical_error) cur.waCrits += 1;
      }
      map.set(e.agent, cur);
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      avg: Math.round((r.avg / r.count) * 10) / 10,
      callAvg: r.callCount ? Math.round((r._callSum / r.callCount) * 10) / 10 : 0,
      waAvg: r.waCount ? Math.round((r._waSum / r.waCount) * 10) / 10 : 0,
    }));
  }, [filtered]);

  const sortedRanking = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    let list = ranking.filter((r) => !q || r.name.toLowerCase().includes(q));
    const { key, dir } = rankSort;
    list = [...list].sort((a, b) => {
      const av = (a as any)[key];
      const bv = (b as any)[key];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [ranking, rankSort, agentQuery]);

  const sortedInteractions = useMemo(() => {
    const list = [...filtered];
    const { key, dir } = interSort;
    list.sort((a, b) => {
      const av: any = (a as any)[key];
      const bv: any = (b as any)[key];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, interSort]);

  // Pagination derived
  const totalInteractions = sortedInteractions.length;
  const totalPages = Math.max(1, Math.ceil(totalInteractions / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedInteractions = useMemo(
    () => sortedInteractions.slice(pageStart, pageStart + pageSize),
    [sortedInteractions, pageStart, pageSize],
  );

  useEffect(() => { setPage(1); }, [selectedAgents, selectedChannels, selectedScores, interSort, pageSize, totalInteractions, dateRange]);

  const buckets = useMemo(() => {
    const b = { excelente: 0, estandar: 0, bajo: 0, critico: 0 };
    filtered.forEach((e) => {
      const p = Number(e.percent_score);
      if (e.has_critical_error || p < 50) b.critico++;
      else if (p < 70) b.bajo++;
      else if (p < 85) b.estandar++;
      else b.excelente++;
    });
    return b;
  }, [filtered]);

  const trend = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; crits: number }>();
    filtered.forEach((e) => {
      const k = format(new Date(e.created_at), "dd MMM", { locale: es });
      const cur = map.get(k) ?? { sum: 0, count: 0, crits: 0 };
      cur.sum += Number(e.percent_score);
      cur.count += 1;
      if (e.has_critical_error) cur.crits += 1;
      map.set(k, cur);
    });
    return Array.from(map.entries()).map(([period, v]) => ({
      period,
      nota: Math.round((v.sum / v.count) * 10) / 10,
      interacciones: v.count,
      criticos: v.crits,
    }));
  }, [filtered]);

  const topAgents = useMemo(() => sortedRanking.slice(0, 8).map((r) => ({
    ...r,
    shortName: r.name.length > 16 ? r.name.slice(0, 16) + "…" : r.name,
  })), [sortedRanking]);

  const distData = useMemo(() => ([
    { name: "Excelente", value: buckets.excelente, color: "#10b981" },
    { name: "Estándar", value: buckets.estandar, color: "#3b82f6" },
    { name: "Bajo", value: buckets.bajo, color: "#f59e0b" },
    { name: "Crítico", value: buckets.critico, color: "#ef4444" },
  ]).filter((d) => d.value > 0), [buckets]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!evals?.length) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Aún no hay interacciones evaluadas</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Las llamadas y conversaciones cargadas pueden ser evaluadas automáticamente contra la matriz de calidad activa con IA.
            </p>
          </div>
          <Button
            onClick={() => handleRunEvaluation(false)}
            disabled={evaluateMutation.isPending}
            className="rounded-lg text-xs"
          >
            {evaluateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Evaluar Interacciones Pendientes con la Matriz
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header de filtros */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Análisis de Calidad
            </h2>
            <Badge variant="outline" className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20">
              {evals.length} Evaluaciones
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Calificaciones, ranking de asesores y desglose por interacción.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRunEvaluation(false)}
            disabled={evaluateMutation.isPending}
            className="h-9 text-xs"
            title="Evalúa llamadas o chats que aún no tienen calificación en la matriz"
          >
            {evaluateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />}
            Evaluar Pendientes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm("¿Deseas reevaluar todas las interacciones con la versión activa de la matriz?")) {
                handleRunEvaluation(true);
              }
            }}
            disabled={evaluateMutation.isPending}
            className="h-9 text-xs text-muted-foreground hover:text-foreground"
            title="Reevalúa todas las interacciones con la matriz actual"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reevaluar Todo
          </Button>
          <div className="relative sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} placeholder="Buscar asesor" className="h-9 pl-9 text-xs" />
          </div>
          <div className="sm:w-52">
            <MultiSelect
              options={allAgents.map((a) => ({ value: a, label: a }))}
              selected={selectedAgents}
              onChange={setSelectedAgents}
              allLabel="Todos los asesores"
              placeholder="Buscar asesor"
            />
          </div>
          <div className="sm:w-40">
            <MultiSelect
              options={[
                { value: "call", label: "Llamadas" },
                { value: "whatsapp", label: "WhatsApp" },
              ]}
              selected={selectedChannels}
              onChange={setSelectedChannels}
              allLabel="Todos los canales"
              searchable={false}
            />
          </div>
          <div className="sm:w-44">
            <MultiSelect
              options={[
                { value: "excelente", label: "Excelente (≥85%)" },
                { value: "estandar", label: "Estándar (70–85%)" },
                { value: "bajo", label: "Bajo (50–70%)" },
                { value: "critico", label: "Crítico (<50% o crít.)" },
              ]}
              selected={selectedScores}
              onChange={setSelectedScores}
              allLabel="Todos los rangos"
              searchable={false}
            />
          </div>
        </div>
      </div>

      {/* Filtros de fecha */}
      <div className="rounded-xl border border-border bg-card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <p className="text-xs font-medium text-muted-foreground shrink-0">Periodo</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["all", "Todos"],
            ["today", "Hoy"],
            ["7d", "7 Días"],
            ["15d", "15 Días"],
            ["30d", "30 Días"],
            ["month", "Este Mes"],
            ["lastMonth", "Mes Pasado"],
            ["custom", "Personalizado"],
          ] as const).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={datePreset === k ? "default" : "outline"}
              className="h-7 text-xs px-3 rounded-full"
              onClick={() => setDatePreset(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        {datePreset === "custom" && (
          <div className="flex items-center gap-2 lg:ml-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs w-[150px]" />
            <span className="text-xs text-muted-foreground">a</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs w-[150px]" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard icon={TrendingUp} label="Score promedio" value={`${kpis.avg}%`} accent="text-emerald-600 bg-emerald-500/10" />
        <KpiCard icon={Trophy} label="Interacciones" value={String(kpis.total)} accent="text-violet-600 bg-violet-500/10" />
        <KpiCard icon={Users} label="Asesores" value={String(kpis.agents)} accent="text-blue-600 bg-blue-500/10" />
        <KpiCard icon={Award} label="Excelentes" value={String(kpis.excel)} accent="text-cyan-600 bg-cyan-500/10" />
        <KpiCard icon={AlertTriangle} label="Errores críticos" value={String(kpis.crits)} accent="text-red-600 bg-red-500/10" />
      </div>

      {/* Métricas separadas por canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChannelStatsCard
          title="Llamadas"
          icon={<Phone className="w-4 h-4" />}
          accentBg="bg-blue-500/10"
          accentText="text-blue-600"
          stats={channelMetrics.call}
        />
        <ChannelStatsCard
          title="WhatsApp"
          icon={<MessageCircle className="w-4 h-4" />}
          accentBg="bg-emerald-500/10"
          accentText="text-emerald-600"
          stats={channelMetrics.whatsapp}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Ranking de calidad (top 8)" icon={<Medal className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topAgents} layout="vertical" margin={{ left: 10, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis dataKey="shortName" type="category" width={120} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
              <Bar dataKey="avg" name="Score" radius={[0, 6, 6, 0]} barSize={16}>
                {topAgents.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolución temporal" icon={<BarChart3 className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} />
              <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="l" type="monotone" dataKey="nota" name="Score %" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line yAxisId="r" type="monotone" dataKey="interacciones" name="Interacciones" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="criticos" name="Críticos" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="Distribución de calidad" icon={<Target className="h-4 w-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={distData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {distData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Volumen por canal y asesor" icon={<BarChart3 className="h-4 w-4 text-primary" />} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topAgents}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} height={50} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="callCount" name="Llamadas" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="waCount" name="WhatsApp" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tabla 1: Ranking asesores */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><Medal className="h-4 w-4 text-primary" /> Ranking de asesores</CardTitle>
          <span className="text-xs text-muted-foreground">{sortedRanking.length} asesores</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <SortableHead label="Asesor" k="name" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Total" k="count" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Llamadas" k="callCount" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Nota Llamadas" k="callAvg" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="WhatsApp" k="waCount" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Nota WhatsApp" k="waAvg" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Score global" k="avg" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Excelentes" k="excelente" sort={rankSort} onSort={setRankSort} />
                  <SortableHead label="Críticos" k="crits" sort={rankSort} onSort={setRankSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRanking.map((r, i) => (
                  <TableRow key={r.name}
                    className={cn("cursor-pointer hover:bg-muted/40", selectedAgents.includes(r.name) && "bg-primary/5")}
                    onClick={() => setSelectedAgents((cur) => (cur.includes(r.name) ? cur.filter((n) => n !== r.name) : [...cur, r.name]))}>
                    <TableCell className="font-bold">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.count}</TableCell>
                    <TableCell>{r.callCount}</TableCell>
                    <TableCell>{r.callCount ? <ScoreBadge value={r.callAvg} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{r.waCount}</TableCell>
                    <TableCell>{r.waCount ? <ScoreBadge value={r.waAvg} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><ScoreBadge value={r.avg} /></TableCell>
                    <TableCell><span className="text-emerald-600 font-medium">{r.excelente}</span></TableCell>
                    <TableCell>{r.crits > 0 ? <Badge variant="destructive">{r.crits}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Tabla 2: Interacciones */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Interacciones evaluadas
            {selectedAgents.length > 0 && <Badge variant="outline" className="ml-2 text-[10px]">{selectedAgents.length === 1 ? selectedAgents[0] : `${selectedAgents.length} asesores`}</Badge>}
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Mostrar</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 40, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>de {totalInteractions}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <SortableHead label="Fecha" k="created_at" sort={interSort} onSort={setInterSort} />
                  <SortableHead label="Canal" k="source_type" sort={interSort} onSort={setInterSort} />
                  <SortableHead label="Nombre" k="file_name" sort={interSort} onSort={setInterSort} />
                  <SortableHead label="Asesor" k="agent" sort={interSort} onSort={setInterSort} />
                  <SortableHead label="Score" k="percent_score" sort={interSort} onSort={setInterSort} />
                  <SortableHead label="Crítico" k="has_critical_error" sort={interSort} onSort={setInterSort} />
                  <TableHead className="uppercase text-xs font-bold tracking-wider text-muted-foreground">Resumen</TableHead>
                  <TableHead className="uppercase text-xs font-bold tracking-wider text-muted-foreground text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInteractions.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedEvalId(e.id)}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(e.created_at), "PP HH:mm", { locale: es })}</TableCell>
                    <TableCell>
                      {e.source_type === "call"
                        ? <span className="inline-flex items-center gap-1 text-xs"><Phone className="w-3.5 h-3.5" />Llamada</span>
                        : <span className="inline-flex items-center gap-1 text-xs"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</span>}
                    </TableCell>
                    <TableCell className="text-xs font-medium max-w-[260px] truncate" title={e.file_name}>
                      <span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-muted-foreground" />{e.file_name}</span>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{e.agent}</TableCell>
                    <TableCell><Badge variant={e.percent_score >= 85 ? "default" : e.percent_score >= 70 ? "secondary" : "destructive"}>{e.percent_score}%</Badge></TableCell>
                    <TableCell>{e.has_critical_error ? <Badge variant="destructive">Sí</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">{e.summary || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={(ev) => { ev.stopPropagation(); setMatrixDialogEvalId(e.id); }}
                      >
                        <ClipboardCheck className="w-3 h-3 mr-1" /> Ver matriz
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedInteractions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                      Sin interacciones para los filtros actuales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Paginador */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {totalInteractions === 0
                ? "0 resultados"
                : `Mostrando ${pageStart + 1}–${Math.min(pageStart + pageSize, totalInteractions)} de ${totalInteractions}`}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={currentPage <= 1} onClick={() => setPage(1)}>«</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-xs font-medium px-2">Página {currentPage} / {totalPages}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Panel lateral: detalle completo de la interacción */}
      <Sheet open={!!selectedEvalId} onOpenChange={(o) => !o && setSelectedEvalId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col">
          {(() => {
            const ev = enriched.find((x) => x.id === selectedEvalId);
            if (!ev) return null;
            return (
              <>
                <SheetHeader className="px-6 py-4 border-b flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <SheetTitle className="text-base truncate">{ev.file_name}</SheetTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {ev.source_type === "call" ? "Llamada" : "WhatsApp"}
                      </Badge>
                      <Badge variant={ev.percent_score >= 85 ? "default" : ev.percent_score >= 70 ? "secondary" : "destructive"} className="text-[10px]">
                        Calidad: {ev.percent_score}%
                      </Badge>
                      {ev.has_critical_error && <Badge variant="destructive" className="text-[10px]">Error crítico</Badge>}
                      <span className="text-[10px] text-muted-foreground">{ev.agent}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setMatrixDialogEvalId(ev.id)} className="shrink-0">
                    <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Ver matriz
                  </Button>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {ev.row
                    ? <InteractionDetailPanel row={ev.row} />
                    : <div className="p-6 text-sm text-muted-foreground">
                        No se encontró la conversación enlazada. Mostrando solo el resumen de la evaluación.
                        <p className="mt-3 text-xs">{ev.summary}</p>
                      </div>}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Dialog: Detalle de la matriz por item */}
      <Dialog open={!!matrixDialogEvalId} onOpenChange={(o) => !o && setMatrixDialogEvalId(null)}>
        <DialogContent className="max-w-3xl p-0 gap-0 h-[85vh] grid grid-rows-[auto_1fr] overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="w-4 h-4 text-primary" /> Evaluación de Calidad
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            {matrixDialogEvalId && <EvaluationDetail evaluationId={matrixDialogEvalId} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead<T extends string>({ label, k, sort, onSort }: {
  label: string;
  k: T;
  sort: { key: string; dir: Direction };
  onSort: (s: { key: T; dir: Direction }) => void;
}) {
  const active = sort.key === k;
  return (
    <TableHead>
      <button
        onClick={() => onSort({ key: k, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        className={cn("flex items-center gap-1.5 uppercase font-bold tracking-wider text-xs hover:text-foreground transition-colors",
          active ? "text-primary" : "text-muted-foreground")}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", accent)}><Icon className="w-5 h-5" /></div>
      <div><p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p><p className="text-xl font-black">{value}</p></div>
    </CardContent></Card>
  );
}

function ChartCard({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 space-y-3", className)}>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

function ScoreBadge({ value }: { value: number }) {
  return (
    <Badge variant={value >= 85 ? "default" : value >= 70 ? "secondary" : "destructive"}>
      {value}%
    </Badge>
  );
}

function ChannelStatsCard({
  title, icon, accentBg, accentText, stats,
}: {
  title: string;
  icon: React.ReactNode;
  accentBg: string;
  accentText: string;
  stats: { total: number; avg: number; crits: number; excel: number; agents: number };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg, accentText)}>
            {icon}
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Canal</p>
            <p className="text-sm font-bold">{title}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Nota promedio</p>
          <p className={cn("text-2xl font-black", stats.total === 0 ? "text-muted-foreground" : accentText)}>
            {stats.total ? `${stats.avg}%` : "—"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Interacciones" value={stats.total} />
        <MiniStat label="Asesores" value={stats.agents} />
        <MiniStat label="Excelentes" value={stats.excel} className="text-emerald-600" />
        <MiniStat label="Críticos" value={stats.crits} className={stats.crits > 0 ? "text-red-600" : ""} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("text-base font-black", className)}>{value}</p>
    </div>
  );
}

function EvaluationDetail({ evaluationId }: { evaluationId: string }) {
  const { data: items, isLoading } = useEvaluationDetail(evaluationId);
  if (isLoading) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  const grouped = (items ?? []).reduce<Record<string, typeof items>>((acc, it) => {
    const k = it.section_name || "Sin sección";
    (acc[k] ||= [] as any).push(it);
    return acc;
  }, {});
  return (
    <div className="p-6 space-y-5">
      <h2 className="text-lg font-black">Evaluación de Calidad</h2>
        {Object.entries(grouped).map(([section, list]) => (
          <div key={section} className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{section}</h3>
            {(list ?? []).map((it) => (
              <div key={it.id} className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{it.attribute}{it.sub_attribute ? ` · ${it.sub_attribute}` : ""}</p>
                  <Badge variant={it.status === "cumple" ? "default" : it.status === "critico" ? "destructive" : it.status === "no_cumple" ? "secondary" : "outline"}>
                    {it.status === "cumple" ? "Cumple" : it.status === "no_cumple" ? "No cumple" : it.status === "critico" ? "Crítico" : "N/A"} · {it.score}/{it.max_score}
                  </Badge>
                </div>
                {it.observation && <p className="text-xs text-muted-foreground">{it.observation}</p>}
              </div>
            ))}
          </div>
        ))}
    </div>

  );
}
