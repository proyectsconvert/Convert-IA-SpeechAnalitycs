import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Search,
  Settings,
  Building2,
  ChevronDown,
  Check,
  CheckCheck,
  LogOut,
  Plus,
  Loader2,
  PanelLeft,
  LayoutGrid,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWhatsappUpload } from "@/contexts/WhatsappUploadContext";
import { useNavigationPreference } from "@/hooks/useNavigationPreference";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { AppDock } from "./AppDock";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { Button } from "@/components/ui/button";

export function AppTopBar() {
  const { user, profile, signOut } = useAuth();
  const { currentAccount, accounts, setCurrentAccount } = useAccount();
  const { isUploading, uploadProgress, uploadStatus } = useWhatsappUpload();
  const { can } = usePermissions();
  const { layoutMode, setLayoutMode } = useNavigationPreference();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const canUpload = can("library", "create") || can("uploads", "create");
  const canConfig = can("settings", "view");

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read).length);
      }
    };
    load();
    const channel = supabase
      .channel("notifications-topbar")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as any, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
          toast.info((payload.new as any).title);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user?.id || !unreadCount) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    for (const id of unreadIds) {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/80 bg-background/90 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 flex-shrink-0 transition-all">
      {/* 1. LADO IZQUIERDO: Logo & Selector de Cuenta */}
      <div className="flex items-center gap-3 min-w-0">
        <MobileNavDrawer />

        {/* Logo & Marca */}
        <div
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <img
            src="/logo.png"
            alt="Convert-IA"
            className="w-8 h-8 rounded-xl object-cover flex-shrink-0 bg-white shadow-xs group-hover:scale-105 transition-transform"
          />
          <div className="hidden sm:block min-w-0">
            <h1 className="font-bold text-sm text-foreground leading-tight tracking-tight">Convert-IA</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
              Speech Analytics
            </p>
          </div>
        </div>

        {/* Selector de Cuenta / Tenant Compacto */}
        {accounts.length > 0 && (
          <div className="ml-1 sm:ml-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 bg-secondary/70 hover:bg-secondary border border-border/60 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all max-w-[170px] sm:max-w-[200px]">
                  <Building2 className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <span className="truncate text-foreground font-semibold">
                    {currentAccount?.account.name || "Cuenta"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1 rounded-xl shadow-xl">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Cuentas Disponibles
                </div>
                {accounts.map((ua) => (
                  <DropdownMenuItem
                    key={ua.account_id}
                    onClick={() => setCurrentAccount(ua)}
                    className="flex items-center gap-2 text-xs font-medium py-2 rounded-lg cursor-pointer"
                  >
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{ua.account.name}</span>
                    {currentAccount?.account_id === ua.account_id && (
                      <Check className="w-3.5 h-3.5 text-accent" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* 2. CENTRO: DOCK SUPERIOR (Visible en Desktop) */}
      <div className="hidden lg:flex items-center justify-center flex-1 px-4">
        <AppDock />
      </div>

      {/* 3. LADO DERECHO: Subir Grabación, Buscador, Notificaciones, Preferencias & Perfil */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        {/* Progreso de Carga en Segundo Plano */}
        {isUploading && (
          <div className="hidden xl:flex flex-col w-40 mr-1 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-accent truncate max-w-[110px] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {uploadStatus}
              </span>
              <span className="text-[10px] font-bold text-accent">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1" />
          </div>
        )}

        {/* Botón Acción Rápida: + Subir */}
        {canUpload && (
          <Button
            size="sm"
            onClick={() => navigate("/biblioteca")}
            className="h-8 px-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Subir</span>
          </Button>
        )}

        {/* Buscador Rápido */}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="pl-8 pr-3 py-1 text-xs bg-secondary/70 hover:bg-secondary focus:bg-background rounded-xl border border-border/60 outline-none focus:ring-2 focus:ring-accent/30 w-36 lg:w-44 transition-all placeholder:text-muted-foreground"
          />
        </div>

        {/* Notificaciones */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground relative transition-colors">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute 1 top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto rounded-2xl shadow-2xl p-0">
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-border bg-card/60">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Notificaciones</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" /> Marcar leídas
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">Sin notificaciones recientes</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 p-3 cursor-default border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2 w-full">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                    <span className={`text-xs font-semibold ${n.read ? "text-muted-foreground" : "text-foreground"} truncate flex-1`}>{n.title}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelativeTime(n.created_at)}</span>
                  </div>
                  {n.message && <p className="text-[11px] text-muted-foreground line-clamp-2 pl-4">{n.message}</p>}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Menú de Usuario & Preferencias de Navegación */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 p-0.5 rounded-xl hover:bg-secondary transition-colors">
              <Avatar className="w-8 h-8 border border-border/80 shadow-2xs cursor-pointer">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-2xl shadow-2xl">
            <div className="px-3 py-2 border-b border-border/60">
              <p className="text-xs font-bold text-foreground truncate">{profile?.full_name || user?.email}</p>
              <p className="text-[11px] text-muted-foreground capitalize">
                {profile?.is_superadmin ? "Superadministrador" : currentAccount?.role || "Usuario"}
              </p>
            </div>

            {/* Alternador de Modo de Navegación */}
            <div className="p-1.5">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Modo de Navegación
              </div>
              <div className="grid grid-cols-2 gap-1 bg-secondary/60 p-1 rounded-xl">
                <button
                  onClick={() => setLayoutMode("dock")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                    layoutMode === "dock"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-accent" /> Dock
                </button>
                <button
                  onClick={() => setLayoutMode("sidebar")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                    layoutMode === "sidebar"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PanelLeft className="w-3.5 h-3.5" /> Sidebar
                </button>
              </div>
            </div>

            <DropdownMenuSeparator />

            {accounts.length > 1 && (
              <DropdownMenuItem onClick={() => navigate("/select-account")} className="text-xs font-medium py-2 rounded-xl">
                <Building2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Cambiar cuenta
              </DropdownMenuItem>
            )}
            {canConfig && (
              <DropdownMenuItem onClick={() => navigate("/configuracion")} className="text-xs font-medium py-2 rounded-xl">
                <Settings className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Configuración
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={signOut} className="text-xs font-medium text-destructive focus:text-destructive py-2 rounded-xl">
              <LogOut className="w-3.5 h-3.5 mr-2" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
