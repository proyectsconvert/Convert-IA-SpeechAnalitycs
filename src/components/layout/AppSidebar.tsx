import { 
  BarChart3, BookOpen, BrainCircuit, Building2, CreditCard, FileAudio, 
  HelpCircle, LogOut, Mic, Settings, Shield, Sparkles, Users, ClipboardList,
  ChevronDown, Check, Gauge, Tags, MessageCircle, LineChart, ChevronsLeft, ChevronsRight,
  Cable, AudioLines, ShieldCheck,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavPerm = { module: string; action: string };

const mainNav: Array<{
  title: string;
  url: string;
  icon: typeof Sparkles;
  sparkles?: boolean;
  perm: NavPerm;
}> = [
  { title: "Panel General", url: "/", icon: Sparkles, perm: { module: "dashboard", action: "view" } },
  { title: "Gestión de Grabaciones", url: "/biblioteca", icon: FileAudio, perm: { module: "library", action: "view" } },
  { title: "Gestión de Chats", url: "/analytics-whatsapp", icon: MessageCircle, perm: { module: "whatsapp", action: "view" } },
  { title: "Transcripciones", url: "/transcripciones", icon: Mic, perm: { module: "transcriptions", action: "view" } },
  { title: "Analítica Unificada", url: "/analizador-total", icon: BarChart3, sparkles: true, perm: { module: "analytics", action: "view" } },
  { title: "Indicadores Estratégicos", url: "/analiticas", icon: LineChart, perm: { module: "reports", action: "view" } },
  { title: "AI Copilot", url: "/consulta-ia", icon: BrainCircuit, perm: { module: "chat_ai", action: "view" } },
  { title: "Reglas de Extracción", url: "/extracciones", icon: Tags, perm: { module: "analytics", action: "view" } }, // analiticas era un typo, el modulo es analytics
  { title: "Catálogo de Prompts", url: "/prompts", icon: BookOpen, perm: { module: "prompts", action: "view" } },
];

const adminNav: Array<{ title: string; url: string; icon: typeof Building2; perm: NavPerm }> = [
  { title: "Conexión", url: "/conexion", icon: Cable, perm: { module: "connections", action: "view" } },
  { title: "Modelos Transcripción", url: "/modelos-transcripcion", icon: AudioLines, perm: { module: "transcription_models", action: "view" } },
  { title: "Validación de Modelos", url: "/validacion-modelos", icon: ShieldCheck, perm: { module: "transcription_models", action: "view" } },
  { title: "Gestión de Cuentas", url: "/cuentas", icon: Building2, perm: { module: "accounts", action: "view" } },
  { title: "Gestión de Usuarios", url: "/usuarios", icon: Users, perm: { module: "users", action: "view" } },
  { title: "Roles y Permisos", url: "/roles", icon: Shield, perm: { module: "roles", action: "view" } },
  { title: "Límites", url: "/limites", icon: Gauge, perm: { module: "billing", action: "view" } }, // Usamos billing para limites según catálogo
  { title: "Facturaciónn", url: "/facturacion", icon: CreditCard, perm: { module: "billing", action: "view" } },
  { title: "Auditoría", url: "/auditoria", icon: ClipboardList, perm: { module: "audit", action: "view" } },
  { title: "Soporte", url: "/soporte", icon: HelpCircle, perm: { module: "soporte", action: "view" } },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { accounts, currentAccount, setCurrentAccount } = useAccount();
  const { can } = usePermissions();

  const visibleMain = mainNav.filter((item) => can(item.perm.module, item.perm.action));
  const visibleAdmin = adminNav.filter((item) => can(item.perm.module, item.perm.action));
  
  const canUpload = can("library", "create") || can("uploads", "create");
  const canConfig = can("settings", "view");

  const isActive = (path: string) =>
    path === "/analiticas" ? location.pathname.startsWith("/analiticas") : location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <img
          src="/logo.png"
          alt="Convert-IA"
          className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-white"
        />
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-sm text-foreground leading-tight">Convert-IA</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Speech Analytics</p>
          </div>
        )}
      </div>

      {/* Account Selector */}
      {!collapsed && accounts.length > 0 && (
        <div className="px-3 pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 bg-secondary hover:bg-secondary/80 rounded-lg px-3 py-2 text-sm transition-colors text-left">
                <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="flex-1 truncate font-medium text-foreground">
                  {currentAccount?.account.name || "Seleccionar cuenta"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
              {accounts.map((ua) => (
                <DropdownMenuItem
                  key={ua.account_id}
                  onClick={() => setCurrentAccount(ua)}
                  className="flex items-center gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  <span className="flex-1 truncate">{ua.account.name}</span>
                  {currentAccount?.account_id === ua.account_id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {!collapsed && canUpload && (
        <div className="px-3 pt-3">
          <button onClick={() => navigate("/biblioteca")} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg py-2.5 text-sm font-semibold transition-colors active:scale-[0.97]">
            + Subir grabación
          </button>
        </div>
      )}

      <SidebarContent className="px-2 pt-1 scrollbar-thin">
        {/* OPERACIÓN */}
        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 h-6 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mt-1 mb-0">
              Operación
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain
                .filter((item) => ["Panel General", "Gestión de Grabaciones", "Gestión de Chats", "Transcripciones"].includes(item.title))
                .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive(item.url)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* INTELIGENCIA & ANALÍTICA */}
        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 h-6 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mt-2 mb-0">
              Inteligencia & Analítica
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain
                .filter((item) => ["Analítica Unificada", "Indicadores Estratégicos", "AI Copilot"].includes(item.title))
                .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive(item.url)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CONFIGURACIÓN */}
        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 h-6 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mt-2 mb-0">
              Configuración
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain
                .filter((item) => ["Reglas de Extracción", "Catálogo de Prompts"].includes(item.title))
                .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive(item.url)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ADMINISTRACIÓN */}
        {visibleAdmin.length > 0 && (
          <SidebarGroup className="py-1">
            {!collapsed && (
              <SidebarGroupLabel className="px-4 h-6 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mt-2 mb-0">
                Administración
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive(item.url)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button onClick={toggleSidebar} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full">
                {collapsed ? <ChevronsRight className="w-[18px] h-[18px]" /> : <ChevronsLeft className="w-[18px] h-[18px]" />}
                {!collapsed && <span>Contraer menú</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {canConfig ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button onClick={() => navigate("/configuracion")} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full">
                  <Settings className="w-[18px] h-[18px]" />
                  {!collapsed && <span>Configuración</span>}
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 w-full">
                <LogOut className="w-[18px] h-[18px]" />
                {!collapsed && <span>Cerrar Sesión</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
