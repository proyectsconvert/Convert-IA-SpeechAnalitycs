import type { useAnaliticasDatasets } from "@/lib/analiticas/useAnaliticasDatasets";
import type { AnaliticasExtOptions } from "@/lib/analiticas/extOptions";

export type AnaliticasData = ReturnType<typeof useAnaliticasDatasets>;

export interface AnaliticasOutletContext {
  data: AnaliticasData;
  extOptions: AnaliticasExtOptions;
}
