import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface SentimentDonutWidgetProps {
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

const COLORS = {
  positive: "#10b981", // Emerald 500
  neutral: "#64748b",  // Slate 500
  negative: "#ef4444", // Red 500
};

export function SentimentDonutWidget({
  positiveCount,
  neutralCount,
  negativeCount,
}: SentimentDonutWidgetProps) {
  const total = positiveCount + neutralCount + negativeCount;

  const data = [
    { name: "Positivo", value: positiveCount, color: COLORS.positive },
    { name: "Neutro", value: neutralCount, color: COLORS.neutral },
    { name: "Negativo", value: negativeCount, color: COLORS.negative },
  ].filter((d) => d.value > 0);

  const posPct = total > 0 ? Math.round((positiveCount / total) * 100) : 0;
  const neuPct = total > 0 ? Math.round((neutralCount / total) * 100) : 0;
  const negPct = total > 0 ? Math.round((negativeCount / total) * 100) : 0;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 h-full flex flex-col justify-between shadow-2xs">
      <div>
        <h3 className="text-sm font-bold text-foreground">Distribución de Sentimiento</h3>
        <p className="text-xs text-muted-foreground">Tono emocional de las conversaciones</p>
      </div>

      <div className="flex flex-col items-center justify-center my-2 relative">
        <div className="w-[180px] h-[180px]">
          {total === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              Sin datos
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Indicador Central */}
        {total > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold text-foreground">{posPct}%</span>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Positivo</span>
          </div>
        )}
      </div>

      {/* Leyenda con Porcentajes */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60 text-center">
        <div className="p-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Positivo</p>
          <p className="text-xs font-extrabold text-foreground">{positiveCount} ({posPct}%)</p>
        </div>
        <div className="p-1.5 rounded-xl bg-slate-500/10 border border-slate-500/20">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Neutro</p>
          <p className="text-xs font-extrabold text-foreground">{neutralCount} ({neuPct}%)</p>
        </div>
        <div className="p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <p className="text-[10px] font-bold text-rose-500 uppercase">Negativo</p>
          <p className="text-xs font-extrabold text-foreground">{negativeCount} ({negPct}%)</p>
        </div>
      </div>
    </div>
  );
}
