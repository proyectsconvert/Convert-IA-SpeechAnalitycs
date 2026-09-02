import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function HourlyHeatmapWidget({ data }: Props) {
  const { hourlyDistribution, dashboardMode } = data;

  const relevantHours = hourlyDistribution.filter((h) => h.hourNum >= 6 && h.hourNum <= 22);

  const peakHour = [...hourlyDistribution].sort((a, b) => {
    const valA = dashboardMode === "calls" ? a.llamadas : dashboardMode === "whatsapp" ? a.whatsapp : a.total;
    const valB = dashboardMode === "calls" ? b.llamadas : dashboardMode === "whatsapp" ? b.whatsapp : b.total;
    return valB - valA;
  })[0];

  const peakVal =
    dashboardMode === "calls"
      ? peakHour?.llamadas
      : dashboardMode === "whatsapp"
      ? peakHour?.whatsapp
      : peakHour?.total;

  return (
    <div className="w-full space-y-2">
      {peakHour && peakVal && peakVal > 0 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
          <span>Horarios de mayor afluencia:</span>
          <span className="font-semibold text-accent">
            Pico a las {peakHour.hour} ({peakVal} {dashboardMode === "calls" ? "llamadas" : dashboardMode === "whatsapp" ? "chats" : "interacciones"})
          </span>
        </div>
      ) : null}

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={relevantHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
            />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: "11px", paddingBottom: 8 }} />
            {dashboardMode !== "whatsapp" && (
              <Bar dataKey="llamadas" name="Llamadas" stackId="a" fill="#0ea5e9" radius={dashboardMode === "calls" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            )}
            {dashboardMode !== "calls" && (
              <Bar dataKey="whatsapp" name="WhatsApp" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
