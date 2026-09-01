import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Clock,
  FileText,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Award,
  Target,
  ShieldCheck,
  Calendar,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";
import type { ChartDataBundle, DailyChannelRow, StatsBundle } from "@/lib/analizador-total/deriveData";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { deltaPct, buildSentimentByChannel, buildSentimentByCampaign } from "@/lib/analizador-total/deriveData";
import { MultiSelect } from "@/components/ui/multi-select";
import { getMacroprocesoConfig, classifyOperationResult } from "@/lib/analizador-total/macroprocesoConfigs";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#64748b", "#06b6d4", "#ec4899"];

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
  background: "hsl(var(--card))",
  fontSize: "11px",
};

interface Props {
  chartData: ChartDataBundle;
  stats: StatsBundle;
  statsPrev: StatsBundle;
  filteredData: AnalizadorUnifiedRow[];
  selectedChannels: string[]; // [] = todos
  onSelectedChannelsChange: (v: string[]) => void;
  campaigns: string[];
  selectedCampaigns: string[]; // [] = todas
  onSelectedCampaignsChange: (v: string[]) => void;
  onGoToReportIa: () => void;
  hideIAReport?: boolean;
  macroproceso?: string;
}

interface AgentStat {
  name: string;
  fullName: string;
  count: number;
  avgScore: number;
  positivePct: number;
}

const KPI_ICON_MAP = {
  phone: Phone,
  message: MessageCircle,
  "trending-up": TrendingUp,
  sparkles: Sparkles,
  clock: Clock,
  award: Award,
  target: Target,
  users: Users,
  "bar-chart": BarChart3,
  "shield-check": ShieldCheck,
  calendar: Calendar,
  "check-circle": CheckCircle,
};

