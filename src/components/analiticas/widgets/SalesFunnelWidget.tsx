import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { ArrowRight, CheckCircle2, ChevronRight, Zap } from "lucide-react";

interface Props {
  data: IndicatorsBundle;
}

export function SalesFunnelWidget({ data }: Props) {
  const { salesFunnel, stats } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Efectividad Global de Cierre:</span>
        <span className="font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
          {stats.conversionRate}% Conversión
        </span>
      </div>

      <div className="space-y-2.5">
        {salesFunnel.map((step, idx) => {
          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: step.color }}
                  />
                  {step.stage}
                </span>
                <span className="font-bold text-foreground">
                  {step.count.toLocaleString("es")}{" "}
                  <span className="text-muted-foreground font-normal text-[11px]">
                    ({step.percentage}%)
                  </span>
                </span>
              </div>
              <div className="w-full bg-secondary/70 h-3.5 rounded-full overflow-hidden p-0.5 border border-border/40">
                <div
                  className="h-full rounded-full transition-all duration-500 shadow-sm"
                  style={{
                    width: `${Math.max(5, step.percentage)}%`,
                    backgroundColor: step.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
