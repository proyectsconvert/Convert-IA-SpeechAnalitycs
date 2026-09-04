import { useState, useEffect } from "react";
import { Bell, Search, Settings, Mic } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Building2, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { useWhatsappUpload } from "@/contexts/WhatsappUploadContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();
  const { currentAccount, accounts } = useAccount();
  const { isUploading, uploadProgress, uploadStatus } = useWhatsappUpload();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
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
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        setNotifications((prev) => [payload.new as any, ...prev].slice(0, 20));
        setUnreadCount((prev) => prev + 1);
        toast.info((payload.new as any).title);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0 backdrop-blur-sm bg-card/95">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar análisis..."
            className="pl-9 pr-4 py-1.5 text-sm bg-secondary rounded-lg border-0 outline-none focus:ring-2 focus:ring-accent/30 w-64 placeholder:text-muted-foreground"
          />
        </div>
        {currentAccount && (
          <div className="hidden md:flex items-center gap-2 ml-2 text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">{currentAccount.account.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isUploading && (
          <div className="hidden lg:flex flex-col w-48 mr-2 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-primary truncate max-w-[140px] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {uploadStatus}
              </span>
              <span className="text-[10px] font-bold text-primary">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive rounded-full text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <p className="text-sm font-semibold text-foreground">Notificaciones</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" /> Marcar leídas
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">Sin notificaciones</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2.5 cursor-default">
                  <div className="flex items-center gap-2 w-full">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                    <span className={`text-sm font-medium ${n.read ? "text-muted-foreground" : "text-foreground"} truncate flex-1`}>{n.title}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelativeTime(n.created_at)}</span>
                  </div>
                  {n.message && <p className="text-xs text-muted-foreground line-clamp-2 pl-4">{n.message}</p>}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-secondary">
              <Avatar className="w-8 h-8 cursor-pointer">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground">{profile?.is_superadmin ? "Superadmin" : currentAccount?.role}</p>
            </div>
            <DropdownMenuSeparator />
            {accounts.length > 1 && (
              <DropdownMenuItem onClick={() => navigate("/select-account")}>
                <Building2 className="w-4 h-4 mr-2" /> Cambiar cuenta
              </DropdownMenuItem>
            )}
            {can("settings", "view") ? (
              <DropdownMenuItem onClick={() => navigate("/configuracion")}>
                <Settings className="w-4 h-4 mr-2" /> Configuración
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
