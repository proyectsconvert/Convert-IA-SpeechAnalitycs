import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { NAVIGATION_CONFIG } from "@/config/navigationConfig";
import { usePermissions } from "@/hooks/usePermissions";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioUploadModal } from "@/contexts/AudioUploadModalContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Building2, LogOut, Settings, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { currentAccount } = useAccount();
  const { signOut } = useAuth();
  const { openUploadModal } = useAudioUploadModal();

  const canUpload = can("library", "create") || can("uploads", "create");
  const canConfig = can("settings", "view");

  const isActive = (url: string) => {
    if (url === "/analiticas") {
      return location.pathname.startsWith("/analiticas");
    }
    return location.pathname === url.split("?")[0];
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl lg:hidden text-muted-foreground hover:text-foreground">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0 flex flex-col bg-background/98 backdrop-blur-xl">
        <SheetHeader className="p-4 border-b border-border/70 flex flex-row items-center gap-3 space-y-0 text-left">
          <img
            src="/logo.png"
            alt="Convert-IA"
            className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-white"
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-sm font-bold text-foreground leading-tight">Convert-IA</SheetTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {currentAccount?.account.name || "Speech Analytics"}
            </p>
          </div>
        </SheetHeader>

        {canUpload && (
          <div className="p-3 border-b border-border/50">
            <button
              onClick={() => {
                setOpen(false);
                openUploadModal();
              }}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Subir grabación
            </button>
          </div>
        )}

        {/* Lista de Grupos y Submódulos */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin">
          {NAVIGATION_CONFIG.map((group) => {
            const GroupIcon = group.icon;

            // Si es un enlace directo
            if (!group.children || group.children.length === 0) {
              if (group.perm && !can(group.perm.module, group.perm.action)) return null;
              const active = isActive(group.url || "/");

              return (
                <NavLink
                  key={group.id}
                  to={group.url || "/"}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all",
                    active
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "text-foreground/80 hover:bg-secondary/70 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon className="w-4 h-4 text-accent" />
                    <span>{group.title}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                </NavLink>
              );
            }

            // Si tiene hijos
            const allowedChildren = group.children.filter((child) =>
              can(child.perm.module, child.perm.action)
            );
            if (allowedChildren.length === 0) return null;

            return (
              <div key={group.id} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <GroupIcon className="w-3 h-3 text-accent" />
                  <span>{group.title}</span>
                </div>
                <div className="space-y-0.5 pl-2">
                  {allowedChildren.map((child) => {
                    const ChildIcon = child.icon;
                    const active = isActive(child.url);

                    return (
                      <NavLink
                        key={child.id}
                        to={child.url}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all",
                          active
                            ? "bg-accent/15 text-accent font-semibold border border-accent/25"
                            : "text-foreground/80 hover:bg-secondary/70 hover:text-foreground"
                        )}
                      >
                        <ChildIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{child.title}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border/70 bg-card/40 space-y-1">
          {canConfig && (
            <button
              onClick={() => {
                setOpen(false);
                navigate("/configuracion");
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-foreground/80 hover:bg-secondary/70 transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" /> Configuración
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
