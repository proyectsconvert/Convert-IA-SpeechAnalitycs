import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";
import { useAnaliticasDatasets } from "@/lib/analiticas/useAnaliticasDatasets";
import { buildAnaliticasExtOptions } from "@/lib/analiticas/extOptions";
import { filterAudioFiles, filterWhatsappConversations } from "@/lib/analiticas/filterDatasets";
import { computeIndicatorsBundle } from "@/lib/analiticas/indicatorsData";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { IndicadoresHeader } from "@/components/analiticas/IndicadoresHeader";
import { AnaliticasFiltersPanel } from "@/components/analiticas/AnaliticasFiltersPanel";
import { GridDashboard } from "@/components/analiticas/GridDashboard";
import { AddWidgetDialog } from "@/components/analiticas/AddWidgetDialog";
import { getRecentWindowStart } from "@/lib/dateWindow";

export default function AnaliticasLayout() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const f = useAnaliticasFilters();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Modal para añadir widgets
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);

  // Determinar dashboard inicial según sub-ruta o search param
  const initialDashboardId = useMemo(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) return tabParam;
    if (location.pathname === "/analiticas/llamadas") return "calls";
    if (location.pathname === "/analiticas/whatsapp") return "whatsapp";
    return "executive";
  }, [location.pathname, searchParams]);

  const [activeDashboardId, setActiveDashboardId] = useState<string>(initialDashboardId);

  // Sincronizar activeDashboardId si cambia la ruta externa
  useEffect(() => {
    setActiveDashboardId(initialDashboardId);
  }, [initialDashboardId]);

  const handleSelectDashboard = (id: string) => {
    setActiveDashboardId(id);
    if (id === "calls") {
      navigate("/analiticas/llamadas", { replace: true });
    } else if (id === "whatsapp") {
      navigate("/analiticas/whatsapp", { replace: true });
    } else if (id === "executive") {
      navigate("/analiticas", { replace: true });
    } else {
      navigate(`/analiticas?tab=${id}`, { replace: true });
    }
  };

  // Ventana temporal para datasets
  const recentSince = useMemo(() => getRecentWindowStart(), []);
  const needsFull = useMemo(() => {
    const from = f.dateRange?.from;
    if (!from) return false;
    return from.getTime() < recentSince.getTime();
  }, [f.dateRange, recentSince]);

  const data = useAnaliticasDatasets(accountId, needsFull ? undefined : { since: recentSince });

  // Opciones de filtros
  const extOptions = useMemo(
    () =>
      buildAnaliticasExtOptions({
        files: data.files,
        mergedExtByFile: data.mergedExtByFile,
        callExtKeys: data.callExtKeys,
        waConversations: data.waConversations,
        waExtCellsByConv: data.waExtCellsByConv,
        waExtKeys: data.waExtKeys,
        waAgentFallbackRecord: data.waAgentFallbackRecord,
      }),
    [
      data.files,
      data.mergedExtByFile,
      data.callExtKeys,
      data.waConversations,
      data.waExtCellsByConv,
      data.waExtKeys,
      data.waAgentFallbackRecord,
    ],
  );

  // Filtrado reactivo de llamadas y WhatsApp
  const filteredFiles = useMemo(
    () =>
      filterAudioFiles(
        data.files,
        data.analysesByFileId,
        data.mergedExtByFile,
        f,
        data.callExtKeys,
      ),
    [data.files, data.analysesByFileId, data.mergedExtByFile, f, data.callExtKeys],
  );

  const filteredWa = useMemo(
    () =>
      filterWhatsappConversations(
        data.waConversations,
        data.waByConvId,
        data.waExtCellsByConv,
        data.waAgentFallbackRecord,
        f,
        data.waExtKeys,
      ),
    [
      data.waConversations,
      data.waByConvId,
      data.waExtCellsByConv,
      data.waAgentFallbackRecord,
      f,
      data.waExtKeys,
    ],
  );

  // Aislamiento estricto por canal según el tablero activo
  const effectiveFiles = useMemo(() => {
    if (activeDashboardId === "whatsapp") return [];
    return filteredFiles;
  }, [activeDashboardId, filteredFiles]);

  const effectiveWa = useMemo(() => {
    if (activeDashboardId === "calls") return [];
    return filteredWa;
  }, [activeDashboardId, filteredWa]);

  // Computación de métricas para el tablero activo
  const indicatorsBundle = useMemo(
    () =>
      computeIndicatorsBundle(
        effectiveFiles,
        effectiveWa,
        data.analysesByFileId,
        data.waByConvId,
        data.waExtCellsByConv,
        data.waAgentFallbackRecord,
        f.dateRange,
        activeDashboardId,
      ),
    [
      effectiveFiles,
      effectiveWa,
      data.analysesByFileId,
      data.waByConvId,
      data.waExtCellsByConv,
      data.waAgentFallbackRecord,
      f.dateRange,
      activeDashboardId,
    ],
  );

  // Manejo de Layout reordenable, redimensionable y persistente por tablero
  const {
    widgets,
    isEditing,
    toggleEditing,
    moveWidget,
    resizeWidget,
    removeWidget,
    addWidget,
    resetToDefault,
  } = useDashboardLayout(accountId, activeDashboardId);

  // Conteo de filtros activos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (f.sentiment !== "all") count++;
    if (f.extAsesor !== "all") count++;
    if (f.extCampaña !== "all") count++;
    if (f.extFecha !== "all") count++;
    return count;
  }, [f.sentiment, f.extAsesor, f.extCampaña, f.extFecha]);

  if (data.isLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-accent/20 animate-ping absolute inset-0" />
          <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center text-accent relative">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Cargando Inteligencia Operacional</h3>
          <p className="text-xs text-muted-foreground animate-pulse">
            Procesando llamadas, WhatsApp y scoring de calidad...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* 1. Barra de Navegación & Control de Tableros */}
      <IndicadoresHeader
        activeDashboardId={activeDashboardId}
        onSelectDashboard={handleSelectDashboard}
        isEditing={isEditing}
        onToggleEdit={toggleEditing}
        onResetLayout={resetToDefault}
        onOpenAddWidget={() => setAddWidgetOpen(true)}
        showFilters={f.showFilters}
        onToggleFilters={() => f.setShowFilters((v) => !v)}
        activeFiltersCount={activeFiltersCount}
      />

      {/* 2. Panel de Filtros Colapsable */}
      <AnaliticasFiltersPanel opts={extOptions} />

      {/* 3. Grid de Widgets Reordenables y Redimensionables */}
      <GridDashboard
        widgets={widgets}
        data={indicatorsBundle}
        isEditing={isEditing}
        onMoveUp={(id) => moveWidget(id, "up")}
        onMoveDown={(id) => moveWidget(id, "down")}
        onResize={resizeWidget}
        onRemove={removeWidget}
        onOpenAddWidget={() => setAddWidgetOpen(true)}
      />

      {/* 4. Modal para Añadir Gráficos y Crear Widgets a Medida */}
      <AddWidgetDialog
        open={addWidgetOpen}
        onOpenChange={setAddWidgetOpen}
        onAddWidget={addWidget}
      />
    </div>
  );
}
