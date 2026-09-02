import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function DurationBucketWidget({ data }: Props) {
  const { durationBuckets } = data;

  return (
    <div className="w-full">
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={durationBuckets} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.6)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              angle={-25}
              textAnchor="end"
              height={40}
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
              formatter={(val: number) => [`${val} llamadas`, "Volumen"]}
            />
            <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Llamadas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
