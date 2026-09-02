import { AnimatePresence } from "framer-motion";
import { WidgetInstance } from "./presets/defaultDashboards";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { WidgetCard } from "./WidgetCard";
import { Plus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

// Widgets
import { KpiStatWidget } from "./widgets/KpiStatWidget";
import { ChannelTrendWidget } from "./widgets/ChannelTrendWidget";
import { SentimentPieWidget } from "./widgets/SentimentPieWidget";
import { HourlyHeatmapWidget } from "./widgets/HourlyHeatmapWidget";
import { SalesFunnelWidget } from "./widgets/SalesFunnelWidget";
import { ObjectionsBreakdownWidget } from "./widgets/ObjectionsBreakdownWidget";
import { AgentRankingWidget } from "./widgets/AgentRankingWidget";
import { DurationBucketWidget } from "./widgets/DurationBucketWidget";
import { WhatsappResponseSpeedWidget } from "./widgets/WhatsappResponseSpeedWidget";
import { CsatSentimentTimelineWidget } from "./widgets/CsatSentimentTimelineWidget";
import { TagMiningCloudWidget } from "./widgets/TagMiningCloudWidget";
import { OperationalInsightsWidget } from "./widgets/OperationalInsightsWidget";
import { DynamicCustomWidget } from "./widgets/DynamicCustomWidget";

interface Props {
  widgets: WidgetInstance[];
  data: IndicatorsBundle;
  isEditing: boolean;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onResize: (id: string, colSpan: 1 | 2 | 3) => void;
  onRemove: (id: string) => void;
  onOpenAddWidget: () => void;
}

export function GridDashboard({
  widgets,
  data,
  isEditing,
  onMoveUp,
  onMoveDown,
  onResize,
  onRemove,
  onOpenAddWidget,
}: Props) {
  const renderWidgetContent = (widget: WidgetInstance) => {
    switch (widget.type) {
      case "kpi-summary":
        return <KpiStatWidget data={data} />;
      case "operational-insights":
        return <OperationalInsightsWidget data={data} />;
      case "channel-trend":
        return <ChannelTrendWidget data={data} />;
      case "sentiment-pie":
        return <SentimentPieWidget data={data} />;
      case "hourly-heatmap":
        return <HourlyHeatmapWidget data={data} />;
      case "sales-funnel":
        return <SalesFunnelWidget data={data} />;
      case "objections-breakdown":
        return <ObjectionsBreakdownWidget data={data} />;
      case "agent-ranking":
        return <AgentRankingWidget data={data} />;
      case "duration-buckets":
        return <DurationBucketWidget data={data} />;
      case "wa-speed-buckets":
        return <WhatsappResponseSpeedWidget data={data} />;
      case "csat-timeline":
        return <CsatSentimentTimelineWidget data={data} />;
      case "top-tags":
        return <TagMiningCloudWidget data={data} />;
      case "custom-chart":
        return widget.customConfig ? (
          <DynamicCustomWidget config={widget.customConfig} data={data} />
        ) : (
          <div className="text-xs text-muted-foreground">Configuración de gráfico incompleta</div>
        );
      default:
        return <div className="text-xs text-muted-foreground">Gráfico no reconocido</div>;
    }
  };

  if (!widgets || widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-card/40 text-center space-y-3 min-h-[300px]">
        <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
          <LayoutGrid className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">El tablero está vacío</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            Añade gráficos prediseñados o crea tus propios paneles personalizados para comenzar a visualizar datos.
          </p>
        </div>
        <Button onClick={onOpenAddWidget} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Añadir Gráfico
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <AnimatePresence>
        {widgets.map((w) => (
          <WidgetCard
            key={w.id}
            widget={w}
            isEditing={isEditing}
            onMoveUp={() => onMoveUp(w.id)}
            onMoveDown={() => onMoveDown(w.id)}
            onResize={(size) => onResize(w.id, size)}
            onRemove={() => onRemove(w.id)}
          >
            {renderWidgetContent(w)}
          </WidgetCard>
        ))}
      </AnimatePresence>
    </div>
  );
}
