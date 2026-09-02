import { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  Trash2,
  GripVertical,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WidgetInstance } from "./presets/defaultDashboards";
import { cn } from "@/lib/utils";

interface Props {
  widget: WidgetInstance;
  isEditing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onResize: (colSpan: 1 | 2 | 3) => void;
  onRemove: () => void;
  children: ReactNode;
}

export function WidgetCard({
  widget,
  isEditing,
  onMoveUp,
  onMoveDown,
  onResize,
  onRemove,
  children,
}: Props) {
  const colSpanClass =
    widget.colSpan === 3
      ? "col-span-1 md:col-span-2 lg:col-span-3"
      : widget.colSpan === 2
      ? "col-span-1 md:col-span-2 lg:col-span-2"
      : "col-span-1";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card/85 backdrop-blur-md p-5 shadow-xs transition-all",
        isEditing
          ? "border-accent/40 bg-accent/5 ring-1 ring-accent/20"
          : "border-border/70 hover:border-border hover:shadow-md",
        colSpanClass,
      )}
    >
      {/* Header del Widget */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          {isEditing && (
            <div className="flex items-center text-muted-foreground cursor-grab active:cursor-grabbing p-0.5">
              <GripVertical className="w-4 h-4 text-accent animate-pulse" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{widget.title}</h3>
            {widget.subtitle && (
              <p className="text-[11px] text-muted-foreground truncate">{widget.subtitle}</p>
            )}
          </div>
        </div>

        {/* Controles en Modo Edición */}
        {isEditing && (
          <div className="flex items-center gap-1 bg-background/80 backdrop-blur-md p-1 rounded-xl border border-border/60 shadow-xs animate-in fade-in">
            <button
              onClick={onMoveUp}
              title="Mover hacia arriba"
              className="h-7 w-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onMoveDown}
              title="Mover hacia abajo"
              className="h-7 w-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-border mx-0.5" />
            <button
              onClick={() => onResize(widget.colSpan === 3 ? 1 : ((widget.colSpan || 1) + 1) as 1 | 2 | 3)}
              title="Cambiar ancho (1x / 2x / 3x)"
              className="h-7 px-2 rounded-lg hover:bg-secondary flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{widget.colSpan || 1}x</span>
            </button>
            <div className="w-[1px] h-4 bg-border mx-0.5" />
            <button
              onClick={onRemove}
              title="Eliminar del tablero"
              className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Contenido / Gráfico del Widget */}
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </motion.div>
  );
}
