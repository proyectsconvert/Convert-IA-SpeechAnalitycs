import { useMemo } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Award,
  Clock,
  Phone,
  MessageSquare,
  Sparkles,
  Filter,
  Plus,
  SlidersHorizontal,
  RotateCcw,
  Download,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PRESETS, DashboardPreset } from "./presets/defaultDashboards";
import { Badge } from "@/components/ui/badge";

interface Props {
  activeDashboardId: string;
  onSelectDashboard: (id: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
  onResetLayout: () => void;
  onOpenAddWidget: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFiltersCount?: number;
}

const iconMap = {
  LayoutDashboard,
  TrendingUp,
  Award,
  Clock,
  Phone,
  MessageSquare,
  Sparkles,
};

export function IndicadoresHeader({
  activeDashboardId,
  onSelectDashboard,
  isEditing,
  onToggleEdit,
  onResetLayout,
  onOpenAddWidget,
  showFilters,
  onToggleFilters,
  activeFiltersCount = 0,
}: Props) {
  const currentPreset = useMemo(() => {
    return DASHBOARD_PRESETS.find((p) => p.id === activeDashboardId) || DASHBOARD_PRESETS[0];
  }, [activeDashboardId]);

  return (
    <div className="space-y-4">
      {/* 1. Barra de Título & Acciones Superiores */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Indicadores</h1>
            <Badge variant="outline" className="text-[11px] font-semibold bg-accent/10 text-accent border-accent/30">
              Analítica Estratégica
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentPreset.description}
          </p>
        </div>

        {/* Acciones del Tablero */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Filtros */}
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={onToggleFilters}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>

          {/* Botón Añadir Gráfico */}
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenAddWidget}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl hover:bg-secondary"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Añadir Gráfico</span>
            <span className="sm:hidden">Gráfico</span>
          </Button>

          {/* Botón Personalizar Tablero (Modo Edición) */}
          <Button
            size="sm"
            variant={isEditing ? "default" : "outline"}
            onClick={onToggleEdit}
            className={`h-9 gap-1.5 text-xs font-semibold rounded-xl transition-all ${
              isEditing ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-secondary"
            }`}
          >
            {isEditing ? <Check className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
            <span>{isEditing ? "Finalizar Edición" : "Personalizar"}</span>
          </Button>

          {/* Botón Restaurar (visible solo en edición) */}
          {isEditing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onResetLayout}
              className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground rounded-xl"
              title="Restaurar diseño predeterminado"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Restaurar</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Selector de Tableros Estratégicos (7 Pestañas) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin border-b border-border/60">
        {DASHBOARD_PRESETS.map((preset) => {
          const Icon = iconMap[preset.iconName] || LayoutDashboard;
          const isActive = preset.id === activeDashboardId;

          return (
            <button
              key={preset.id}
              onClick={() => onSelectDashboard(preset.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                isActive
                  ? "bg-accent/15 text-accent border-accent/40 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/70 border-transparent"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
              <span>{preset.name}</span>
              {preset.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold uppercase tracking-wider ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {preset.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
