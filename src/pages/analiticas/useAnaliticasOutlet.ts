import { useOutletContext } from "react-router-dom";
import type { AnaliticasOutletContext } from "./analiticasOutlet";

export function useAnaliticasOutlet() {
  return useOutletContext<AnaliticasOutletContext>();
}
