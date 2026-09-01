import { useMemo } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { Filter as FilterIcon, Loader2 } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";
import { useAnaliticasDatasets } from "@/lib/analiticas/useAnaliticasDatasets";
import { buildAnaliticasExtOptions } from "@/lib/analiticas/extOptions";
import { AnaliticasFiltersPanel } from "@/components/analiticas/AnaliticasFiltersPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getRecentWindowStart } from "@/lib/dateWindow";

const tabClass = "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
const tabActive = "bg-background text-foreground shadow-sm";
const tabIdle = "text-muted-foreground hover:text-foreground";

export default function AnaliticasLayout() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const f = useAnaliticasFilters();



  // Ventana temporal: por defecto mes actual + anterior. Si el usuario aplica
  // un rango custom que va más atrás, cambiamos a "full" y precargamos.
  const recentSince = useMemo(() => getRecentWindowStart(), []);
  const needsFull = useMemo(() => {
    const from = f.dateRange?.from;
    if (!from) return false;
    return from.getTime() < recentSince.getTime();
  }, [f.dateRange, recentSince]);

  const data = useAnaliticasDatasets(accountId, needsFull ? undefined : { since: recentSince });

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

  const outletCtx = useMemo(() => ({ data, extOptions }), [data, extOptions]);

  if (data.isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse mt-3">Loading operational insights...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indicadores</h1>
          <p className="text-sm text-muted-foreground">Métricas e indicadores estratégicos de operación.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex rounded-lg bg-muted/50 p-1 gap-0.5">
            <NavLink to="/analiticas" end className={({ isActive }) => cn(tabClass, isActive ? tabActive : tabIdle)}>
              Resumen
            </NavLink>
            <NavLink to="/analiticas/llamadas" className={({ isActive }) => cn(tabClass, isActive ? tabActive : tabIdle)}>
              Llamadas
            </NavLink>
            <NavLink to="/analiticas/whatsapp" className={({ isActive }) => cn(tabClass, isActive ? tabActive : tabIdle)}>
              WhatsApp
            </NavLink>
          </nav>
          <Button variant={f.showFilters ? "default" : "outline"} size="sm" onClick={() => f.setShowFilters((v) => !v)} className="gap-1.5 text-xs">
            <FilterIcon className="w-3.5 h-3.5" /> Filtros
          </Button>
        </div>
      </div>

      <AnaliticasFiltersPanel opts={extOptions} />

      <Outlet context={outletCtx} />
    </div>
  );
}
