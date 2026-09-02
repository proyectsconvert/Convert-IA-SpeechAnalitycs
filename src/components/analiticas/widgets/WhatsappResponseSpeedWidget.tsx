import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function WhatsappResponseSpeedWidget({ data }: Props) {
  const { waMessageBuckets, stats } = data;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Promedio de mensajes por chat:</span>
        <span className="font-bold text-emerald-500">{stats.avgWAMsgs} msgs/conversación</span>
      </div>

      <div className="h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={waMessageBuckets} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              angle={-20}
              textAnchor="end"
              height={35}
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
              }}
              formatter={(val: number) => [`${val} chats`, "Volumen"]}
            />
            <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Chats" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
