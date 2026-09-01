import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  startOfToday,
  endOfToday,
} from "date-fns";
import type {
  AnalizadorFilters,
  AnalizadorUnifiedRow,
  ChartNamedValue,
  DateRangePreset,
  UnifiedChannel,
} from "@/components/analizador-total/types";
import { classifyPromesaDePago, PROMESA_CATEGORIAS } from "@/lib/analizador-total/unifiedCobranzaFields";
import { getMacroprocesoConfig, classifyOperationResult } from "@/lib/analizador-total/macroprocesoConfigs";

type RowExt = AnalizadorUnifiedRow & Record<string, unknown>;

export function getCurrentDateBounds(
  dateRange: DateRangePreset,
  customRange: { from: Date; to: Date },
): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  if (dateRange === "today") {
    start = startOfToday();
    end = endOfToday();
  } else if (dateRange === "7d") start = subDays(now, 6);
  else if (dateRange === "15d") start = subDays(now, 14);
  else if (dateRange === "30d") start = subDays(now, 29);
  else if (dateRange === "this_month") start = startOfMonth(now);
  else if (dateRange === "last_month") {
    const last = subDays(startOfMonth(now), 1);
    start = startOfMonth(last);
    end = endOfMonth(last);
  } else {
    start = customRange.from;
    end = customRange.to;
  }
  return { start, end };
}

export function getPreviousPeriodBounds(start: Date, end: Date): { start: Date; end: Date } {
  const ms = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - ms),
    end: new Date(end.getTime() - ms),
  };
}

