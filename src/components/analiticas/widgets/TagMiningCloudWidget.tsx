import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { Tag } from "lucide-react";

interface Props {
  data: IndicatorsBundle;
}

export function TagMiningCloudWidget({ data }: Props) {
  const { allTopTags, topCallTags, topWaTags, dashboardMode } = data;

  const tags =
    dashboardMode === "calls"
      ? topCallTags
      : dashboardMode === "whatsapp"
      ? topWaTags
      : allTopTags;

  const labelSuffix =
    dashboardMode === "calls"
      ? "% de llamadas"
      : dashboardMode === "whatsapp"
      ? "% de chats"
      : "% del total";

  if (!tags || tags.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
        Sin tags o temas detectados en el dataset filtrado.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
      {tags.map((item, idx) => {
        return (
          <div
            key={idx}
            className="flex items-center justify-between p-2 rounded-xl bg-secondary/40 border border-border/40 hover:bg-secondary/70 transition-all text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="font-semibold text-foreground truncate">{item.tag}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-muted-foreground">{item.pct}{labelSuffix}</span>
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-[11px]">
                {item.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
