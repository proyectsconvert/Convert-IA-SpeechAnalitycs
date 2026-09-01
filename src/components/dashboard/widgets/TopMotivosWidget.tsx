import { useState } from "react";
import { Tag, Sparkles, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface TagMotivoItem {
  name: string;
  count: number;
  percentage: number;
  category: "motivo" | "resultado" | "tag" | "objecion";
}

interface TopMotivosWidgetProps {
  items: TagMotivoItem[];
}

const CATEGORY_STYLES: Record<
  TagMotivoItem["category"],
  { badgeClass: string; barColor: string; label: string }
> = {
  motivo: {
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    barColor: "#3b82f6",
    label: "Intención / Motivo",
  },
  resultado: {
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    barColor: "#10b981",
    label: "Resultado Comercial",
  },
  tag: {
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
    barColor: "#8b5cf6",
    label: "Tag IA",
  },
  objecion: {
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    barColor: "#f59e0b",
    label: "Objeción",
  },
};

export function TopMotivosWidget({ items }: TopMotivosWidgetProps) {
  const [activeTab, setActiveTab] = useState<"todos" | "motivo" | "resultado" | "tag">("todos");

  const filteredItems = items.filter(
    (item) => activeTab === "todos" || item.category === activeTab
  );

  const hasData = filteredItems.length > 0;
  const displayItems = filteredItems.slice(0, 7);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 h-full flex flex-col justify-between shadow-2xs">
      {/* Cabecera del Widget con Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            Top Motivos, Resultados y Tags
          </h3>
          <p className="text-xs text-muted-foreground">
            Clasificación semántica e intenciones detectadas por la IA
          </p>
        </div>

        {/* Pestañas de Filtrado */}
        <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-xl border border-border/50">
          <button
            onClick={() => setActiveTab("todos")}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
              activeTab === "todos"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setActiveTab("motivo")}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
              activeTab === "motivo"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Motivos
          </button>
          <button
            onClick={() => setActiveTab("resultado")}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
              activeTab === "resultado"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Resultados
          </button>
          <button
            onClick={() => setActiveTab("tag")}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
              activeTab === "tag"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tags
          </button>
        </div>
      </div>

      {/* Lista de Motivos y Tags con Badges y Barras */}
      {!hasData ? (
        <div className="h-[200px] flex flex-col items-center justify-center text-center p-4">
          <Tag className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            No se detectaron clasificaciones para este filtro
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 my-auto pt-1">
          {displayItems.map((item, index) => {
            const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.motivo;

            return (
              <div
                key={`${item.category}-${item.name}`}
                className="space-y-1.5 p-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors border border-border/40"
              >
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-muted-foreground w-4 text-center">
                      #{index + 1}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg truncate max-w-[220px] sm:max-w-[300px] ${style.badgeClass}`}
                    >
                      {item.name}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground hidden sm:inline">
                      {style.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {item.count} <span className="text-muted-foreground font-normal">({item.percentage}%)</span>
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(item.percentage, 5)}%`,
                      backgroundColor: style.barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
