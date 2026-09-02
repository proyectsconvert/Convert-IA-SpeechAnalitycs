import { useMemo } from "react";
import { CustomChartConfig } from "../presets/defaultDashboards";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  config: CustomChartConfig;
  data: IndicatorsBundle;
}

export function DynamicCustomWidget({ config, data }: Props) {
  const { chartType, metric, dimension, color = "#0ea5e9" } = config;

  const chartData = useMemo(() => {
    if (dimension === "channel") {
      return [
        {
          name: "Llamadas",
          value:
            metric === "volume"
              ? data.stats.totalCalls
              : metric === "score"
              ? data.stats.avgScoreCalls || 0
              : metric === "duration"
              ? data.stats.totalMin
              : data.stats.conversionRate,
          color: "#0ea5e9",
        },
        {
          name: "WhatsApp",
          value:
            metric === "volume"
              ? data.stats.totalWA
              : metric === "score"
              ? data.stats.avgScoreWa || 0
              : metric === "duration"
              ? 0
              : data.stats.conversionRate,
          color: "#10b981",
        },
      ];
    }

    if (dimension === "sentiment") {
      return data.sentimentDist.map((s) => ({
        name: s.name,
        value: s.value,
        color: s.color,
      }));
    }

    if (dimension === "agent") {
      return data.agentRankings.slice(0, 6).map((a) => ({
        name: a.name.split(" ")[0] || a.name,
        value:
          metric === "volume"
            ? a.total
            : metric === "score"
            ? a.avgScore
            : metric === "duration"
            ? a.avgDurationMin
            : a.positivePct,
        color,
      }));
    }

    if (dimension === "day") {
      return data.dailyTrend.slice(-14).map((d) => ({
        name: d.day,
        value: metric === "score" ? d.avgScore : d.total,
        color,
      }));
    }

    return [];
  }, [config, data]);

  if (chartType === "kpi") {
    const totalVal = chartData.reduce((acc, curr) => acc + curr.value, 0);
    return (
      <div className="flex flex-col items-center justify-center h-48">
        <div className="text-4xl font-bold text-foreground mb-1" style={{ color }}>
          {totalVal.toLocaleString("es")}
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Métrica: {metric} · Desglose: {dimension}
        </div>
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <div className="h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "10px", fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <div className="h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "10px", fontSize: "12px" }} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: Bar
  return (
    <div className="h-[230px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "10px", fontSize: "12px" }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
