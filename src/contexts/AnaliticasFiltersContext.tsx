import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { defaultAnaliticasFilters, type AnaliticasFiltersState } from "@/lib/analiticas/types";

interface AnaliticasFiltersContextValue extends AnaliticasFiltersState {
  showFilters: boolean;
  setShowFilters: (v: boolean | ((p: boolean) => boolean)) => void;
  setDateRange: (r: DateRange | undefined) => void;
  setDateBasisCalls: (v: AnaliticasFiltersState["dateBasisCalls"]) => void;
  setDateBasisWa: (v: AnaliticasFiltersState["dateBasisWa"]) => void;
  setSentiment: (v: string) => void;
  setExtAsesor: (v: string) => void;
  setExtCampaña: (v: string) => void;
  setExtFecha: (v: string) => void;
  clearAllFilters: () => void;
}

const AnaliticasFiltersContext = createContext<AnaliticasFiltersContextValue | null>(null);

export function AnaliticasFiltersProvider({ children }: { children: React.ReactNode }) {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AnaliticasFiltersState>(() => defaultAnaliticasFilters());

  const setDateRange = useCallback((r: DateRange | undefined) => {
    setFilters((f) => ({ ...f, dateRange: r }));
  }, []);
  const setDateBasisCalls = useCallback((v: AnaliticasFiltersState["dateBasisCalls"]) => {
    setFilters((f) => ({ ...f, dateBasisCalls: v }));
  }, []);
  const setDateBasisWa = useCallback((v: AnaliticasFiltersState["dateBasisWa"]) => {
    setFilters((f) => ({ ...f, dateBasisWa: v }));
  }, []);
  const setSentiment = useCallback((v: string) => {
    setFilters((f) => ({ ...f, sentiment: v }));
  }, []);
  const setExtAsesor = useCallback((v: string) => {
    setFilters((f) => ({ ...f, extAsesor: v }));
  }, []);
  const setExtCampaña = useCallback((v: string) => {
    setFilters((f) => ({ ...f, extCampaña: v }));
  }, []);
  const setExtFecha = useCallback((v: string) => {
    setFilters((f) => ({ ...f, extFecha: v }));
  }, []);
  const clearAllFilters = useCallback(() => {
    setFilters(defaultAnaliticasFilters());
  }, []);

  const value = useMemo<AnaliticasFiltersContextValue>(
    () => ({
      ...filters,
      showFilters,
      setShowFilters,
      setDateRange,
      setDateBasisCalls,
      setDateBasisWa,
      setSentiment,
      setExtAsesor,
      setExtCampaña,
      setExtFecha,
      clearAllFilters,
    }),
    [
      filters,
      showFilters,
      setDateRange,
      setDateBasisCalls,
      setDateBasisWa,
      setSentiment,
      setExtAsesor,
      setExtCampaña,
      setExtFecha,
      clearAllFilters,
    ],
  );

  return <AnaliticasFiltersContext.Provider value={value}>{children}</AnaliticasFiltersContext.Provider>;
}

export function useAnaliticasFilters() {
  const ctx = useContext(AnaliticasFiltersContext);
  if (!ctx) throw new Error("useAnaliticasFilters debe usarse dentro de AnaliticasFiltersProvider");
  return ctx;
}
