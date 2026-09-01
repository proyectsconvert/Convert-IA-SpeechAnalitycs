import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface TrendActivityWidgetProps {
  data: Array<{
    date: string;
    day: string;
    llamadas: number;
    whatsapp: number;
  }>;
}

export function TrendActivityWidget({ data }: TrendActivityWidgetProps) {
  const hasData = data && data.length > 0 && data.some((d) => d.llamadas > 0 || d.whatsapp > 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 h-full flex flex-col justify-between shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Evolución de Actividad</h3>
          <p className="text-xs text-muted-foreground">Volumen diario por canal de contacto</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-blue-500">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Llamadas
          </span>
          <span className="flex items-center gap-1.5 text-emerald-500">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> WhatsApp
          </span>
        </div>
      </div>

      <div className="w-full h-[250px]">
        {!hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-muted-foreground">Sin actividad registrada en este periodo</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorWa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: "12px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
                }}
              />
              <Area
                type="monotone"
                dataKey="llamadas"
                name="Llamadas"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorCalls)"
              />
              <Area
                type="monotone"
                dataKey="whatsapp"
                name="WhatsApp"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorWa)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
