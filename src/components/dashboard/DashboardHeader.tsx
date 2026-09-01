import {
  Save,
  Plus,
  SlidersHorizontal,
  RotateCcw,
  Calendar,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardHeaderProps {
  accountName?: string;
  dateRange: "7d" | "14d" | "30d" | "all";
  onChangeDateRange: (range: "7d" | "14d" | "30d" | "all") => void;
  isCustomizing: boolean;
  onToggleCustomizing: () => void;
  onOpenAddModal: () => void;
  onSaveLayout: () => void;
  onResetLayout: () => void;
  isDirty: boolean;
  isSaving: boolean;
}

export function DashboardHeader({
  accountName,
  dateRange,
  onChangeDateRange,
  isCustomizing,
  onToggleCustomizing,
  onOpenAddModal,
  onSaveLayout,
  onResetLayout,
  isDirty,
  isSaving,
}: DashboardHeaderProps) {
  const dateRangeLabels: Record<string, string> = {
    "7d": "Últimos 7 días",
    "14d": "Últimos 14 días",
    "30d": "Últimos 30 días",
    all: "Todo el histórico",
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          Inicio
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Resumen operativo y estratégico en tiempo real para{" "}
          <span className="text-accent font-semibold">{accountName || "Sin cuenta"}</span>
        </p>
      </div>

      {/* Controles de Acción y Personalización */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Selector de Rango Temporal */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-xl border-border bg-card/80 text-xs font-semibold gap-1.5 shadow-xs"
            >
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{dateRangeLabels[dateRange]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl shadow-xl p-1">
            {(["7d", "14d", "30d", "all"] as const).map((r) => (
              <DropdownMenuItem
                key={r}
                onClick={() => onChangeDateRange(r)}
                className="flex items-center justify-between text-xs py-1.5 rounded-lg cursor-pointer"
              >
                <span>{dateRangeLabels[r]}</span>
                {dateRange === r && <Check className="w-3.5 h-3.5 text-accent" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Botón Personalizar / Reordenar */}
        <Button
          variant={isCustomizing ? "default" : "outline"}
          size="sm"
          onClick={onToggleCustomizing}
          className={`h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 shadow-xs transition-all ${
            isCustomizing
              ? "bg-foreground text-background"
              : "border-border bg-card/80 text-foreground"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isCustomizing ? "Finalizar Edición" : "Personalizar"}</span>
        </Button>

        {/* Acciones en modo edición */}
        {isCustomizing && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenAddModal}
              className="h-8 px-3 rounded-xl border-dashed border-accent/60 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Gráfico</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onResetLayout}
              className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground gap-1"
              title="Restablecer diseño al predeterminado"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Restablecer</span>
            </Button>
          </>
        )}

        {/* Botón Guardar Tablero */}
        <Button
          size="sm"
          onClick={onSaveLayout}
          disabled={isSaving}
          className={`h-8 px-3.5 rounded-xl text-xs font-bold gap-1.5 shadow-xs transition-all ${
            isDirty
              ? "bg-accent hover:bg-accent/90 text-accent-foreground ring-2 ring-accent/30 animate-pulse"
              : "bg-secondary hover:bg-secondary/80 text-foreground border border-border"
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? "Guardando..." : "Guardar Tablero"}</span>
        </Button>
      </div>
    </div>
  );
}
