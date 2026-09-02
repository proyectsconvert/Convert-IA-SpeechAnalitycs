import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WidgetType } from "@/hooks/useHomeDashboardLayout";
import {
  PieChart,
  BarChart3,
  Users,
  LineChart,
  Layers,
  Activity,
  CheckCircle2,
  Table,
  Plus,
} from "lucide-react";

interface AddWidgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWidget: (type: WidgetType, title?: string, colSpan?: 1 | 2 | 3) => void;
}

const AVAILABLE_WIDGET_CATALOG: Array<{
  type: WidgetType;
  title: string;
  description: string;
  icon: typeof PieChart;
  defaultColSpan: 1 | 2 | 3;
  category: "Visualización" | "Métricas" | "Detalle";
}> = [
  {
    type: "sentiment_donut",
    title: "Distribución de Sentimiento",
    description: "Gráfico Donut con el porcentaje de interacciones Positivas, Neutrales y Negativas.",
    icon: PieChart,
    defaultColSpan: 1,
    category: "Visualización",
  },
  {
    type: "top_motivos",
    title: "Top Motivos y Objeciones",
    description: "Gráfico de barras horizontales con los principales motivos de contacto detectados por la IA.",
    icon: BarChart3,
    defaultColSpan: 2,
    category: "Visualización",
  },
  {
    type: "agents_ranking",
    title: "Ranking de Asesores",
    description: "Tabla de rendimiento con volumen de llamadas, score promedio de calidad y sentimiento.",
    icon: Users,
    defaultColSpan: 2,
    category: "Métricas",
  },
  {
    type: "trend_activity",
    title: "Evolución de Actividad Temporal",
    description: "Gráfico de área comparativo de volumen diario entre Llamadas y WhatsApp.",
    icon: LineChart,
    defaultColSpan: 2,
    category: "Visualización",
  },
  {
    type: "channel_distribution",
    title: "Comparativa por Canal",
    description: "Desglose proporcional de volumen, duración y mensajes entre canales de voz y chat.",
    icon: Layers,
    defaultColSpan: 1,
    category: "Visualización",
  },
  {
    type: "executive_summary",
    title: "Resumen de Operación",
    description: "Tarjeta ejecutiva con totales completados, pendientes, errores y tasa de éxito.",
    icon: Activity,
    defaultColSpan: 1,
    category: "Métricas",
  },
  {
    type: "kpis",
    title: "Métricas Clave Superiores",
    description: "Banda completa de 6 indicadores clave de rendimiento en tiempo real.",
    icon: CheckCircle2,
    defaultColSpan: 3,
    category: "Métricas",
  },
  {
    type: "recent_activity",
    title: "Actividad Reciente en Vivo",
    description: "Tabla con las últimas interacciones analizadas y salto rápido a transcripción.",
    icon: Table,
    defaultColSpan: 3,
    category: "Detalle",
  },
];

export function AddWidgetModal({
  open,
  onOpenChange,
  onAddWidget,
}: AddWidgetModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");

  const categories = ["Todos", "Visualización", "Métricas", "Detalle"];

  const filtered = AVAILABLE_WIDGET_CATALOG.filter(
    (w) => selectedCategory === "Todos" || w.category === selectedCategory
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-6 bg-card border-border shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            Añadir Gráfico o Widget al Tablero
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecciona el componente gráfico o métrica que deseas incorporar a tu tablero de Inicio.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros de Categoría */}
        <div className="flex items-center gap-1.5 pt-2 pb-1 border-b border-border/60">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Catálogo en Cuadrícula */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto p-1 scrollbar-thin">
          {filtered.map((w) => {
            const Icon = w.icon;
            return (
              <div
                key={w.type}
                className="p-3.5 rounded-xl border border-border/80 bg-secondary/20 hover:bg-secondary/40 hover:border-accent/40 transition-all flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-foreground">{w.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {w.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Ancho: {w.defaultColSpan === 3 ? "Completo" : `${w.defaultColSpan} col`}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      onAddWidget(w.type, w.title, w.defaultColSpan);
                      onOpenChange(false);
                    }}
                    className="h-7 px-2.5 text-xs font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
