import { NavChildItem } from "@/config/navigationConfig";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface DockSubmenuProps {
  groupTitle: string;
  groupIcon: LucideIcon;
  items: NavChildItem[];
  onSelect?: () => void;
}

export function DockSubmenu({
  groupTitle,
  groupIcon: GroupIcon,
  items,
  onSelect,
}: DockSubmenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const allowedItems = items.filter((item) => can(item.perm.module, item.perm.action));

  if (allowedItems.length === 0) return null;

  const isActive = (url: string) => {
    if (url.startsWith("/analiticas")) {
      return location.pathname.startsWith("/analiticas");
    }
    return location.pathname === url.split("?")[0];
  };

  const handleItemClick = (item: NavChildItem) => {
    if (onSelect) onSelect();
    if (item.isAction && item.actionType === "upload") {
      navigate("/biblioteca");
    }
  };

  return (
    <PopoverContent
      side="bottom"
      align="center"
      sideOffset={10}
      className="w-72 p-2 bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl animate-in fade-in-0 zoom-in-95 duration-150 z-50"
    >
      {/* Cabecera del Submenú */}
      <div className="flex items-center gap-2 px-3 py-2 mb-1 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <GroupIcon className="w-3.5 h-3.5 text-accent" />
        <span>{groupTitle}</span>
      </div>

      {/* Lista de Enlaces y Acciones */}
      <div className="space-y-1">
        {allowedItems.map((item) => {
          const ItemIcon = item.icon;
          const active = isActive(item.url);

          if (item.isAction) {
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-accent-foreground bg-accent/15 hover:bg-accent/25 border border-accent/30 transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0 text-accent group-hover:scale-105 transition-transform">
                  <ItemIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground">{item.title}</div>
                  {item.description && (
                    <div className="text-[11px] text-muted-foreground truncate">{item.description}</div>
                  )}
                </div>
              </button>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.url}
              onClick={() => onSelect && onSelect()}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all group",
                active
                  ? "bg-accent/15 text-accent font-semibold border border-accent/20 shadow-xs"
                  : "text-foreground/80 hover:bg-secondary/80 hover:text-foreground border border-transparent"
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105",
                  active
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "bg-secondary text-muted-foreground group-hover:text-foreground"
                )}
              >
                <ItemIcon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{item.title}</div>
                {item.description && (
                  <div className="text-[10px] text-muted-foreground truncate leading-tight">
                    {item.description}
                  </div>
                )}
              </div>
            </NavLink>
          );
        })}
      </div>
    </PopoverContent>
  );
}
