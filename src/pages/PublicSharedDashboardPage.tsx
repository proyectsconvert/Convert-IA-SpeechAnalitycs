import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { processRawDataIntoUnifiedRows } from "@/lib/analizador-total/processRawData";
import { 
  Lock, 
  Globe, 
  RefreshCcw, 
  LayoutDashboard, 
  UserRound,
  Filter,
  Search,
  X,
  Calendar as CalendarIcon
} from "lucide-react";
import { 
  filterAnalizadorRows,
  buildChartData, 
  computeStats, 
  listCampaignsFromRows,
  getCurrentDateBounds
} from "@/lib/analizador-total/deriveData";
import { CentroVisualTab } from "@/components/analizador-total/CentroVisualTab";
import { CentroVisualAgentesTab } from "@/components/analizador-total/CentroVisualAgentesTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import type { DateRangePreset } from "@/components/analizador-total/types";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicSharedDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [password, setPassword] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [authError, setAuthError] = useState("");

  // Estados locales para el dashboard (similares a AnalizadorTotalPage)
  const [dateRange, setDateRange] = useState<DateRangePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });
  const [dashboardChannel, setDashboardChannel] = useState<"all" | "call" | "whatsapp">("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async (pwd?: string) => {
    setLoading(true);
    try {
      const { start, end } = getCurrentDateBounds(dateRange, customRange);

      const { data: resp, error } = await supabase.functions.invoke("get-shared-dashboard-data", {
        body: { 
          token, 
          password: pwd || password,
          startDate: start.toISOString(),
          endDate: end.toISOString()
        }
      });

      if (error) throw error;
      if (resp.error === "password_required" || resp.error === "password_incorrect") {
        setAuthRequired(true);
        setAuthError(resp.error === "password_incorrect" ? "Contraseña incorrecta" : "");
        setLoading(false);
        return;
      }
      if (resp.error) throw new Error(resp.error);

      setConfig(resp.config);
      const processed = processRawDataIntoUnifiedRows(resp.data);
      setData(processed);
      setAuthRequired(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Error al cargar el dashboard: " + (e.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      if (!loading && !authRequired) {
        void fetchData();
      }
    }, 30000); // 30 segundos
    return () => clearInterval(interval);
  }, [token, authRequired, dateRange, customRange]);

  // Bloquear atajos comunes (imprimir, guardar, devtools, menú contextual)
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        (k === "s" || k === "p" || k === "u" || (e.shiftKey && (k === "i" || k === "j")))
      ) {
        e.preventDefault();
      }
      if (k === "f12") e.preventDefault();
    };
    const blockContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", blockKeys);
    window.addEventListener("contextmenu", blockContext);
    return () => {
      window.removeEventListener("keydown", blockKeys);
      window.removeEventListener("contextmenu", blockContext);
    };
  }, []);

  // Aplicar filtros visuales (replica la lógica de AnalizadorTotalPage)
  const vizFiltered = useMemo(() => {
    return filterAnalizadorRows(data, {
      dateRange,
      customRange,
      channelFilter: dashboardChannel,
      searchTerm,
      filters: {
        sentiment: [],
        agent: [],
        campaign: campaignFilter === "all" ? [] : [campaignFilter],
        scoreRange: "all",
        durationRange: "all"
      },
      sortConfig: null
    });
  }, [data, dateRange, customRange, dashboardChannel, searchTerm, campaignFilter]);

  const vizFilteredPrev = useMemo(() => {
    const { start, end } = getCurrentDateBounds(dateRange, customRange);
    const ms = end.getTime() - start.getTime();
    const prevBounds = {
      start: new Date(start.getTime() - ms),
      end: new Date(end.getTime() - ms),
    };
    return filterAnalizadorRows(data, {
      dateRange,
      customRange,
      channelFilter: dashboardChannel,
      searchTerm,
      filters: {
        sentiment: [],
        agent: [],
        campaign: campaignFilter === "all" ? [] : [campaignFilter],
        scoreRange: "all",
        durationRange: "all"
      },
      sortConfig: null,
      dateBoundsOverride: prevBounds
    });
  }, [data, dateRange, customRange, dashboardChannel, searchTerm, campaignFilter]);

  const macroproceso = useMemo(() => {
    return config?.macroproceso || config?.branding?.macroproceso || "ventas";
  }, [config]);

  // Cálculos derivados basados en los datos filtrados visualmente
  const stats = useMemo(() => computeStats(vizFiltered), [vizFiltered]);
  const statsPrev = useMemo(() => computeStats(vizFilteredPrev), [vizFilteredPrev]);
  const chartData = useMemo(() => buildChartData(vizFiltered, macroproceso), [vizFiltered, macroproceso]);
  const campaigns = useMemo(() => listCampaignsFromRows(data), [data]);

  if (loading && !config) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Dashboard Protegido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Este tablero requiere una contraseña para ser visualizado.
            </p>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
              />
              {authError && <p className="text-xs text-destructive text-center">{authError}</p>}
            </div>
            <Button className="w-full" onClick={() => fetchData()}>Desbloquear</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Dashboard no encontrado</h1>
          <p className="text-muted-foreground">El link puede haber expirado o sido revocado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 select-none">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Convert-IA" className="w-8 h-8 rounded-lg object-cover bg-white" />
            <div>
              <h1 className="text-lg font-bold leading-none">Convert-IA</h1>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                Speech Analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Filtros de Fecha */}
            <div className="hidden lg:flex items-center bg-muted/50 p-1 rounded-xl border border-border/50">
              {(["today", "7d", "15d", "30d", "this_month", "last_month", "custom"] as const).map((r) => (
                r === "custom" ? (
                  <Popover key="custom">
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
                        defaultMonth={customRange.from}
                        selected={{ from: customRange.from, to: customRange.to }}
                        onSelect={(range: DayPickerDateRange | undefined) => {
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

            <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={loading} className="h-9 rounded-xl">
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8">
        <Tabs defaultValue="visual" className="w-full">
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-background border shadow-sm">
              <TabsTrigger value="visual" className="gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard General
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-2">
                <UserRound className="w-4 h-4" />
                Desempeño de Agentes
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="visual" className="space-y-6 mt-0">
            <CentroVisualTab
              chartData={chartData}
              stats={stats}
              statsPrev={statsPrev}
              filteredData={vizFiltered}
              selectedChannels={dashboardChannel === "all" ? [] : [dashboardChannel]}
              onSelectedChannelsChange={(v) => setDashboardChannel(v.length === 1 ? (v[0] as "call" | "whatsapp") : "all")}
              campaigns={campaigns}
              selectedCampaigns={campaignFilter === "all" ? [] : [campaignFilter]}
              onSelectedCampaignsChange={(v) => setCampaignFilter(v.length === 1 ? v[0] : "all")}
              onGoToReportIa={() => {}} // No disponible en visor público
              hideIAReport={true}
              macroproceso={macroproceso}
            />
          </TabsContent>

          <TabsContent value="agents" className="space-y-6 mt-0">
            <CentroVisualAgentesTab
              filteredData={vizFiltered}
              previousData={vizFilteredPrev}
              campaigns={campaigns}
              selectedAgent={selectedAgent}
              onSelectedAgentChange={(agent) => setSelectedAgent(prev => prev === agent ? "all" : agent)}
              macroproceso={macroproceso}
            />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t py-6 bg-background mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Convert-IA speech analytics
          </p>
        </div>
      </footer>
    </div>
  );
}
