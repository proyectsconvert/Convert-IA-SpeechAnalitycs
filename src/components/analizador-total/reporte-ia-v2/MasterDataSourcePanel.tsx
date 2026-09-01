import { Database, Sparkles, Eye, Loader2, ArrowRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ActiveFilterChip = {
  key: string;
  label: string;
  /** Si se entrega, permite remover el chip desde el panel. */
  onRemove?: () => void;
};

interface Props {
  rowsCount: number;
  totalCount: number;
  filterChips: ActiveFilterChip[];
  isStale: boolean;
  isAnalyzing: boolean;
  onOpenColumnsDrawer: () => void;
  onGenerate: () => void;
  onGoToMasterData: () => void;
}

export function MasterDataSourcePanel({
  rowsCount,
  totalCount,
  filterChips,
  isStale,
  isAnalyzing,
  onOpenColumnsDrawer,
  onGenerate,
  onGoToMasterData,
}: Props) {
  return (
    <Card className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Datos Maestros · dataset filtrado
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{rowsCount.toLocaleString("es")}</span>
              <span className="text-sm text-muted-foreground">filas filtradas</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">de {totalCount.toLocaleString("es")} totales</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToMasterData}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Ir a Datos Maestros para ajustar filtros
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtros activos</span>
          </div>
          {filterChips.length === 0 ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Sin filtros · dataset completo
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((c) => (
                <Badge
                  key={c.key}
                  variant="secondary"
                  className="gap-1 text-xs"
                  onClick={c.onRemove ? () => c.onRemove?.() : undefined}
                >
                  <span>{c.label}</span>
                  {c.onRemove && <span className="cursor-pointer text-muted-foreground hover:text-foreground">×</span>}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {isStale && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠️ Filtros modificados desde el último reporte — regenera para reflejar los cambios.
          </div>
        )}

        <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end")}>
          <Button variant="outline" size="sm" onClick={onOpenColumnsDrawer} className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Columnas consideradas (26)
          </Button>
          <Button onClick={onGenerate} disabled={isAnalyzing || rowsCount === 0} className="gap-1.5">
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generar reporte
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