export function CentroVisualTab({
  chartData,
  stats,
  statsPrev,
  filteredData,
  selectedChannels,
  onSelectedChannelsChange,
  campaigns,
  selectedCampaigns,
  onSelectedCampaignsChange,
  onGoToReportIa,
  hideIAReport = false,
  macroproceso = "ventas",
}: Props) {
  const [insightLoading, setInsightLoading] = useState(false);

  const mpConfig = useMemo(() => getMacroprocesoConfig(macroproceso), [macroproceso]);
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    mpConfig.categories.forEach((cat, i) => {
      map[cat.name] = cat.color || COLORS[i % COLORS.length];
    });
    return map;
  }, [mpConfig]);

  // Filtros locales por click sobre gráficas (agente, resultado/operacion, sentimiento, campaña)
  const [clickAgent, setClickAgent] = useState<string | null>(null);
  const [clickResult, setClickResult] = useState<string | null>(null);
  const [clickSentiment, setClickSentiment] = useState<string | null>(null);
  const [clickCampaign, setClickCampaign] = useState<string | null>(null);

  const scopedData = useMemo(() => {
    let rows = filteredData;
    if (clickAgent) rows = rows.filter((r) => (r.agent || "Desconocido") === clickAgent);
    if (clickCampaign) rows = rows.filter((r) => (r.campaign || "Sin campaña") === clickCampaign);
    if (clickSentiment) {
      const s = clickSentiment.toLowerCase();
      rows = rows.filter((r) => {
        const v = (r.sentiment || "neutral").toLowerCase();
        if (s === "positivo") return v === "positive";
        if (s === "negativo") return v === "negative";
        return v === "neutral";
      });
    }
    if (clickResult) {
      rows = rows.filter((r) => {
        const res = classifyOperationResult(r as any, macroproceso);
        return res === clickResult;
      });
    }
    return rows;
  }, [filteredData, clickAgent, clickResult, clickSentiment, clickCampaign, macroproceso]);

  const hasClickFilters = !!(clickAgent || clickResult || clickSentiment || clickCampaign);
  const clearAllClickFilters = () => {
    setClickAgent(null);
    setClickResult(null);
    setClickSentiment(null);
    setClickCampaign(null);
  };

  const volDelta = deltaPct(stats.total, statsPrev.total);

  // Desglose por canal de resultados de operación
  const resultCardsCall = useMemo(() => {
    const init: Record<string, number> = Object.fromEntries(mpConfig.categories.map((c) => [c.name, 0]));
    scopedData
      .filter((r) => r.channel === "call")
      .forEach((r) => {
        const c = classifyOperationResult(r as any, macroproceso);
        if (c in init) init[c]++;
        else if (init["Otros"] != null) init["Otros"]++;
      });
    return init;
  }, [scopedData, mpConfig, macroproceso]);

  const resultCardsWa = useMemo(() => {
    const init: Record<string, number> = Object.fromEntries(mpConfig.categories.map((c) => [c.name, 0]));
    scopedData
      .filter((r) => r.channel === "whatsapp")
      .forEach((r) => {
        const c = classifyOperationResult(r as any, macroproceso);
        if (c in init) init[c]++;
        else if (init["Otros"] != null) init["Otros"]++;
      });
    return init;
  }, [scopedData, mpConfig, macroproceso]);

  // Distribución total de Resultados de Operación (alimenta el dashboard con click-filter)
  const localResultDistribution = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(mpConfig.categories.map((c) => [c.name, 0]));
    scopedData.forEach((r) => {
      const c = classifyOperationResult(r as any, macroproceso);
      counts[c] = (counts[c] ?? 0) + 1;
    });
    return mpConfig.categories
      .map((cat) => ({ name: cat.name, value: counts[cat.name] ?? 0 }))
      .filter((d) => d.value > 0);
  }, [scopedData, mpConfig, macroproceso]);

  const topAgents: AgentStat[] = useMemo(() => {
    const map = new Map<string, { count: number; scoreSum: number; positive: number; fullName: string }>();
    scopedData.forEach((r) => {
      const ag = r.agent || "Desconocido";
      const prev = map.get(ag) ?? { count: 0, scoreSum: 0, positive: 0, fullName: ag };
      prev.count++;
      prev.scoreSum += r.score || 0;
      if (r.sentiment === "positive") prev.positive++;
      map.set(ag, prev);
    });
    return Array.from(map.entries())
      .map(([name, v]) => {
        const avgRaw = v.scoreSum / v.count;
        const avgPct = Math.round(avgRaw <= 1.5 ? avgRaw * 100 : avgRaw);
        return {
          name: name.length > 14 ? name.slice(0, 14) + "…" : name,
          fullName: v.fullName,
          count: v.count,
          avgScore: avgPct,
          positivePct: Math.round((v.positive / v.count) * 100),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [scopedData]);

  const campaignDist = useMemo(() => {
    const map = new Map<string, { value: number; fullName: string }>();
    scopedData.forEach((r) => {
      if (r.campaign) {
        const prev = map.get(r.campaign) ?? { value: 0, fullName: r.campaign };
        prev.value += 1;
        map.set(r.campaign, prev);
      }
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name: name.length > 18 ? name.slice(0, 18) + "…" : name, value: v.value, fullName: v.fullName }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [scopedData]);

  const channelMode: "all" | "call" | "whatsapp" = useMemo(() => {
    if (selectedChannels.length === 0) return "all";
    if (selectedChannels.length === 1 && selectedChannels[0] === "call") return "call";
    if (selectedChannels.length === 1 && selectedChannels[0] === "whatsapp") return "whatsapp";
    return "all";
  }, [selectedChannels]);

  const dailyForChart =
    channelMode === "all"
      ? chartData.dailyChannels
      : chartData.dailyChannels.map((d: DailyChannelRow) => {
          if (channelMode === "call") return { ...d, waPos: 0, waNeg: 0, waNeu: 0 };
          return { ...d, callPos: 0, callNeg: 0, callNeu: 0 };
        });

  const sentimentByChannelData = useMemo(() => buildSentimentByChannel(scopedData), [scopedData]);
  const sentimentByCampaignData = useMemo(() => buildSentimentByCampaign(scopedData, 10), [scopedData]);

  return (
    <div className="space-y-5">
      {/* Filtros del tablero */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px] gap-1 font-medium bg-muted/30">
            <span>{mpConfig.emoji}</span> {mpConfig.label}
          </Badge>
          <p className="text-xs font-medium text-muted-foreground">
            Filtros del tablero <span className="text-[10px]">(no modifican datos maestros)</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="w-[180px]">
            <MultiSelect
              options={[
                { value: "call", label: "Llamadas" },
                { value: "whatsapp", label: "WhatsApp" },
              ]}
              selected={selectedChannels}
              onChange={onSelectedChannelsChange}
              allLabel="Todos los canales"
              searchable={false}
            />
          </div>
          {campaigns.length > 0 && (
            <div className="w-[220px]">
              <MultiSelect
                options={campaigns.map((c) => ({ value: c, label: c }))}
                selected={selectedCampaigns}
                onChange={onSelectedCampaignsChange}
                allLabel="Todas las campañas"
                placeholder="Buscar campaña"
              />
            </div>
          )}
        </div>
      </div>

      {/* Chips de filtros por click */}
      {hasClickFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Filtros activos:</span>
          {clickAgent && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              Agente: {clickAgent}
              <button onClick={() => setClickAgent(null)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {clickResult && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              {mpConfig.resultColumnLabel}: {clickResult}
              <button onClick={() => setClickResult(null)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {clickSentiment && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              Sentimiento: {clickSentiment}
              <button onClick={() => setClickSentiment(null)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {clickCampaign && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              Campaña: {clickCampaign}
              <button onClick={() => setClickCampaign(null)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={clearAllClickFilters}>Limpiar todo</Button>
        </div>
      )}

      {/* KPIs Dinámicos -- 5 cards adaptadas a la operación */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {mpConfig.kpis.map((kpiDef) => {
          const IconComp = KPI_ICON_MAP[kpiDef.iconName] || BarChart3;
          const val = kpiDef.getValue(stats, scopedData, statsPrev);
          const trend = kpiDef.getTrend ? kpiDef.getTrend(stats, scopedData, statsPrev) : undefined;
          return (
            <StatCard
              key={kpiDef.id}
              title={kpiDef.title}
              value={val}
              icon={IconComp}
              trend={trend}
            />
          );
        })}
      </div>

      {/* Tarjetas Resultados / Intenciones por canal (Voz vs WhatsApp) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> {mpConfig.resultBreakdownTitle}
        </h3>
        <OperationMiniCards title="Llamadas" counts={resultCardsCall} categories={mpConfig.categories} icon={Phone} />
        <OperationMiniCards title="WhatsApp" counts={resultCardsWa} categories={mpConfig.categories} icon={MessageCircle} />
      </div>

      {/* Row 1: Sentimiento + Volumen por canal */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Sentimiento por día" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData.sentiment}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="positive" name="Positivo" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="negative" name="Negativo" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="neutral" name="Neutral" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Volumen por canal y día" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyForChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="callPos" name="Voz +" stackId="a" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
              <Area type="monotone" dataKey="callNeg" name="Voz −" stackId="b" stroke="#64748b" fill="#64748b" fillOpacity={0.1} />
              <Area type="monotone" dataKey="waPos" name="WA +" stackId="c" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
              <Area type="monotone" dataKey="waNeg" name="WA −" stackId="d" stroke="#f97316" fill="#f97316" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 1B: Sentimiento por canal + Sentimiento por campaña (con click-to-filter) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Sentimiento por canal" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
          {sentimentByChannelData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">Sin datos en el período seleccionado</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sentimentByChannelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="channel" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Positivo" stackId="s" fill="#10b981" cursor="pointer" onClick={() => setClickSentiment((p) => (p === "Positivo" ? null : "Positivo"))} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Neutral" stackId="s" fill="#94a3b8" cursor="pointer" onClick={() => setClickSentiment((p) => (p === "Neutral" ? null : "Neutral"))} />
                <Bar dataKey="Negativo" stackId="s" fill="#ef4444" cursor="pointer" onClick={() => setClickSentiment((p) => (p === "Negativo" ? null : "Negativo"))} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sentimiento por campaña (Top 10)" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
          {sentimentByCampaignData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">Sin datos de campañas</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sentimentByCampaignData} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="campaign"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Positivo" stackId="c" fill="#10b981" cursor="pointer" onClick={(p: { campaign?: string }) => p?.campaign && setClickCampaign((prev) => (prev === p.campaign ? null : (p.campaign as string)))} />
                <Bar dataKey="Neutral" stackId="c" fill="#94a3b8" cursor="pointer" onClick={(p: { campaign?: string }) => p?.campaign && setClickCampaign((prev) => (prev === p.campaign ? null : (p.campaign as string)))} />
                <Bar dataKey="Negativo" stackId="c" fill="#ef4444" cursor="pointer" onClick={(p: { campaign?: string }) => p?.campaign && setClickCampaign((prev) => (prev === p.campaign ? null : (p.campaign as string)))} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 2: Top Agentes + Distribución Campaña (con click-to-filter) */}
      <div
        className={cn(
          "grid gap-4",
          campaignDist.length > 0 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        <ChartCard title="Top Agentes" icon={<Users className="w-4 h-4 text-primary" />}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topAgents} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={90} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(val: number, name: string) => [val, name === "count" ? "Interacciones" : name]} />
              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[0, 6, 6, 0]}
                barSize={16}
                cursor="pointer"
                onClick={(payload: { fullName?: string }) => {
                  if (!payload?.fullName) return;
                  setClickAgent((prev) => (prev === payload.fullName ? null : (payload.fullName as string)));
                }}
              >
                {topAgents.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={!clickAgent || clickAgent === entry.fullName ? 1 : 0.35} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {campaignDist.length > 0 && (
          <ChartCard title="Distribución por Campaña" icon={<MessageCircle className="w-4 h-4 text-emerald-600" />}>
            <ResponsiveContainer width="100%" height={260}>
              <RePieChart>
                <Pie
                  data={campaignDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                  cursor="pointer"
                  onClick={(payload: { fullName?: string }) => {
                    if (!payload?.fullName) return;
                    setClickCampaign((prev) => (prev === payload.fullName ? null : (payload.fullName as string)));
                  }}
                >
                  {campaignDist.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={!clickCampaign || clickCampaign === entry.fullName ? 1 : 0.35} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 9, paddingTop: 10 }} />
              </RePieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Row 3: Gráfico Dinámico de Resultados de la Operación (reemplaza Promesa de pago total periodo) */}
      <div className="grid grid-cols-1 gap-4">
        <ChartCard title={mpConfig.resultChartTitle} icon={<FileText className="w-4 h-4 text-primary" />}>
          {localResultDistribution.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
              Sin datos clasificados para el periodo seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={localResultDistribution} margin={{ bottom: 20, left: 4, right: 4 }}>
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
                    setClickResult((prev) => (prev === payload.name ? null : (payload.name as string)));
                  }}
                >
                  {localResultDistribution.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={categoryColorMap[entry.name] ?? COLORS[i % COLORS.length]}
                      opacity={!clickResult || clickResult === entry.name ? 1 : 0.35}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 4: Intensidad horaria */}
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

      {/* Row 5: Contactación Exitosa + Duración Promedio */}
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

      {/* Resumen y CTA */}
      {!hideIAReport && (
        <Card className="rounded-xl border border-accent/20 bg-accent/5 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className={cn("w-4 h-4 text-accent", insightLoading && "animate-spin")} />
                  Resumen ejecutivo del periodo ({mpConfig.label})
                </h3>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {filteredData.length} interacciones ({stats.callCount} llamadas, {stats.whatsappCount} WA) ·
                  Score {stats.avgScore}% · Positivo {stats.positivePct}%
                  {volDelta !== null ? ` · Volumen ${volDelta >= 0 ? "+" : ""}${volDelta}% vs anterior` : ""}
                </p>
              </div>
              <Button
                size="sm"
                className="rounded-lg text-xs"
                onClick={() => {
                  setInsightLoading(true);
                  onGoToReportIa();
                  setTimeout(() => setInsightLoading(false), 400);
                }}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generar Reporte IA ({mpConfig.shortLabel})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OperationMiniCards({
  title,
  counts,
  categories,
  icon: Icon,
}: {
  title: string;
  counts: Record<string, number>;
  categories: { name: string; color: string }[];
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" /> {title}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {categories.map((cat) => (
          <div
            key={cat.name}
            className="rounded-lg border border-border bg-muted/15 px-1.5 py-2 text-center min-h-[4.75rem] flex flex-col justify-between"
          >
            <p className="text-[9px] text-muted-foreground leading-snug line-clamp-3" title={cat.name}>{cat.name}</p>
            <p className="text-base font-bold tabular-nums text-foreground pt-1">{counts[cat.name] ?? 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}
