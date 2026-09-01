import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { fetchAnalizadorTotalRawData } from "@/lib/analizador-total/fetchRawData";
import { getRecentWindowStart } from "@/lib/dateWindow";
import {
  filterAnalizadorRows,
  buildChartData,
  computeStats,
  getCurrentDateBounds,
  getPreviousPeriodBounds,
  listCampaignsFromRows,
} from "@/lib/analizador-total/deriveData";
import { DatosMaestrosTab } from "@/components/analizador-total/DatosMaestrosTab";
import { InteractionDetailPanel } from "@/components/analizador-total/InteractionDetailPanel";
import { CentroVisualTab } from "@/components/analizador-total/CentroVisualTab";
import { CentroVisualAgentesTab } from "@/components/analizador-total/CentroVisualAgentesTab";
import { ReporteIaContainer } from "@/components/analizador-total/reporte-ia-v2/ReporteIaContainer";
import { ShareDashboardDialog } from "@/components/analizador-total/ShareDashboardDialog";
import { getMacroprocesoConfig } from "@/lib/analizador-total/macroprocesoConfigs";

import type { ActiveFilterChip } from "@/components/analizador-total/reporte-ia-v2/MasterDataSourcePanel";
import type {
  DateRangePreset,
  UnifiedChannel,
  AnalizadorFilters,
  AnalizadorUnifiedRow,
} from "@/components/analizador-total/types";
import {
  BarChart3,
  FileText,
  Presentation,
  Filter,
  Search,
  LayoutDashboard,
  Table as TableIcon,
  Users,
  Phone,
  MessageCircle,
  Loader2,
  X,
  Sparkles,
  Share2,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import { QualityMatrixTab } from "@/components/analizador-total/quality/QualityMatrixTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MultiSelect } from "@/components/ui/multi-select";

type DateRange = DateRangePreset;

type PresentationRow = Database["public"]["Tables"]["presentations"]["Row"];

export default function AnalizadorTotalPage() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const [, setSearchParams] = useSearchParams();
  const [urlHydrated, setUrlHydrated] = useState(false);

  // Estados de Filtros
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });
  const [pendingCustomRange, setPendingCustomRange] = useState<DayPickerDateRange | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [activeTab, setActiveTab] = useState("data");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [filters, setFilters] = useState<AnalizadorFilters>({
    sentiment: [],
    agent: [],
    campaign: [],
    scoreRange: "all",
    durationRange: "all",
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "created_at", direction: "desc" });
  const [channelFilter, setChannelFilter] = useState<"all" | UnifiedChannel>("all");
  const [vizChannels, setVizChannels] = useState<string[]>([]); // [] = todos
  const [vizCampaigns, setVizCampaigns] = useState<string[]>([]); // [] = todas
  const [agentCenterFilter, setAgentCenterFilter] = useState("all");

  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<AnalizadorUnifiedRow | null>(null);

  // Consultas
  const { data: dbPresentations, refetch: refetchPresentations } = useQuery({
    queryKey: ["presentations", accountId],
    queryFn: async () => {
      if (!accountId) return [] as PresentationRow[];
      const { data, error } = await supabase
        .from("presentations")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PresentationRow[];
    },
    enabled: !!accountId,
  });

  // Ventana de datos: por defecto "recent" (mes actual + anterior). Cuando el
  // usuario aplica un filtro custom que va más atrás, subimos a "full".
  const recentSince = useMemo(() => getRecentWindowStart(), []);
  const needsFullHistory = useMemo(() => {
    if (dateRange === "custom") {
      return customRange.from.getTime() < recentSince.getTime();
    }
    // Los presets today / 7d / 15d / 30d / this_month / last_month siempre caben en recent.
    return false;
  }, [dateRange, customRange, recentSince]);
  const windowKey: "recent" | "full" = needsFullHistory ? "full" : "recent";

  const { data: rawData, isLoading, refetch: refetchRawData, isRefetching: isRefetchingRawData } = useQuery({
    queryKey: ["analizador-total-data", accountId, windowKey],
    queryFn: () =>
      accountId
        ? fetchAnalizadorTotalRawData(accountId, windowKey === "recent" ? { since: recentSince } : undefined)
        : Promise.resolve([]),
    enabled: !!accountId,
    staleTime: 1000 * 15,
    gcTime: 1000 * 60 * 60,
  });

  const channelFilterNorm: "all" | UnifiedChannel =
    channelFilter === "all" ? "all" : channelFilter === "whatsapp" ? "whatsapp" : "call";

  const filteredData = useMemo(
    () =>
      filterAnalizadorRows(rawData, {
        dateRange,
        customRange,
        channelFilter: channelFilterNorm,
        searchTerm: debouncedSearchTerm,
        filters,
        sortConfig,
      }),
    [rawData, dateRange, customRange, debouncedSearchTerm, filters, sortConfig, channelFilterNorm],
  );


  const bounds = useMemo(() => getCurrentDateBounds(dateRange, customRange), [dateRange, customRange]);
  const prevBounds = useMemo(() => getPreviousPeriodBounds(bounds.start, bounds.end), [bounds.start, bounds.end]);

  const filteredDataPrev = useMemo(
    () =>
      filterAnalizadorRows(rawData, {
        dateRange,
        customRange,
        channelFilter: channelFilterNorm,
        searchTerm: debouncedSearchTerm,
        filters,
        sortConfig: null,
        dateBoundsOverride: prevBounds,
      }),
    [rawData, dateRange, customRange, debouncedSearchTerm, filters, channelFilterNorm, prevBounds],
  );


  const applyVizFilters = useCallback(
    (rows: AnalizadorUnifiedRow[]) => {
      let d = rows;
      if (vizChannels.length > 0) {
        const set = new Set(vizChannels);
        d = d.filter((r) => set.has(r.channel));
      }
      if (vizCampaigns.length > 0) {
        const set = new Set(vizCampaigns);
        d = d.filter((r) => set.has(String(r.campaign || "")));
      }
      return d;
    },
    [vizChannels, vizCampaigns],
  );

  const macroproceso = useMemo(() => {
    const raw = (currentAccount?.account as any)?.macroproceso || (currentAccount?.account?.branding as any)?.macroproceso;
    return raw || "ventas";
  }, [currentAccount]);

  const mpConfig = useMemo(() => getMacroprocesoConfig(macroproceso), [macroproceso]);

  const vizFiltered = useMemo(() => applyVizFilters(filteredData), [filteredData, applyVizFilters]);
  const vizFilteredPrev = useMemo(() => applyVizFilters(filteredDataPrev), [filteredDataPrev, applyVizFilters]);

  const chartData = useMemo(() => buildChartData(vizFiltered, macroproceso), [vizFiltered, macroproceso]);
  const stats = useMemo(() => computeStats(vizFiltered), [vizFiltered]);
  const statsPrev = useMemo(() => computeStats(vizFilteredPrev), [vizFilteredPrev]);

  const campaigns = useMemo(() => listCampaignsFromRows(rawData), [rawData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const ch = params.get("channel") as "all" | UnifiedChannel | null;
    const range = params.get("range") as DateRange | null;
    const from = params.get("from");
    const to = params.get("to");
    if (tab === "data" || tab === "dashboards" || tab === "agents" || tab === "presentation") setActiveTab(tab);
    if (ch === "all" || ch === "call" || ch === "whatsapp") setChannelFilter(ch);
    if (range && ["today", "7d", "15d", "30d", "this_month", "last_month", "custom"].includes(range)) {
      setDateRange(range);
      if (range === "custom" && from && to) {
        setCustomRange({ from: new Date(from), to: new Date(to) });
      }
    }
    setUrlHydrated(true);
  }, []);

  useEffect(() => {
    if (!urlHydrated) return;
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("channel", channelFilter);
    params.set("range", dateRange);
    if (dateRange === "custom") {
      params.set("from", customRange.from.toISOString());
      params.set("to", customRange.to.toISOString());
    }
    setSearchParams(params, { replace: true });
  }, [urlHydrated, activeTab, channelFilter, dateRange, customRange, setSearchParams]);

  const chartDataForReport = useMemo(() => buildChartData(filteredData), [filteredData]);
  const statsForReport = useMemo(() => computeStats(filteredData), [filteredData]);

  const loadPresentation = useCallback((presentation: PresentationRow) => {
    setSelectedPresentationId(presentation.id);
    setActiveTab("presentation");
  }, []);

  const selectedPresentation = useMemo(
    () => (dbPresentations ?? []).find((p) => p.id === selectedPresentationId) ?? null,
    [dbPresentations, selectedPresentationId],
  );

  // ---- Filtros activos para el contenedor v2 (chips + payload backend) ----
  const dateRangeLabel = useMemo(() => {
    if (dateRange === "custom") {
      return `${format(customRange.from, "PP", { locale: es })} – ${format(customRange.to, "PP", { locale: es })}`;
    }
    const labels: Record<Exclude<DateRange, "custom">, string> = {
      today: "Hoy",
      "7d": "Últimos 7 días",
      "15d": "Últimos 15 días",
      "30d": "Últimos 30 días",
      this_month: "Este mes",
      last_month: "Mes pasado",
    };
    return labels[dateRange as Exclude<DateRange, "custom">];
  }, [dateRange, customRange]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    chips.push({ key: "date", label: `Fecha: ${dateRangeLabel}` });
    if (channelFilter !== "all") {
      chips.push({
        key: "channel",
        label: `Canal: ${channelFilter === "whatsapp" ? "WhatsApp" : "Llamadas"}`,
        onRemove: () => setChannelFilter("all"),
      });
    }
    if (filters.sentiment.length > 0) {
      chips.push({
        key: "sentiment",
        label: `Sentimiento: ${filters.sentiment.join(", ")}`,
        onRemove: () => setFilters((f) => ({ ...f, sentiment: [] })),
      });
    }
    if (filters.agent.length > 0) {
      chips.push({
        key: "agent",
        label: `Asesor: ${filters.agent.length === 1 ? filters.agent[0] : `${filters.agent.length} asesores`}`,
        onRemove: () => setFilters((f) => ({ ...f, agent: [] })),
      });
    }
    if (filters.campaign.length > 0) {
      chips.push({
        key: "campaign",
        label: `Campaña: ${filters.campaign.length === 1 ? filters.campaign[0] : `${filters.campaign.length} campañas`}`,
        onRemove: () => setFilters((f) => ({ ...f, campaign: [] })),
      });
    }
    if (filters.scoreRange !== "all") {
      chips.push({
        key: "score",
        label: `Score: ${filters.scoreRange}`,
        onRemove: () => setFilters((f) => ({ ...f, scoreRange: "all" })),
      });
    }
    if (filters.durationRange !== "all") {
      chips.push({
        key: "duration",
        label: `Duración: ${filters.durationRange}`,
        onRemove: () => setFilters((f) => ({ ...f, durationRange: "all" })),
      });
    }
    if (searchTerm.trim()) {
      chips.push({ key: "search", label: `Texto: "${searchTerm.trim()}"`, onRemove: () => setSearchTerm("") });
    }
    return chips;
  }, [dateRangeLabel, channelFilter, filters, searchTerm]);

  const activeFiltersForBackend = useMemo<Record<string, unknown>>(
    () => ({
      dateRange,
      customRange: dateRange === "custom" ? { from: customRange.from.toISOString(), to: customRange.to.toISOString() } : null,
      channelFilter,
      sentiment: filters.sentiment,
      agent: filters.agent,
      campaign: filters.campaign,
      scoreRange: filters.scoreRange,
      durationRange: filters.durationRange,
      searchTerm: searchTerm.trim() || null,
    }),
    [dateRange, customRange, channelFilter, filters, searchTerm],
  );


  const agents = useMemo(() => {
    if (!rawData) return [];
    return Array.from(new Set(rawData.map((d) => d.agent))).filter(Boolean);
  }, [rawData]);

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse mt-3">Sincronizando análisis integral...</p>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full space-y-5 animate-fade-in relative">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground">Analítica Unificada</h1>
              <Badge variant="outline" className="text-xs font-semibold gap-1.5 px-2.5 py-1 bg-muted/40 border-border">
                <span>{mpConfig.emoji}</span>
                <span>{mpConfig.label}</span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Exploración unificada de voz y WhatsApp, tableros dinámicos y reportes de IA para {mpConfig.label.toLowerCase()}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-9 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary flex items-center gap-2"
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="w-4 h-4" />
            Compartir Dashboards
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-9 text-xs flex items-center gap-2"
            onClick={() => {
              refetchRawData();
              toast.success("Datos sincronizados con éxito");
            }}
            disabled={isRefetchingRawData}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetchingRawData && "animate-spin")} />
            {isRefetchingRawData ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
            {(["today", "7d", "15d", "30d", "this_month", "last_month", "custom"] as const).map((r) => (
              r === "custom" ? (
                <Popover
                  key={r}
                  onOpenChange={(open) => {
                    if (open) {
                      setPendingCustomRange(
                        dateRange === "custom"
                          ? { from: customRange.from, to: customRange.to }
                          : undefined,
                      );
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all capitalize whitespace-nowrap",
                        dateRange === "custom" 
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/50" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Personalizado
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden shadow-2xl border-border/40" align="end">
                    <ShadcnCalendar
                      initialFocus
                      mode="range"
                      defaultMonth={pendingCustomRange?.from ?? customRange.from}
                      selected={pendingCustomRange}
                      onSelect={(range: DayPickerDateRange | undefined) => {
                        setPendingCustomRange(range);
                        if (range?.from && range?.to) {
                          setCustomRange({ from: range.from, to: range.to });
                          setDateRange("custom");
                        }
                      }}
                      numberOfMonths={2}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all capitalize",
                    dateRange === r 
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "today" ? "Hoy" : r === "7d" ? "7 días" : r === "15d" ? "15 días" : r === "30d" ? "30 días" : r === "this_month" ? "Este Mes" : r === "last_month" ? "Mes Pasado" : ""}
                </button>
              )
            ))}
          </div>
          <div className="h-8 w-px bg-border/50 mx-2 hidden xl:block" />
          <Select value={channelFilter} onValueChange={(v: "all" | UnifiedChannel) => setChannelFilter(v)}>
            <SelectTrigger className="h-9 w-full sm:w-[150px] rounded-lg text-xs">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              <SelectItem value="call">Llamadas</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 w-full xl:w-auto">
            <div className="relative flex-1 xl:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input 
                placeholder="Buscar archivo, resumen, campaña..." 
                className="h-9 pl-10 text-xs rounded-lg" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button
              variant={showAdvancedFilters ? "default" : "outline"}
              size="icon"
              className="h-9 w-9 rounded-lg flex-shrink-0"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel (inline collapsible) */}
      {showAdvancedFilters && (
        <Card className="border shadow-sm animate-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2 px-5 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Filtros Avanzados</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAdvancedFilters(false)}><X className="w-3.5 h-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 px-5 pb-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Sentimiento</p>
              <MultiSelect
                options={[
                  { value: "positive", label: "Positivo" },
                  { value: "negative", label: "Negativo" },
                  { value: "neutral", label: "Neutral" },
                ]}
                selected={filters.sentiment}
                onChange={(v) => setFilters((prev) => ({ ...prev, sentiment: v }))}
                allLabel="Todos"
                placeholder="Buscar sentimiento"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Asesor</p>
              <MultiSelect
                options={agents.map((a) => ({ value: a, label: a }))}
                selected={filters.agent}
                onChange={(v) => setFilters((prev) => ({ ...prev, agent: v }))}
                allLabel="Cualquier Asesor"
                placeholder="Buscar asesor"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Campaña</p>
              <MultiSelect
                options={campaigns.map((c) => ({ value: c, label: c }))}
                selected={filters.campaign}
                onChange={(v) => setFilters((prev) => ({ ...prev, campaign: v }))}
                allLabel="Todas"
                placeholder="Buscar campaña"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Calidad (Score)</p>
              <Select
                value={filters.scoreRange}
                onValueChange={(v: AnalizadorFilters["scoreRange"]) => setFilters((prev) => ({ ...prev, scoreRange: v }))}
              >
                <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cualquier Score</SelectItem>
                  <SelectItem value="low">Crítico ({"<"}60%)</SelectItem>
                  <SelectItem value="mid">Estándar (60-80%)</SelectItem>
                  <SelectItem value="high">Excelente ({">"}80%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Duración</p>
              <Select
                value={filters.durationRange}
                onValueChange={(v: AnalizadorFilters["durationRange"]) =>
                  setFilters((prev) => ({ ...prev, durationRange: v }))
                }
              >
                <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cualquier Duración</SelectItem>
                  <SelectItem value="short">Corta ({"<"} 30m)</SelectItem>
                  <SelectItem value="medium">Media (30-60m)</SelectItem>
                  <SelectItem value="long">Larga ({">"} 60m)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              className="w-full h-9 text-xs font-medium rounded-lg"
              onClick={() =>
                setFilters({ sentiment: [], agent: [], campaign: [], scoreRange: "all", durationRange: "all" })
              }
            >
              Limpiar Filtros
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col space-y-5 min-h-0">
        <TabsList className="flex w-fit bg-muted/50 p-1 rounded-lg">
          <TabsTrigger value="data" className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium">
            <TableIcon className="w-3.5 h-3.5" /> Datos Maestros
          </TabsTrigger>
          <TabsTrigger value="dashboards" className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium">
            <LayoutDashboard className="w-3.5 h-3.5" /> Centro Visual
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium">
            <Users className="w-3.5 h-3.5" /> Centro Visual Agentes
          </TabsTrigger>
          <TabsTrigger value="presentation" className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium">
            <Presentation className="w-3.5 h-3.5" /> Reporte IA
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium">
            <ClipboardCheck className="w-3.5 h-3.5" /> Matriz de Calidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="flex-1 min-h-0 focus-visible:outline-none data-[state=active]:flex data-[state=inactive]:hidden flex-col mt-0">
          <DatosMaestrosTab
            accountId={accountId}
            filteredData={filteredData}
            stats={statsForReport}
            sortConfig={sortConfig}
            setSortConfig={setSortConfig}
            onRowClick={setSelectedCall}
            macroproceso={macroproceso}
          />
        </TabsContent>

        <TabsContent value="dashboards" className="flex-1 min-h-0 space-y-6 focus-visible:outline-none data-[state=inactive]:hidden">
          <CentroVisualTab
            chartData={chartData}
            stats={stats}
            statsPrev={statsPrev}
            filteredData={vizFiltered}
            selectedChannels={vizChannels}
            onSelectedChannelsChange={setVizChannels}
            campaigns={campaigns}
            selectedCampaigns={vizCampaigns}
            onSelectedCampaignsChange={setVizCampaigns}
            onGoToReportIa={() => setActiveTab("presentation")}
            macroproceso={macroproceso}
          />
        </TabsContent>

        <TabsContent value="agents" className="flex-1 min-h-0 space-y-6 focus-visible:outline-none data-[state=inactive]:hidden">
          <CentroVisualAgentesTab
            filteredData={vizFiltered}
            previousData={vizFilteredPrev}
            campaigns={campaigns}
            selectedAgent={agentCenterFilter}
            onSelectedAgentChange={(agent) => setAgentCenterFilter(prev => prev === agent ? "all" : agent)}
            macroproceso={macroproceso}
          />
        </TabsContent>

        <TabsContent value="presentation" className="flex min-h-0 flex-1 flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <ReporteIaContainer
            accountId={accountId}
            filteredRows={filteredData}
            totalRowsBeforeFilter={rawData?.length ?? 0}
            activeFilterChips={activeFilterChips}
            activeFiltersForBackend={activeFiltersForBackend}
            dateRangeLabel={dateRangeLabel}
            onGoToMasterData={() => setActiveTab("data")}
            initialPresentation={selectedPresentation}
            onSaved={() => refetchPresentations()}
            macroproceso={macroproceso}
          />
        </TabsContent>

        <TabsContent value="quality" className="flex-1 min-h-0 space-y-6 focus-visible:outline-none data-[state=inactive]:hidden">
          <QualityMatrixTab rawData={rawData} />
        </TabsContent>
      </Tabs>


      <Sheet open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl lg:max-w-3xl p-0 border-l-border/40 bg-card/95 backdrop-blur-3xl flex flex-col"
        >
          {selectedCall && (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>{selectedCall.file_name}</SheetTitle>
                <SheetDescription>
                  Detalle de la interacción {selectedCall.channel === "whatsapp" ? "de WhatsApp" : "de voz"}
                </SheetDescription>
              </SheetHeader>
              <InteractionDetailPanel row={selectedCall} />
            </>
          )}
        </SheetContent>
      </Sheet>

      <ShareDashboardDialog 
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        accountId={accountId}
      />
    </div>
  );
}
