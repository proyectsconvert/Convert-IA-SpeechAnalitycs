import type { DateRange } from "react-day-picker";

export type AnaliticasDateBasisCalls = "analysis" | "upload";
export type AnaliticasDateBasisWa = "carga" | "analysis";

export interface AnaliticasFiltersState {
  dateRange: DateRange | undefined;
  dateBasisCalls: AnaliticasDateBasisCalls;
  dateBasisWa: AnaliticasDateBasisWa;
  sentiment: string;
  extAsesor: string;
  extCampaña: string;
  extFecha: string;
}

export const defaultAnaliticasFilters = (): AnaliticasFiltersState => ({
  dateRange: undefined,
  dateBasisCalls: "analysis",
  dateBasisWa: "carga",
  sentiment: "all",
  extAsesor: "all",
  extCampaña: "all",
  extFecha: "all",
});
