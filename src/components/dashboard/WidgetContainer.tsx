import { useState } from "react";
import { DashboardWidgetConfig } from "@/hooks/useHomeDashboardLayout";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  Columns,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetContainerProps {
  widget: DashboardWidgetConfig;
  index: number;
  totalWidgets: number;
  isCustomizing: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onSetColSpan: (id: string, colSpan: 1 | 2 | 3) => void;
  onRemove: (id: string) => void;
  children: React.ReactNode;
}

export function WidgetContainer({
  widget,
  index,
  totalWidgets,
  isCustomizing,
  onMove,
  onReorder,
  onSetColSpan,
  onRemove,
  children,
}: WidgetContainerProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDraggingSelf, setIsDraggingSelf] = useState(false);

  const getColSpanClass = (span: 1 | 2 | 3) => {
    if (span === 3) return "col-span-1 lg:col-span-3";
    if (span === 2) return "col-span-1 lg:col-span-2";
    return "col-span-1";
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (!isCustomizing) return;
    setIsDraggingSelf(true);
    e.dataTransfer.setData("text/plain", widget.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDraggingSelf(false);
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isCustomizing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isCustomizing) return;
    e.preventDefault();
    setIsDragOver(false);
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && sourceId !== widget.id) {
      onReorder(sourceId, widget.id);
    }
  };

  return (
    <div
      draggable={isCustomizing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        getColSpanClass(widget.colSpan),
        "relative transition-all duration-300 rounded-2xl",
        isDraggingSelf && "opacity-40 scale-[0.98]",
        isDragOver && "ring-2 ring-accent shadow-xl scale-[1.01] z-30",
        isCustomizing && "border-2 border-dashed border-accent/40 bg-card/30 p-1.5"
      )}
    >
      {/* Barra de Control de Personalización Flotante Superior */}
      {isCustomizing && (
        <div className="mb-2 p-1.5 rounded-xl bg-card/95 border border-border/90 shadow-md backdrop-blur-md flex flex-wrap items-center justify-between gap-2 z-20 select-none">
          {/* Manija de Arrastre */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/80 hover:bg-secondary cursor-grab active:cursor-grabbing text-xs font-semibold text-foreground"
            title="Haz clic y arrastra para reordenar"
          >
            <GripVertical className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] font-bold">Mover</span>
          </div>

          {/* Selector de Ancho / Tamaño de la Card (1 Col, 2 Col, 3 Col) */}
          <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-lg border border-border/50">
            <span className="text-[10px] font-bold text-muted-foreground uppercase px-1.5 flex items-center gap-1">
              <Columns className="w-3 h-3 text-accent" /> Tamaño:
            </span>
            <button
              onClick={() => onSetColSpan(widget.id, 1)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                widget.colSpan === 1
                  ? "bg-accent text-accent-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              1/3
            </button>
            <button
              onClick={() => onSetColSpan(widget.id, 2)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                widget.colSpan === 2
                  ? "bg-accent text-accent-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              2/3
            </button>
            <button
              onClick={() => onSetColSpan(widget.id, 3)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                widget.colSpan === 3
                  ? "bg-accent text-accent-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              Completo
            </button>
          </div>

          {/* Flechas y Botón de Eliminar */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMove(widget.id, "up")}
              disabled={index === 0}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
              title="Mover hacia arriba"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMove(widget.id, "down")}
              disabled={index === totalWidgets - 1}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
              title="Mover hacia abajo"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemove(widget.id)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-500/15 transition-colors"
              title="Eliminar este gráfico"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Contenedor del Widget Hijo */}
      <div className="h-full relative">{children}</div>

      {/* Grip de Redimensionado Esquina Inferior Derecha en Modo Personalización */}
      {isCustomizing && (
        <button
          onClick={() => {
            const nextSpan: Record<1 | 2 | 3, 1 | 2 | 3> = { 1: 2, 2: 3, 3: 1 };
            onSetColSpan(widget.id, nextSpan[widget.colSpan]);
          }}
          className="absolute bottom-1 right-1 w-6 h-6 rounded-br-xl rounded-tl-lg bg-accent/20 hover:bg-accent/40 text-accent flex items-center justify-center text-[9px] font-extrabold shadow-sm transition-all z-20 cursor-pointer"
          title={`Clic para cambiar tamaño (Actual: ${widget.colSpan === 3 ? "Completo" : `${widget.colSpan}/3`})`}
        >
          {widget.colSpan}x
        </button>
      )}
    </div>
  );
}
