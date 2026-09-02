import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function CsatSentimentTimelineWidget({ data }: Props) {
  const { dailyTrend, stats } = data;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Evolución de score de calidad e índice CSAT:</span>
        <span className="font-bold text-foreground">
          Score Global: <span className="text-primary">{stats.avgScore}/100</span>
        </span>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "12px",
                fontSize: "12px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(val: number) => [`${val} pts`, "Score Calidad"]}
            />
            <ReferenceLine y={70} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Meta 70%", fill: "#10b981", fontSize: 10, position: "insideTopRight" }} />
            <Line
              type="monotone"
              dataKey="avgScore"
              name="Score Promedio"
              stroke="#8b5cf6"
              strokeWidth={3}
              dot={{ fill: "#8b5cf6", r: 4 }}
              activeDot={{ r: 6, fill: "#a78bfa" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
