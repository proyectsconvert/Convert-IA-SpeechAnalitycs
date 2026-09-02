import { useState } from "react";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { Award, User, ArrowUpDown, ChevronRight, Phone, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Props {
  data: IndicatorsBundle;
}

export function AgentRankingWidget({ data }: Props) {
  const { agentRankings, dashboardMode } = data;
  const [sortBy, setSortBy] = useState<"total" | "avgScore" | "positivePct">("total");

  // Filtrar según canal activo si no es general
  const filteredAgents = (agentRankings || []).filter((a) => {
    if (dashboardMode === "calls") return a.calls > 0;
    if (dashboardMode === "whatsapp") return a.chats > 0;
    return a.total > 0;
  });

  if (filteredAgents.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
        {dashboardMode === "calls"
          ? "Sin datos de asesores en llamadas telefónicas."
          : dashboardMode === "whatsapp"
          ? "Sin datos de asesores en WhatsApp."
          : "Sin datos de asesores en el periodo seleccionado."}
      </div>
    );
  }

  const sorted = [...filteredAgents].sort((a, b) => {
    const valA = dashboardMode === "calls" ? a.calls : dashboardMode === "whatsapp" ? a.chats : a.total;
    const valB = dashboardMode === "calls" ? b.calls : dashboardMode === "whatsapp" ? b.chats : b.total;
    if (sortBy === "avgScore") return b.avgScore - a.avgScore;
    if (sortBy === "positivePct") return b.positivePct - a.positivePct;
    return valB - valA;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs pb-1">
        <span className="text-muted-foreground font-medium">Top {Math.min(8, sorted.length)} asesores:</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Ordenar:</span>
          <button
            onClick={() => setSortBy("total")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              sortBy === "total" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Volumen
          </button>
          <button
            onClick={() => setSortBy("avgScore")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              sortBy === "avgScore" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Score
          </button>
          <button
            onClick={() => setSortBy("positivePct")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              sortBy === "positivePct" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            % Positivo
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin pr-1">
        {sorted.slice(0, 8).map((agent, i) => {
          const initials = agent.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const mainCount =
            dashboardMode === "calls"
              ? agent.calls
              : dashboardMode === "whatsapp"
              ? agent.chats
              : agent.total;

          return (
            <div
              key={agent.name}
              className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/70 transition-all text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative">
                  <Avatar className="w-7 h-7 text-[10px] font-bold">
                    <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  {i < 3 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center shadow-xs">
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate max-w-[150px] sm:max-w-[200px]">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    {dashboardMode === "calls" ? (
                      <>
                        <span>{agent.calls} llamadas</span>
                        {agent.avgDurationMin > 0 && (
                          <>
                            <span>·</span>
                            <span>{agent.avgDurationMin} min AHT</span>
                          </>
                        )}
                      </>
                    ) : dashboardMode === "whatsapp" ? (
                      <span>{agent.chats} conversaciones WhatsApp</span>
                    ) : (
                      <>
                        <span>{agent.calls} llamadas</span>
                        <span>·</span>
                        <span>{agent.chats} chats</span>
                        {agent.avgDurationMin > 0 && (
                          <>
                            <span>·</span>
                            <span>{agent.avgDurationMin} min AHT</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-right flex-shrink-0">
                <div>
                  <div className="font-bold text-foreground">{mainCount}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {dashboardMode === "calls" ? "Llamadas" : dashboardMode === "whatsapp" ? "Chats" : "Total"}
                  </div>
                </div>
                <div>
                  <div
                    className={`font-bold ${
                      agent.avgScore >= 70 ? "text-emerald-500" : agent.avgScore >= 50 ? "text-amber-500" : "text-rose-500"
                    }`}
                  >
                    {agent.avgScore}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Score</div>
                </div>
                <div>
                  <div className="font-bold text-emerald-500">{agent.positivePct}%</div>
                  <div className="text-[10px] text-muted-foreground">Positivo</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
