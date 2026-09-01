import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { format, subDays, eachDayOfInterval, isAfter } from "date-fns";
import { Loader2 } from "lucide-react";
import { useDashboardLayout, DashboardWidgetConfig } from "@/hooks/useDashboardLayout";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AddWidgetModal } from "@/components/dashboard/AddWidgetModal";
import { WidgetContainer } from "@/components/dashboard/WidgetContainer";
import { fetchAnalizadorTotalRawData } from "@/lib/analizador-total/fetchRawData";
import { getRecentWindowStart } from "@/lib/dateWindow";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";

// Widgets especializados
import { KpiMetricsWidget } from "@/components/dashboard/widgets/KpiMetricsWidget";
import { TrendActivityWidget } from "@/components/dashboard/widgets/TrendActivityWidget";
import { SentimentDonutWidget } from "@/components/dashboard/widgets/SentimentDonutWidget";
import { TopMotivosWidget, TagMotivoItem } from "@/components/dashboard/widgets/TopMotivosWidget";
import { AgentsRankingWidget } from "@/components/dashboard/widgets/AgentsRankingWidget";
import { ChannelDistributionWidget } from "@/components/dashboard/widgets/ChannelDistributionWidget";
import { ExecutiveSummaryWidget } from "@/components/dashboard/widgets/ExecutiveSummaryWidget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/RecentActivityWidget";