export function filterAnalizadorRows(
  rawData: AnalizadorUnifiedRow[] | undefined,
  opts: {
    dateRange: DateRangePreset;
    customRange: { from: Date; to: Date };
    channelFilter: "all" | UnifiedChannel;
    searchTerm: string;
    filters: AnalizadorFilters;
    sortConfig: { key: string; direction: "asc" | "desc" } | null;
    /** Si se define, filtra fechas en este intervalo (p. ej. periodo anterior) */
    dateBoundsOverride?: { start: Date; end: Date };
  },
): AnalizadorUnifiedRow[] {
  if (!rawData) return [];

  const { start, end } = opts.dateBoundsOverride ?? getCurrentDateBounds(opts.dateRange, opts.customRange);

  let result = rawData.filter((item) => {
    const date = new Date(item.created_at);
    return isWithinInterval(date, { start, end });
  });

  if (opts.channelFilter === "call") result = result.filter((d) => d.channel === "call");
  if (opts.channelFilter === "whatsapp") result = result.filter((d) => d.channel === "whatsapp");

  if (opts.filters.sentiment.length > 0) {
    const set = new Set(opts.filters.sentiment);
    result = result.filter((d) => set.has(d.sentiment));
  }
  if (opts.filters.agent.length > 0) {
    const set = new Set(opts.filters.agent);
    result = result.filter((d) => set.has(d.agent));
  }
  if (opts.filters.campaign.length > 0) {
    const set = new Set(opts.filters.campaign);
    result = result.filter((d) => set.has(String(d.campaign || "")));
  }

  if (opts.filters.scoreRange === "low") result = result.filter((d) => d.score <= 0.6);
  if (opts.filters.scoreRange === "mid") result = result.filter((d) => d.score > 0.6 && d.score <= 0.8);
  if (opts.filters.scoreRange === "high") result = result.filter((d) => d.score > 0.8);

  if (opts.filters.durationRange === "short") {
    result = result.filter((d) => d.channel !== "call" || d.duration < 1800);
  }
  if (opts.filters.durationRange === "medium") {
    result = result.filter((d) => d.channel !== "call" || (d.duration >= 1800 && d.duration <= 3600));
  }
  if (opts.filters.durationRange === "long") {
    result = result.filter((d) => d.channel !== "call" || d.duration > 3600);
  }

  if (opts.searchTerm) {
    const q = opts.searchTerm.toLowerCase();
    result = result.filter((item) => {
      const x = item as RowExt;
      return (
        item.file_name.toLowerCase().includes(q) ||
        String(item.summary || "")
          .toLowerCase()
          .includes(q) ||
        String(item.campaign || "")
          .toLowerCase()
          .includes(q) ||
        String(item.agent || "")
          .toLowerCase()
          .includes(q) ||
        String(x.atribucion_responsabilidad || "")
          .toLowerCase()
          .includes(q) ||
        String(x.motivo_principal || "")
          .toLowerCase()
          .includes(q) ||
        String(x.promesa_de_pago || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }

  if (opts.sortConfig) {
    const { key, direction } = opts.sortConfig;
    result = [...result].sort((a, b) => {
      const ar = a as RowExt;
      const br = b as RowExt;
      const av = ar[key];
      const bv = br[key];
      if (av == null && bv == null) return 0;
      if (av == null) return direction === "asc" ? 1 : -1;
      if (bv == null) return direction === "asc" ? -1 : 1;
      if (av < bv) return direction === "asc" ? -1 : 1;
      if (av > bv) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  return result;
}

function extractMotivo(d: RowExt): string {
  const mKey = Object.keys(d).find((k) => k.toLowerCase().includes("motivo"));
  if (mKey && d[mKey]) return String(d[mKey]);
  if (d.ext_Motivo) return String(d.ext_Motivo);
  if (d.channel === "whatsapp" && d.results && typeof d.results === "object") {
    const r = d.results as Record<string, unknown>;
    return String(r.motivo_no_pago ?? r.motivo ?? r.Motivo ?? "Otros");
  }
  return "Otros";
}

export interface SentimentDayRow {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
}

export interface DailyChannelRow {
  date: string;
  callPos: number;
  callNeg: number;
  callNeu: number;
  waPos: number;
  waNeg: number;
  waNeu: number;
}

export interface ChartDataBundle {
  sentiment: SentimentDayRow[];
  sentimentByChannel: DailyChannelRow[];
  dailyChannels: DailyChannelRow[];
  responsibility: ChartNamedValue[];
  motives: ChartNamedValue[];
  promises: ChartNamedValue[];
  operationResults: ChartNamedValue[];
  heatmap: { hour: string; count: number; calls: number; whatsapp: number; contactRateCalls: number; contactRateWa: number; contactRateGlobal?: number; avgDurationMin?: number; callsContacted?: number; waContacted?: number }[];
}

export function buildChartData(filteredData: AnalizadorUnifiedRow[], macroproceso?: string): ChartDataBundle {
  const mpConfig = getMacroprocesoConfig(macroproceso);
  const mpCategoryNames = mpConfig.categories.map((c) => c.name);

  if (filteredData.length === 0) {
    return {
      sentiment: [],
      sentimentByChannel: [],
      dailyChannels: [],
      responsibility: [],
      motives: [],
      promises: [],
      operationResults: [],
      heatmap: [],
    };
  }

  const days: Record<string, SentimentDayRow> = {};
  const daysCh: Record<string, DailyChannelRow> = {};
  const motives: Record<string, number> = {};
  const promises: Record<string, number> = Object.fromEntries(PROMESA_CATEGORIAS.map((c) => [c, 0])) as Record<
    string,
    number
  >;
  const opResultsMap: Record<string, number> = Object.fromEntries(mpCategoryNames.map((c) => [c, 0]));
  const heatmap: Record<string, { count: number; calls: number; whatsapp: number; callsContacted: number; waContacted: number; totalDuration: number }> = {};

  filteredData.forEach((raw) => {
    const d = raw as RowExt;
    const date = format(d.created_at, "dd MMM");
    if (!days[date]) days[date] = { date, positive: 0, negative: 0, neutral: 0 };
    if (d.sentiment === "positive") days[date].positive++;
    else if (d.sentiment === "negative") days[date].negative++;
    else days[date].neutral++;

    if (!daysCh[date]) {
      daysCh[date] = {
        date,
        callPos: 0,
        callNeg: 0,
        waPos: 0,
        waNeg: 0,
        callNeu: 0,
        waNeu: 0,
      };
    }
    const isWa = d.channel === "whatsapp";
    if (d.sentiment === "positive") {
      if (isWa) daysCh[date].waPos++;
      else daysCh[date].callPos++;
    } else if (d.sentiment === "negative") {
      if (isWa) daysCh[date].waNeg++;
      else daysCh[date].callNeg++;
    } else {
      if (isWa) daysCh[date].waNeu++;
      else daysCh[date].callNeu++;
    }

    const mLabel = String((d as RowExt).motivo_principal ?? extractMotivo(d));
    motives[mLabel] = (motives[mLabel] || 0) + 1;

    const cat = classifyPromesaDePago(d);
    promises[cat] = (promises[cat] ?? 0) + 1;

    const opCat = classifyOperationResult(d, macroproceso);
    opResultsMap[opCat] = (opResultsMap[opCat] ?? 0) + 1;

    const hour = format(d.created_at, "HH");
    if (!heatmap[hour]) heatmap[hour] = { count: 0, calls: 0, whatsapp: 0, callsContacted: 0, waContacted: 0, totalDuration: 0 };
    heatmap[hour].count++;
    heatmap[hour].totalDuration += (d.duration || 0);

    let isContacted = true;
    if (cat === "Buzón / Cuelga / No contesta" || opCat.toLowerCase().includes("buzón") || opCat.toLowerCase().includes("no contactado")) {
      isContacted = false;
    }
    // For WhatsApp, assume uncontacted if client never replies (total_messages <= 1)
    if (isWa && d.total_messages != null && Number(d.total_messages) <= 1) isContacted = false;

    if (isWa) {
      heatmap[hour].whatsapp++;
      if (isContacted) heatmap[hour].waContacted++;
    } else {
      heatmap[hour].calls++;
      if (isContacted) heatmap[hour].callsContacted++;
    }
  });

  const heatArr = Object.entries(heatmap)
    .map(([hour, v]) => ({
      hour: `${hour}:00`,
      count: v.count,
      calls: v.calls,
      whatsapp: v.whatsapp,
      callsContacted: v.callsContacted,
      waContacted: v.waContacted,
      contactRateCalls: v.calls > 0 ? Math.round((v.callsContacted / v.calls) * 100) : 0,
      contactRateWa: v.whatsapp > 0 ? Math.round((v.waContacted / v.whatsapp) * 100) : 0,
      contactRateGlobal: v.count > 0 ? Math.round(((v.callsContacted + v.waContacted) / v.count) * 100) : 0,
      avgDurationMin: v.count > 0 ? Math.round((v.totalDuration / v.count) / 60) : 0,
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  return {
    sentiment: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    sentimentByChannel: Object.values(daysCh).sort((a, b) => a.date.localeCompare(b.date)),
    dailyChannels: Object.values(daysCh).sort((a, b) => a.date.localeCompare(b.date)),
    responsibility: [],
    motives: Object.entries(motives)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
    promises: PROMESA_CATEGORIAS.map((name) => ({ name, value: promises[name] ?? 0 })),
    operationResults: mpCategoryNames.map((name) => ({ name, value: opResultsMap[name] ?? 0 })),
    heatmap: heatArr,
  };
}

export interface StatsBundle {
  total: number;
  positivePct: number;
  avgScore: number;
  totalDurationMinutes: number;
  callCount: number;
  whatsappCount: number;
}

export function computeStats(filteredData: AnalizadorUnifiedRow[]): StatsBundle {
  const total = filteredData.length;
  if (total === 0) {
    return {
      total: 0,
      positivePct: 0,
      avgScore: 0,
      totalDurationMinutes: 0,
      callCount: 0,
      whatsappCount: 0,
    };
  }

  const positive = filteredData.filter((d) => d.sentiment === "positive").length;
  const avgScoreRaw = filteredData.reduce((acc, d) => acc + (d.score || 0), 0) / total;
  const totalDurationSec = filteredData.reduce((acc, d) => acc + (d.duration || 0), 0);

  return {
    total,
    positivePct: Math.round((positive / total) * 100),
    avgScore: Math.round(avgScoreRaw <= 1.5 ? avgScoreRaw * 100 : avgScoreRaw),
    totalDurationMinutes: Math.round(totalDurationSec / 60),
    callCount: filteredData.filter((d) => d.channel === "call").length,
    whatsappCount: filteredData.filter((d) => d.channel === "whatsapp").length,
  };
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function listCampaignsFromRows(rawData: AnalizadorUnifiedRow[] | undefined): string[] {
  if (!rawData) return [];
  const set = new Set<string>();
  rawData.forEach((r) => {
    if (r.campaign) set.add(String(r.campaign));
  });
  return Array.from(set).sort();
}

export interface SentimentByChannelRow {
  channel: string;
  Positivo: number;
  Negativo: number;
  Neutral: number;
}

export function buildSentimentByChannel(rows: AnalizadorUnifiedRow[]): SentimentByChannelRow[] {
  const init = (): Omit<SentimentByChannelRow, "channel"> => ({ Positivo: 0, Negativo: 0, Neutral: 0 });
  const call = init();
  const wa = init();
  rows.forEach((r) => {
    const bucket = r.channel === "whatsapp" ? wa : call;
    if (r.sentiment === "positive") bucket.Positivo++;
    else if (r.sentiment === "negative") bucket.Negativo++;
    else bucket.Neutral++;
  });
  const out: SentimentByChannelRow[] = [];
  if (call.Positivo + call.Negativo + call.Neutral > 0) out.push({ channel: "Llamadas", ...call });
  if (wa.Positivo + wa.Negativo + wa.Neutral > 0) out.push({ channel: "WhatsApp", ...wa });
  return out;
}

export interface SentimentByCampaignRow {
  campaign: string;
  Positivo: number;
  Negativo: number;
  Neutral: number;
  total: number;
}

export function buildSentimentByCampaign(rows: AnalizadorUnifiedRow[], topN = 10): SentimentByCampaignRow[] {
  const map = new Map<string, SentimentByCampaignRow>();
  rows.forEach((r) => {
    const name = String(r.campaign || "Sin campaña");
    const prev = map.get(name) ?? { campaign: name, Positivo: 0, Negativo: 0, Neutral: 0, total: 0 };
    if (r.sentiment === "positive") prev.Positivo++;
    else if (r.sentiment === "negative") prev.Negativo++;
    else prev.Neutral++;
    prev.total++;
    map.set(name, prev);
  });
  const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otros = rest.reduce(
    (acc, r) => {
      acc.Positivo += r.Positivo;
      acc.Negativo += r.Negativo;
      acc.Neutral += r.Neutral;
      acc.total += r.total;
      return acc;
    },
    { campaign: "Otros", Positivo: 0, Negativo: 0, Neutral: 0, total: 0 } as SentimentByCampaignRow,
  );
  return [...top, otros];
}
