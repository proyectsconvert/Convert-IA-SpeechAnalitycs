import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { AlertCircle, ShieldAlert } from "lucide-react";

interface Props {
  data: IndicatorsBundle;
}

export function ObjectionsBreakdownWidget({ data }: Props) {
  const { objectionsList } = data;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {objectionsList.map((obj, i) => (
          <div key={i} className="space-y-1 p-2 rounded-xl bg-secondary/40 border border-border/40 hover:bg-secondary/70 transition-colors">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground flex items-center gap-1.5 truncate max-w-[200px]">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="truncate">{obj.name}</span>
              </span>
              <span className="font-bold text-foreground text-right flex-shrink-0">
                {obj.percentage}% <span className="text-muted-foreground font-normal text-[10px]">({obj.count})</span>
              </span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.min(100, obj.percentage * 3)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
