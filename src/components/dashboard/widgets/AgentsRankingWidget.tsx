import { Trophy, User, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AgentPerformance {
  name: string;
  callsCount: number;
  avgScore: number;
  sentimentLabel: string;
}

interface AgentsRankingWidgetProps {
  agents: AgentPerformance[];
}

export function AgentsRankingWidget({ agents }: AgentsRankingWidgetProps) {
  const hasData = agents && agents.length > 0;
  const topAgents = agents.slice(0, 5);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 h-full flex flex-col justify-between shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Ranking de Asesores</h3>
          <p className="text-xs text-muted-foreground">Desempeño y volumen por agente</p>
        </div>
        <Trophy className="w-4 h-4 text-amber-500" />
      </div>

      {!hasData ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          No hay asesores con datos en este periodo
        </div>
      ) : (
        <div className="space-y-2.5 my-auto">
          {topAgents.map((ag, idx) => {
            const initials = ag.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "AG";

            return (
              <div
                key={ag.name}
                className="flex items-center justify-between p-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors border border-border/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-xs font-mono font-bold w-4 text-center ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                    #{idx + 1}
                  </span>
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-[180px]">
                      {ag.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5" /> {ag.callsCount} llamadas
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-mono font-bold text-accent">
                    {ag.avgScore}/100
                  </div>
                  <span className={`text-[10px] font-semibold uppercase ${ag.sentimentLabel === "positivo" ? "text-emerald-500" : ag.sentimentLabel === "negativo" ? "text-rose-500" : "text-muted-foreground"}`}>
                    {ag.sentimentLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
