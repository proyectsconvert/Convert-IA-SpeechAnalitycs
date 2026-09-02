import {
  Activity,
  Phone,
  Smartphone,
  TrendingUp,
  Zap,
  AlertTriangle,
  Clock,
  Award,
  MessageSquare,
  CheckCircle2,
  FileAudio,
} from "lucide-react";
import { IndicatorsBundle } from "@/lib/analiticas/indicatorsData";

interface Props {
  data: IndicatorsBundle;
}

export function KpiStatWidget({ data }: Props) {
  const { stats, dashboardMode, sentimentDist } = data;
  const positivePct = sentimentDist.find((s) => s.name === "Positivo")?.percentage || 0;

  // 1. MODO TELEFONÍA / LLAMADAS DE VOZ
  if (dashboardMode === "calls") {
    const callKpis = [
      {
        title: "Total Llamadas",
        value: stats.totalCalls.toLocaleString("es"),
        subtitle: `${stats.completedCalls} analizadas con IA`,
        icon: Phone,
        color: "text-sky-500",
        bgColor: "bg-sky-500/10",
      },
      {
        title: "Minutos de Audio",
        value: `${stats.totalMin.toLocaleString("es")} min`,
        subtitle: `${(stats.totalMin / 60).toFixed(1)} horas procesadas`,
        icon: FileAudio,
        color: "text-indigo-500",
        bgColor: "bg-indigo-500/10",
      },
      {
        title: "Tiempo Medio (AHT)",
        value: `${stats.avgAhtMin} min`,
        subtitle: `Promedio por llamada`,
        icon: Clock,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
      },
      {
        title: "Score Promedio Voz",
        value: `${stats.avgScoreCalls ?? stats.avgScore}/100`,
        subtitle: `Calidad y cumplimiento`,
        icon: TrendingUp,
        color:
          (stats.avgScoreCalls ?? stats.avgScore) >= 70
            ? "text-emerald-500"
            : (stats.avgScoreCalls ?? stats.avgScore) >= 50
            ? "text-amber-500"
            : "text-rose-500",
        bgColor:
          (stats.avgScoreCalls ?? stats.avgScore) >= 70
            ? "bg-emerald-500/10"
            : (stats.avgScoreCalls ?? stats.avgScore) >= 50
            ? "bg-amber-500/10"
            : "bg-rose-500/10",
      },
      {
        title: "Tasa de Análisis",
        value: `${stats.analysisRate}%`,
        subtitle: `${stats.errorCalls} errores de audio`,
        icon: Zap,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
      },
      {
        title: "% Sentimiento Positivo",
        value: `${positivePct}%`,
        subtitle: `${stats.sentiments.positive} llamadas favorables`,
        icon: Award,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
      },
    ];

    return renderKpiGrid(callKpis);
  }

  // 2. MODO WHATSAPP / MENSAJERÍA
  if (dashboardMode === "whatsapp") {
    const waKpis = [
      {
        title: "Conversaciones WhatsApp",
        value: stats.totalWA.toLocaleString("es"),
        subtitle: `${stats.analyzedWA} analizadas con IA`,
        icon: MessageSquare,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
      },
      {
        title: "Mensajes Totales",
        value: stats.totalWAMsgs.toLocaleString("es"),
        subtitle: `Volumen de interacciones`,
        icon: Smartphone,
        color: "text-teal-500",
        bgColor: "bg-teal-500/10",
      },
      {
        title: "Mensajes por Chat",
        value: `${stats.avgWAMsgs}`,
        subtitle: `Promedio de interacción`,
        icon: Clock,
        color: "text-cyan-500",
        bgColor: "bg-cyan-500/10",
      },
      {
        title: "Score Promedio WA",
        value: `${stats.avgScoreWa ?? stats.avgScore}/100`,
        subtitle: `Calidad de respuesta`,
        icon: TrendingUp,
        color:
          (stats.avgScoreWa ?? stats.avgScore) >= 70
            ? "text-emerald-500"
            : (stats.avgScoreWa ?? stats.avgScore) >= 50
            ? "text-amber-500"
            : "text-rose-500",
        bgColor:
          (stats.avgScoreWa ?? stats.avgScore) >= 70
            ? "bg-emerald-500/10"
            : (stats.avgScoreWa ?? stats.avgScore) >= 50
            ? "bg-amber-500/10"
            : "bg-rose-500/10",
      },
      {
        title: "Tasa de Análisis",
        value: `${stats.analysisRate}%`,
        subtitle: `${stats.errorWA} chats con error`,
        icon: Zap,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
      },
      {
        title: "% Sentimiento Positivo",
        value: `${positivePct}%`,
        subtitle: `${stats.sentiments.positive} chats favorables`,
        icon: Award,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
      },
    ];

    return renderKpiGrid(waKpis);
  }

  // 3. MODO OMNICANAL / GENERAL
  const omniKpis = [
    {
      title: "Total Interacciones",
      value: stats.totalConvs.toLocaleString("es"),
      subtitle: `${stats.totalCalls} llamadas · ${stats.totalWA} WhatsApp`,
      icon: Activity,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Llamadas de Voz",
      value: stats.totalCalls.toLocaleString("es"),
      subtitle: `${stats.callsPct}% del volumen · ${stats.totalMin} min`,
      icon: Phone,
      color: "text-sky-500",
      bgColor: "bg-sky-500/10",
    },
    {
      title: "Chats WhatsApp",
      value: stats.totalWA.toLocaleString("es"),
      subtitle: `${stats.waPct}% del volumen · ${stats.totalWAMsgs.toLocaleString("es")} msgs`,
      icon: Smartphone,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Score Promedio IA",
      value: `${stats.avgScore}/100`,
      subtitle: `Voz: ${stats.avgScoreCalls ?? "—"} · WA: ${stats.avgScoreWa ?? "—"}`,
      icon: TrendingUp,
      color: stats.avgScore >= 70 ? "text-emerald-500" : stats.avgScore >= 50 ? "text-amber-500" : "text-rose-500",
      bgColor: stats.avgScore >= 70 ? "bg-emerald-500/10" : stats.avgScore >= 50 ? "bg-amber-500/10" : "bg-rose-500/10",
    },
    {
      title: "Tiempo Medio (AHT)",
      value: `${stats.avgAhtMin} min`,
      subtitle: `Promedio por llamada`,
      icon: Clock,
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
    },
    {
      title: "Índice CSAT Est.",
      value: `${stats.csatScore}%`,
      subtitle: `${stats.sentiments.positive} interacciones positivas`,
      icon: Award,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  return renderKpiGrid(omniKpis);
}

function renderKpiGrid(
  kpis: Array<{
    title: string;
    value: string;
    subtitle: string;
    icon: any;
    color: string;
    bgColor: string;
  }>,
) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md p-4 transition-all duration-200 hover:shadow-md hover:border-border hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {kpi.title}
              </span>
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${kpi.bgColor} ${kpi.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{kpi.value}</div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">{kpi.subtitle}</p>
          </div>
        );
      })}
    </div>
  );
}
