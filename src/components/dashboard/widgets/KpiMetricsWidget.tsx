import { StatCard } from "@/components/ui/stat-card";
import {
  BarChart3,
  Phone,
  MessageCircle,
  Activity,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface KpiMetricsWidgetProps {
  totalInteractions: number;
  totalCalls: number;
  totalWhatsApp: number;
  avgSentiment: number;
  totalMinutes: number;
  analysisRate: number;
}

export function KpiMetricsWidget({
  totalInteractions,
  totalCalls,
  totalWhatsApp,
  avgSentiment,
  totalMinutes,
  analysisRate,
}: KpiMetricsWidgetProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        title="Total interacciones"
        value={totalInteractions.toLocaleString()}
        icon={BarChart3}
      />
      <StatCard
        title="Llamadas"
        value={totalCalls.toLocaleString()}
        icon={Phone}
      />
      <StatCard
        title="WhatsApp"
        value={totalWhatsApp.toLocaleString()}
        icon={MessageCircle}
      />
      <StatCard
        title="Sentimiento"
        value={`${avgSentiment || 0}`}
        subtitle="/100"
        icon={Activity}
      />
      <StatCard
        title="Minutos procesados"
        value={totalMinutes.toLocaleString()}
        subtitle="min"
        icon={Clock}
      />
      <StatCard
        title="Tasa de análisis"
        value={`${analysisRate}%`}
        icon={CheckCircle2}
      />
    </div>
  );
}
