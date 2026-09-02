import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { Sparkles, ArrowRight, Lightbulb } from "lucide-react";

interface Props {
  data: IndicatorsBundle;
}

export function OperationalInsightsWidget({ data }: Props) {
  const { insights } = data;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Diagnóstico Operacional Inteligente
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Hallazgos clave detectados por IA en las interacciones analizadas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 p-2.5 rounded-xl bg-card/80 border border-border/60 text-xs shadow-2xs"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-foreground/90 leading-relaxed">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
