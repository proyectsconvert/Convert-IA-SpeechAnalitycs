import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVAILABLE_WIDGET_CATALOG, WidgetInstance, CustomChartConfig, WidgetType } from "./presets/defaultDashboards";
import { Plus, Sparkles, LayoutGrid, BarChart3, LineChart, PieChart, Tag, Award, Clock, Phone, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWidget: (widget: WidgetInstance) => void;
}

export function AddWidgetDialog({ open, onOpenChange, onAddWidget }: Props) {
  const [activeTab, setActiveTab] = useState<"catalog" | "custom">("catalog");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Custom Widget Form State
  const [customTitle, setCustomTitle] = useState("");
  const [customType, setCustomType] = useState<"bar" | "line" | "pie" | "kpi">("bar");
  const [customMetric, setCustomMetric] = useState<"volume" | "score" | "duration" | "conversion">("volume");
  const [customDimension, setCustomDimension] = useState<"channel" | "sentiment" | "agent" | "day">("channel");
  const [customColSpan, setCustomColSpan] = useState<1 | 2 | 3>(1);
  const [customColor, setCustomColor] = useState("#0ea5e9");

  const categories = ["all", "General", "Ventas", "Calidad", "Eficiencia", "Canales"];

  const filteredCatalog = AVAILABLE_WIDGET_CATALOG.filter(
    (item) => categoryFilter === "all" || item.category === categoryFilter,
  );

  const handleAddPreset = (item: (typeof AVAILABLE_WIDGET_CATALOG)[0]) => {
    const newWidget: WidgetInstance = {
      id: `${item.type}-${Date.now()}`,
      type: item.type,
      title: item.title,
      colSpan: item.defaultColSpan,
    };
    onAddWidget(newWidget);
    onOpenChange(false);
  };

  const handleCreateCustom = () => {
    if (!customTitle.trim()) return;
    const newWidget: WidgetInstance = {
      id: `custom-${Date.now()}`,
      type: "custom-chart",
      title: customTitle.trim(),
      colSpan: customColSpan,
      customConfig: {
        chartType: customType,
        metric: customMetric,
        dimension: customDimension,
        title: customTitle.trim(),
        color: customColor,
      },
    };
    onAddWidget(newWidget);
    setCustomTitle("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            Añadir Gráficos y Métricas al Tablero
          </DialogTitle>
          <DialogDescription>
            Elige entre nuestra colección de gráficos predefinidos o diseña un gráfico a medida para tu operación.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "catalog" | "custom")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="catalog" className="gap-2">
              <LayoutGrid className="w-4 h-4" /> Galería de Gráficos
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Creador de Gráfico a Medida
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CATÁLOGO */}
          <TabsContent value="catalog" className="space-y-4 pt-3">
            {/* Categorías */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    categoryFilter === cat
                      ? "bg-accent text-accent-foreground shadow-xs"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "Todos los Gráficos" : cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {filteredCatalog.map((item) => (
                <div
                  key={item.type}
                  className="flex flex-col justify-between p-4 rounded-2xl border border-border/70 bg-card hover:border-accent/40 hover:bg-accent/5 transition-all group"
                >
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-foreground">{item.title}</span>
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.description}</p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddPreset(item)}
                    className="w-full h-8 text-xs font-semibold gap-1.5 group-hover:bg-accent group-hover:text-accent-foreground group-hover:border-transparent transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir al Tablero
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 2: CREADOR PERSONALIZADO */}
          <TabsContent value="custom" className="space-y-4 pt-3">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-secondary/20 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Título del Gráfico</Label>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ej: Tasa de conversión por asesor, Volumen por campaña..."
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo de Visualización</Label>
                  <Select value={customType} onValueChange={(v: any) => setCustomType(v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">📊 Gráfico de Barras</SelectItem>
                      <SelectItem value="line">📈 Gráfico de Líneas / Tendencia</SelectItem>
                      <SelectItem value="pie">🍩 Gráfico Circular / Donut</SelectItem>
                      <SelectItem value="kpi">🔢 Tarjeta KPI Resumen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Métrica a Medir</Label>
                  <Select value={customMetric} onValueChange={(v: any) => setCustomMetric(v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="volume">Volumen de Interacciones</SelectItem>
                      <SelectItem value="score">Score de Calidad / Sentimiento</SelectItem>
                      <SelectItem value="duration">Duración / Minutos Totales</SelectItem>
                      <SelectItem value="conversion">Tasa de Conversión Estimada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Desglose / Dimensión</Label>
                  <Select value={customDimension} onValueChange={(v: any) => setCustomDimension(v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="channel">Por Canal (Llamadas vs WhatsApp)</SelectItem>
                      <SelectItem value="sentiment">Por Sentimiento de Cliente</SelectItem>
                      <SelectItem value="agent">Por Asesor / Agente</SelectItem>
                      <SelectItem value="day">Por Fecha (Evolución diaria)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Ancho del Panel</Label>
                  <Select
                    value={String(customColSpan)}
                    onValueChange={(v) => setCustomColSpan(Number(v) as 1 | 2 | 3)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Columna (Medio / Compacto)</SelectItem>
                      <SelectItem value="2">2 Columnas (Ancho)</SelectItem>
                      <SelectItem value="3">3 Columnas (Ancho Completo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Color Temático</Label>
                <div className="flex items-center gap-2">
                  {["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#3b82f6"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCustomColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        customColor === c ? "scale-125 ring-2 ring-foreground ring-offset-2" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleCreateCustom}
              disabled={!customTitle.trim()}
              className="w-full gap-2 font-semibold"
            >
              <Sparkles className="w-4 h-4" /> Crear y Añadir al Tablero
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
