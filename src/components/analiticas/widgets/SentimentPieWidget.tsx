import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function SentimentPieWidget({ data }: Props) {
  const { sentimentDist, dashboardMode } = data;

  if (!sentimentDist || sentimentDist.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-xs text-muted-foreground p-4 text-center">
        {dashboardMode === "calls"
          ? "Sin llamadas analizadas con sentimiento en este periodo."
          : dashboardMode === "whatsapp"
          ? "Sin chats de WhatsApp analizados con sentimiento en este periodo."
          : "Sin datos de sentimiento disponibles."}
      </div>
    );
  }

  const total = sentimentDist.reduce((acc, s) => acc + s.value, 0);

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="h-[200px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sentimentDist}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
            >
              {sentimentDist.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "12px",
                fontSize: "12px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(value: number) => [`${value} (${Math.round((value / total) * 100)}%)`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-foreground">{total.toLocaleString("es")}</span>
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">
            {dashboardMode === "calls" ? "Llamadas" : dashboardMode === "whatsapp" ? "Chats" : "Total"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full mt-2 pt-2 border-t border-border/50">
        {sentimentDist.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between p-1.5 rounded-lg bg-secondary/50 text-xs"
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-foreground">{item.name}</span>
            </div>
            <span className="font-bold text-foreground">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
