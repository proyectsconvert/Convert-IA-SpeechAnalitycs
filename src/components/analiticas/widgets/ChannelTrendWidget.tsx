import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function ChannelTrendWidget({ data }: Props) {
  const { dailyTrend, dashboardMode } = data;

  if (!dailyTrend || dailyTrend.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        Sin datos de tendencia para el periodo seleccionado.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="waGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "12px",
                fontSize: "12px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{ fontWeight: "bold", color: "hsl(var(--foreground))" }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingBottom: 15, fontSize: "12px" }}
            />
            {dashboardMode !== "whatsapp" && (
              <Area
                type="monotone"
                dataKey="llamadas"
                name="Llamadas"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#callsGrad)"
              />
            )}
            {dashboardMode !== "calls" && (
              <Area
                type="monotone"
                dataKey="whatsapp"
                name="WhatsApp"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#waGrad)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
