import { useRef, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { DockGroupItem, NavChildItem } from "@/config/navigationConfig";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { DockSubmenu } from "./DockSubmenu";
import { cn } from "@/lib/utils";

interface DockItemProps {
  item: DockGroupItem;
  index: number;
  mouseDistance: number | null;
  isActive: boolean;
  allowedChildren: NavChildItem[];
}

export function DockItem({
  item,
  mouseDistance,
  isActive,
  allowedChildren,
}: DockItemProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isSelfHovered, setIsSelfHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const hasChildren = allowedChildren.length > 0;
  const Icon = item.icon;

  // Cálculo de Magnificación Progresiva (Física tipo macOS Dock)
  const { scale, translateY } = useMemo(() => {
    if (mouseDistance === null) {
      return { scale: 1, translateY: 0 };
    }
    const sigma = 68; // Radio de dispersión en píxeles
    const maxScale = 0.28; // Escala máxima (1.28x)
    const factor = Math.exp(-Math.pow(mouseDistance / sigma, 2));
    const calculatedScale = 1 + maxScale * factor;
    const calculatedTranslateY = -(calculatedScale - 1) * 14; // Eleva suavemente hacia arriba
    return {
      scale: Math.round(calculatedScale * 1000) / 1000,
      translateY: Math.round(calculatedTranslateY * 10) / 10,
    };
  }, [mouseDistance]);

  const buttonContent = (
    <div
      ref={itemRef}
      onMouseEnter={() => setIsSelfHovered(true)}
      onMouseLeave={() => setIsSelfHovered(false)}
      className="relative flex flex-col items-center justify-center p-1 cursor-pointer select-none group"
      style={{
        transform: `scale(${scale}) translateY(${translateY}px)`,
        transformOrigin: "bottom center",
        transition: "transform 140ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      {/* Tooltip / Label Flotante Superior */}
      {isSelfHovered && !popoverOpen && (
        <div className="absolute -top-8 px-2.5 py-0.5 rounded-lg bg-popover/95 text-popover-foreground text-[11px] font-medium shadow-md border border-border/60 whitespace-nowrap pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100 z-50">
          {item.title}
        </div>
      )}

      {/* Botón / Icono del Dock */}
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative",
          isActive
            ? "bg-accent/20 text-accent font-semibold shadow-xs border border-accent/30"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/70 border border-transparent"
        )}
      >
        <Icon className={cn("w-[19px] h-[19px] transition-transform", isActive ? "scale-105" : "")} />

        {/* Punto / Indicador Activo Inferior */}
        {isActive && (
          <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        )}
      </div>
    </div>
  );

  // Si tiene submenú de opciones, envolver en Popover
  if (hasChildren) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
        <DockSubmenu
          groupTitle={item.title}
          groupIcon={item.icon}
          items={allowedChildren}
          onSelect={() => setPopoverOpen(false)}
        />
      </Popover>
    );
  }

  // Si es enlace directo (Inicio, Transcripciones, Conversaciones)
  return (
    <NavLink to={item.url || "/"} className="outline-none">
      {buttonContent}
    </NavLink>
  );
}