export default function DashboardPage() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "all">("7d");
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Hook del diseño personalizable y persistente
  const {
    widgets,
    moveWidget,
    reorderWidget,
    setColSpan,
    removeWidget,
    addWidget,
    saveLayout,
    resetToDefault,
    isCustomizing,
    setIsCustomizing,
    isDirty,
    isSaving,
  } = useDashboardLayout(accountId);

  // 1. Carga de datos unificados maestros (Misma fuente que Analítica Unificada)
  const since = getRecentWindowStart();
  const { data: unifiedRows, isLoading: loadingRows } = useQuery({
    queryKey: ["analizador-total-data", accountId, "recent"],
    queryFn: () =>
      accountId ? fetchAnalizadorTotalRawData(accountId, { since }) : Promise.resolve([]),
    enabled: !!accountId,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Fallback de conteo global de audio files para auditar estados pendientes/errores
  const { data: audioStats } = useQuery({
    queryKey: ["dashboard-audio-status-counts", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data: files } = await supabase
        .from("audio_files")
        .select("id, status, duration_seconds, file_name, created_at")
        .eq("account_id", accountId);

      if (!files) return { total: 0, completed: 0, error: 0, pending: 0, totalDuration: 0, files: [] };

      return {
        total: files.length,
        completed: files.filter((f) => f.status === "completed").length,
        error: files.filter((f) => f.status === "error").length,
        pending: files.filter((f) =>
          ["uploaded", "pending", "queued", "transcribing", "analyzing"].includes(f.status)
        ).length,
        totalDuration: files.reduce((s, f) => s + (f.duration_seconds || 0), 0),
        files,
      };
    },
    enabled: !!accountId,
  });

  // 3. Filtrar registros según el rango temporal seleccionado
  const scopedRows = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];
    if (dateRange === "all") return unifiedRows;

    const days = dateRange === "30d" ? 30 : dateRange === "14d" ? 14 : 7;
    const cutoff = subDays(new Date(), days);

    return unifiedRows.filter((r) => {
      const d = new Date(r.created_at);
      return !isNaN(d.getTime()) && isAfter(d, cutoff);
    });
  }, [unifiedRows, dateRange]);

  // 4. Métricas Clave y Agregaciones Semánticas (Motivos, Tags, Resultados, Agentes)
  const metrics = useMemo(() => {
    const rows = scopedRows;
    const callRows = rows.filter((r) => r.channel === "call");
    const waRows = rows.filter((r) => r.channel === "whatsapp");

    const totalCalls = callRows.length;
    const totalWhatsApp = waRows.length;
    const totalInteractions = rows.length;

    const totalSeconds = rows.reduce((acc, r) => acc + (r.duration || 0), 0);
    const totalMinutes = Math.round(totalSeconds / 60);

    // Sentimiento promedio & conteos
    let posCount = 0;
    let neuCount = 0;
    let negCount = 0;
    let scoreSum = 0;
    let scoredCount = 0;

    rows.forEach((r) => {
      if (r.sentiment === "positive") posCount++;
      else if (r.sentiment === "negative") negCount++;
      else neuCount++;

      if (typeof r.score === "number" && r.score > 0) {
        scoreSum += r.score <= 1.5 ? r.score * 100 : r.score;
        scoredCount++;
      }
    });

    const avgSentiment = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;
    const analysisRate = totalInteractions > 0 ? 100 : 0;

    // ── MOTIVOS, RESULTADOS COMERCIALES Y TAGS ──
    const motivoCount: Record<string, number> = {};
    const resultadoCount: Record<string, number> = {};
    const tagCount: Record<string, number> = {};
    const objecionCount: Record<string, number> = {};

    rows.forEach((row: any) => {
      // 1. Intención / Motivo Principal
      const mot = row.motivo_principal;
      if (
        mot &&
        typeof mot === "string" &&
        !/^(otros|desconocido|ninguno|n\/a|na|none|-+)$/i.test(mot.trim())
      ) {
        const clean = mot.trim();
        motivoCount[clean] = (motivoCount[clean] || 0) + 1;
      }

      // 2. Resultado Comercial / Operación
      const res = row.resultado_operacion;
      if (
        res &&
        typeof res === "string" &&
        !/^(otros|desconocido|ninguno|n\/a|na|none|-+)$/i.test(res.trim())
      ) {
        const clean = res.trim();
        resultadoCount[clean] = (resultadoCount[clean] || 0) + 1;
      }

      // 3. Tags y Etiquetas IA
      if (Array.isArray(row.tags)) {
        row.tags.forEach((t: string) => {
          if (t && typeof t === "string" && t.trim().length > 1) {
            const clean = t.trim();
            tagCount[clean] = (tagCount[clean] || 0) + 1;
          }
        });
      }

      // 4. Extracciones de resultados y objeciones
      const resObj = row.results || {};
      const objecion =
        resObj.objecion ||
        resObj.Objecion ||
        resObj.motivo_no_pago ||
        resObj.objeciones ||
        resObj.objecion_principal;
      if (
        objecion &&
        typeof objecion === "string" &&
        !/^(no|ninguna|ninguno|n\/a|na|false|-+)$/i.test(objecion.trim())
      ) {
        const clean = objecion.trim();
        objecionCount[clean] = (objecionCount[clean] || 0) + 1;
      }

      // 5. Columnas de reglas de extracción ext_*
      Object.keys(row).forEach((k) => {
        if (k.startsWith("ext_") && row[k] && typeof row[k] === "string") {
          const val = String(row[k]).trim();
          if (val && !/^(si|no|true|false|n\/a|ninguno|-+)$/i.test(val)) {
            const label = `${k.replace(/^ext_/, "")}: ${val}`;
            tagCount[label] = (tagCount[label] || 0) + 1;
          }
        }
      });
    });

    const totalScoped = Math.max(rows.length, 1);

    const tagMotivoItems: TagMotivoItem[] = [
      ...Object.entries(motivoCount).map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalScoped) * 100),
        category: "motivo" as const,
      })),
      ...Object.entries(resultadoCount).map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalScoped) * 100),
        category: "resultado" as const,
      })),
      ...Object.entries(tagCount).map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalScoped) * 100),
        category: "tag" as const,
      })),
      ...Object.entries(objecionCount).map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalScoped) * 100),
        category: "objecion" as const,
      })),
    ].sort((a, b) => b.count - a.count);

    // ── RANKING DE ASESORES ──
    const agentsMap: Record<
      string,
      { calls: number; totalScore: number; scoreCount: number; positiveCount: number; totalSent: number }
    > = {};

    rows.forEach((r: any) => {
      let agentName = r.agent || "Asesor";
      if (agentName === "Desconocido" || agentName === "Unknown") {
        if (r.summary && typeof r.summary === "string") {
          const match = r.summary.match(/(?:asesora?|agente|ejecutiv[ao])\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i);
          if (match) agentName = match[1];
        }
      }

      if (!agentsMap[agentName]) {
        agentsMap[agentName] = { calls: 0, totalScore: 0, scoreCount: 0, positiveCount: 0, totalSent: 0 };
      }
      agentsMap[agentName].calls++;

      if (typeof r.score === "number" && r.score > 0) {
        const normalized = r.score <= 1.5 ? r.score * 100 : r.score;
        agentsMap[agentName].totalScore += normalized;
        agentsMap[agentName].scoreCount++;
      }
      agentsMap[agentName].totalSent++;
      if (r.sentiment === "positive") {
        agentsMap[agentName].positiveCount++;
      }
    });

    const rankedAgents = Object.entries(agentsMap)
      .map(([name, stat]) => {
        const avgScore = stat.scoreCount > 0 ? Math.round(stat.totalScore / stat.scoreCount) : 85;
        const posRatio = stat.totalSent > 0 ? stat.positiveCount / stat.totalSent : 0.5;
        const sentimentLabel = posRatio >= 0.6 ? "positivo" : posRatio <= 0.3 ? "negativo" : "neutral";
        return {
          name,
          callsCount: stat.calls,
          avgScore,
          sentimentLabel,
        };
      })
      .sort((a, b) => b.callsCount - a.callsCount || b.avgScore - a.avgScore);

    return {
      totalInteractions,
      totalCalls,
      totalWhatsApp,
      totalMinutes,
      analysisRate,
      avgSentiment,
      posCount,
      neuCount,
      negCount,
      tagMotivoItems,
      agents: rankedAgents,
    };
  }, [scopedRows]);

  // 5. Evolución Temporal (Área multi-canal)
  const trendData = useMemo(() => {
    const daysCount = dateRange === "30d" ? 29 : dateRange === "14d" ? 13 : 6;
    const days = eachDayOfInterval({ start: subDays(new Date(), daysCount), end: new Date() });
    const dayLabels = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

    return days.map((day) => {
      const ds = format(day, "yyyy-MM-dd");
      const callsInDay = (scopedRows || []).filter((r) => {
        const rDate = format(new Date(r.created_at), "yyyy-MM-dd");
        return r.channel === "call" && rDate === ds;
      }).length;
      const waInDay = (scopedRows || []).filter((r) => {
        const rDate = format(new Date(r.created_at), "yyyy-MM-dd");
        return r.channel === "whatsapp" && rDate === ds;
      }).length;

      return {
        date: ds,
        day: `${dayLabels[day.getDay()]} ${format(day, "dd/MM")}`,
        llamadas: callsInDay,
        whatsapp: waInDay,
      };
    });
  }, [scopedRows, dateRange]);

  // 6. Actividad Reciente en Vivo
  const recentActivities = useMemo(() => {
    if (!scopedRows || scopedRows.length === 0) return [];
    return [...scopedRows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((r) => ({
        id: r.id.replace(/^wa-/, ""),
        channel: r.channel,
        name: r.file_name,
        status: "completed",
        detail:
          r.channel === "call"
            ? `${Math.floor((r.duration || 0) / 60)}:${((r.duration || 0) % 60).toString().padStart(2, "0")}`
            : `${r.duration || 0} seg`,
        date: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
        sortDate: new Date(r.created_at).getTime(),
      }));
  }, [scopedRows]);

  if (loadingRows && (!unifiedRows || unifiedRows.length === 0)) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest animate-pulse">
          Cargando tablero de inicio...
        </p>
      </div>
    );
  }

  // Renderizador dinámico de widgets
  const renderWidgetContent = (widget: DashboardWidgetConfig) => {
    switch (widget.type) {
      case "kpis":
        return (
          <KpiMetricsWidget
            totalInteractions={metrics.totalInteractions}
            totalCalls={metrics.totalCalls}
            totalWhatsApp={metrics.totalWhatsApp}
            avgSentiment={metrics.avgSentiment}
            totalMinutes={metrics.totalMinutes}
            analysisRate={metrics.analysisRate}
          />
        );
      case "trend_activity":
        return <TrendActivityWidget data={trendData} />;
      case "sentiment_donut":
        return (
          <SentimentDonutWidget
            positiveCount={metrics.posCount}
            neutralCount={metrics.neuCount}
            negativeCount={metrics.negCount}
          />
        );
      case "top_motivos":
        return <TopMotivosWidget items={metrics.tagMotivoItems} />;
      case "agents_ranking":
        return <AgentsRankingWidget agents={metrics.agents} />;
      case "channel_distribution":
        return (
          <ChannelDistributionWidget
            totalCalls={metrics.totalCalls}
            totalWhatsApp={metrics.totalWhatsApp}
            callMinutes={metrics.totalMinutes}
            waMessages={0}
          />
        );
      case "executive_summary":
        return (
          <ExecutiveSummaryWidget
            completedCalls={metrics.totalCalls}
            completedWa={metrics.totalWhatsApp}
            pendingTotal={audioStats?.pending || 0}
            errorCount={audioStats?.error || 0}
          />
        );
      case "recent_activity":
        return <RecentActivityWidget activities={recentActivities} />;
      default:
        return null;
    }
  };

  const visibleWidgets = widgets.filter((w) => w.visible);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Cabecera de Inicio con controles de guardado y personalización */}
      <DashboardHeader
        accountName={currentAccount?.account.name}
        dateRange={dateRange}
        onChangeDateRange={setDateRange}
        isCustomizing={isCustomizing}
        onToggleCustomizing={() => setIsCustomizing(!isCustomizing)}
        onOpenAddModal={() => setAddModalOpen(true)}
        onSaveLayout={() => saveLayout()}
        onResetLayout={resetToDefault}
        isDirty={isDirty}
        isSaving={isSaving}
      />

      {/* Cuadrícula Dinámica de Widgets Reordenables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {visibleWidgets.map((widget, index) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            index={index}
            totalWidgets={visibleWidgets.length}
            isCustomizing={isCustomizing}
            onMove={moveWidget}
            onReorder={reorderWidget}
            onSetColSpan={setColSpan}
            onRemove={removeWidget}
          >
            {renderWidgetContent(widget)}
          </WidgetContainer>
        ))}
      </div>

      {/* Modal para Añadir Nuevos Widgets */}
      <AddWidgetModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onAddWidget={addWidget}
      />
    </div>
  );
}
