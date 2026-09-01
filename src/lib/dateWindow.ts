import { startOfMonth, subMonths } from "date-fns";

export type WindowKey = "recent" | "full";

/**
 * Inicio del mes anterior (mes anterior + mes actual = ventana "recent").
 * Se usa para cargar por defecto solo los últimos ~30-60 días y mantener
 * la app ágil, dejando el histórico como carga bajo demanda / segundo plano.
 */
export function getRecentWindowStart(now: Date = new Date()): Date {
  return startOfMonth(subMonths(now, 1));
}

/** ¿Un rango del usuario cabe dentro de la ventana "recent"? */
export function rangeFitsRecent(fromDate: Date | null | undefined, now: Date = new Date()): boolean {
  if (!fromDate) return false; // sin filtro = quiere todo
  return fromDate.getTime() >= getRecentWindowStart(now).getTime();
}
