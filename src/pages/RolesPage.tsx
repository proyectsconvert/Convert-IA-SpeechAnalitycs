import { useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Shield, Check, X, Plus, Save, Loader2, Pencil, Search, Copy, Trash2,
  ChevronRight, ChevronDown, Users, Sparkles, GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Permission = Database["public"]["Tables"]["permissions"]["Row"];
type CustomRole = Database["public"]["Tables"]["custom_roles"]["Row"];

const FIXED_ROLES: { value: AppRole; label: string; color: string }[] = [
  { value: "superadmin", label: "Superadmin", color: "#8B5CF6" },
  { value: "admin", label: "Administrador", color: "#3B82F6" },
  { value: "supervisor", label: "Supervisor", color: "#10B981" },
  { value: "analyst", label: "Analista", color: "#F59E0B" },
  { value: "observer", label: "Observador", color: "#6B7280" },
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Panel General",
  library: "Biblioteca de Grabaciones",
  whatsapp: "Gestión de Chats (WA)",
  transcriptions: "Transcripciones",
  notifications: "Notificaciones",
  analytics: "Analítica & Reglas",
  reports: "Indicadores Estratégicos",
  chat_ai: "AI Copilot (Consulta IA)",
  prompts: "Catálogo de Prompts",
  uploads: "Carga de Archivos",
  analyses: "Análisis Detallado",
  connections: "Conexión (Fuentes)",
  transcription_models: "Modelos de Transcripción",
  accounts: "Gestión de Cuentas",
  users: "Gestión de Usuarios",
  roles: "Roles y Permisos",
  billing: "Límites & Facturación",
  audit: "Auditoría",
  soporte: "Soporte",
  settings: "Configuración General",
};

const MODULE_GROUPS = [
  {
    id: "operacion",
    label: "Operación",
    modules: ["dashboard", "library", "uploads", "transcriptions", "whatsapp", "notifications"]
  },
  {
    id: "inteligencia",
    label: "Inteligencia & Analítica",
    modules: ["analytics", "reports", "chat_ai", "analyses"]
  },
  {
    id: "configuracion",
    label: "Configuración",
    modules: ["prompts"]
  },
  {
    id: "administracion",
    label: "Administración",
    modules: ["connections", "transcription_models", "accounts", "users", "roles", "billing", "audit", "soporte", "settings"]
  }
];

export default function RolesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [editingRole, setEditingRole] = useState<{ kind: "fixed"; role: AppRole } | { kind: "custom"; id: string } | null>(null);
  const [editPermSet, setEditPermSet] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const isSuperadmin = !!profile?.is_superadmin;
  const canEditRoles = isSuperadmin || can("roles", "edit");

  const { data: permissions = [], isLoading: pLoading } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("sort_order").order("module").order("action");
      if (error) throw error;
      return (data || []) as Permission[];
    },
  });

  const { data: rolePerms = [], isLoading: rpLoading } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data } = await supabase.from("role_permissions").select("role, permission_id");
      return data || [];
    },
  });

  const { data: customRoles = [], isLoading: crLoading } = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("*").order("name");
      return (data || []) as CustomRole[];
    },
  });

  const { data: customRolePerms = [] } = useQuery({
    queryKey: ["custom-role-permissions"],
    queryFn: async () => {
      const { data } = await supabase.from("custom_role_permissions").select("custom_role_id, permission_id, granted");
      return data || [];
    },
  });

  const ALL_ACTIONS = useMemo(() => {
    const PREFERRED_ORDER = ["view", "create", "edit", "delete", "export", "manage", "use", "test", "invite", "publish"];
    const actions = Array.from(new Set(permissions.map((p) => p.action)));
    return actions.sort((a, b) => {
      const idxA = PREFERRED_ORDER.indexOf(a);
      const idxB = PREFERRED_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [permissions]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, Record<string, boolean>>> = {};
    
    [...FIXED_ROLES.map(r => `fixed:${r.value}`), ...customRoles.map(c => `custom:${c.id}`)].forEach(rk => {
      m[rk] = {};
    });

    rolePerms.forEach((rp: any) => {
      const key = `fixed:${rp.role}`;
      const perm = permissions.find(p => p.id === rp.permission_id);
      if (perm && m[key]) {
        if (!m[key][perm.module]) m[key][perm.module] = {};
        m[key][perm.module][perm.action] = true;
      }
    });

    if (m["fixed:superadmin"]) {
      permissions.forEach(p => {
        if (!m["fixed:superadmin"][p.module]) m["fixed:superadmin"][p.module] = {};
        m["fixed:superadmin"][p.module][p.action] = true;
      });
    }

    customRolePerms.forEach((crp: any) => {
      if (!crp.granted) return;
      const key = `custom:${crp.custom_role_id}`;
      const perm = permissions.find(p => p.id === crp.permission_id);
      if (perm && m[key]) {
        if (!m[key][perm.module]) m[key][perm.module] = {};
        m[key][perm.module][perm.action] = true;
      }
    });

    return m;
  }, [permissions, rolePerms, customRoles, customRolePerms]);

  const startEditFixed = (role: AppRole) => {
    if (role === "superadmin") return;
    setEditingRole({ kind: "fixed", role });
    const current = new Set(rolePerms.filter(rp => rp.role === role).map(rp => rp.permission_id));
    setEditPermSet(current);
  };

  const startEditCustom = (id: string) => {
    setEditingRole({ kind: "custom", id });
    const current = new Set(customRolePerms.filter((crp: any) => crp.custom_role_id === id && crp.granted).map((crp: any) => crp.permission_id));
    setEditPermSet(current);
  };

  const savePermissions = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      const ids = Array.from(editPermSet);

      if (editingRole.kind === "fixed") {
        // 1. Eliminar permisos actuales del rol
        const { error: delErr } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", editingRole.role);
        if (delErr) throw delErr;

        // 2. Insertar nuevos permisos
        if (ids.length > 0) {
          const rows = ids.map((pid) => ({ role: editingRole.role, permission_id: pid }));
          const { error: insErr } = await supabase
            .from("role_permissions")
            .insert(rows);
          if (insErr) throw insErr;
        }
      } else {
        // Custom role: eliminar y reinsertar
        const { error: delErr } = await supabase
          .from("custom_role_permissions")
          .delete()
          .eq("custom_role_id", editingRole.id);
        if (delErr) throw delErr;

        if (ids.length > 0) {
          const rows = ids.map((pid) => ({
            custom_role_id: editingRole.id,
            permission_id: pid,
            granted: true,
          }));
          const { error: insErr } = await supabase
            .from("custom_role_permissions")
            .insert(rows);
          if (insErr) throw insErr;
        }
      }

      toast.success("Permisos actualizados correctamente");
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["custom-role-permissions"] });
      setEditingRole(null);
    } catch (err: any) {
      console.error("Error guardando permisos:", err);
      toast.error("Error al guardar: " + (err.message || "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (id: string) => {
    setEditPermSet((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleModule = (module: string, on: boolean) => {
    const ids = permissions.filter(p => p.module === module).map(p => p.id);
    setEditPermSet(s => {
      const n = new Set(s);
      ids.forEach(id => on ? n.add(id) : n.delete(id));
      return n;
    });
  };

  if (pLoading || rpLoading || crLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const activeRoles = [
    ...FIXED_ROLES.map(r => ({ key: `fixed:${r.value}`, label: r.label, color: r.color, fixed: true, id: r.value })),
    ...customRoles.map(c => ({ key: `custom:${c.id}`, label: c.name, color: c.color || "#3B82F6", fixed: false, id: c.id }))
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent" /> Roles y Permisos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Matriz granular de acceso organizada por secciones del menú lateral.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase sticky left-0 bg-secondary/50 z-20 min-w-[200px] border-r border-border">Categoría / Módulo</th>
                {activeRoles.map((role) => (
                  <th key={role.key} colSpan={ALL_ACTIONS.length} className="text-center px-2 py-3 border-r border-border last:border-r-0">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-bold text-foreground" style={{ color: role.color }}>{role.label}</span>
                      {role.id !== "superadmin" && canEditRoles && (
                        <button 
                          onClick={() => role.fixed ? startEditFixed(role.id as AppRole) : startEditCustom(role.id)}
                          className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-secondary/30 border-b border-border sticky top-0 z-10">
                <th className="sticky left-0 bg-secondary/30 z-20 border-r border-border" />
                {activeRoles.map((role) => ALL_ACTIONS.map((action) => (
                  <th key={`${role.key}-${action}`} className="px-1 py-2 font-medium text-muted-foreground text-center border-r border-border/50 last:border-r-0 w-8" title={action}>
                    {action.substring(0, 2).toUpperCase()}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {MODULE_GROUPS.map((group) => (
                <Fragment key={group.id}>
                  <tr className="bg-muted/50 border-b border-border">
                    <td colSpan={1 + activeRoles.length * ALL_ACTIONS.length} className="px-4 py-2 font-bold text-foreground uppercase tracking-wider text-[11px]">
                      {group.label}
                    </td>
                  </tr>
                  {group.modules.map((mod) => (
                    <tr key={mod} className="border-b border-border hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-2 font-medium text-foreground sticky left-0 bg-card z-10 border-r border-border">
                        {MODULE_LABELS[mod] || mod}
                      </td>
                      {activeRoles.map((role) => ALL_ACTIONS.map((action) => {
                        const has = matrix[role.key]?.[mod]?.[action];
                        return (
                          <td key={`${role.key}-${mod}-${action}`} className="text-center border-r border-border/30 last:border-r-0">
                            {has ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-muted-foreground/10 mx-auto" />
                            )}
                          </td>
                        );
                      }))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-6 text-[10px] text-muted-foreground bg-muted/20 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Permiso concedido</div>
        <div className="flex items-center gap-1.5"><X className="w-3 h-3 text-muted-foreground/20" /> Sin acceso</div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          {ALL_ACTIONS.slice(0, 8).map(a => (
            <span key={a} className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50">{a.substring(0, 2).toUpperCase()}: {a}</span>
          ))}
        </div>
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Configurar Permisos — {
                editingRole?.kind === "fixed" 
                ? FIXED_ROLES.find(r => r.value === editingRole.role)?.label 
                : customRoles.find(c => c.id === editingRole?.id)?.name
              }
            </DialogTitle>
            <DialogDescription>Gestiona el acceso detallado por módulo y acción. Usa "Marcar Todo" para configurar categorías completas rápidamente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 my-4">
            {MODULE_GROUPS.map((group) => {
              const groupModuleIds = group.modules;
              const groupPerms = permissions.filter(p => groupModuleIds.includes(p.module));
              const allGroupOn = groupPerms.length > 0 && groupPerms.every(p => editPermSet.has(p.id));

              const toggleGroup = (on: boolean) => {
                setEditPermSet(s => {
                  const n = new Set(s);
                  groupPerms.forEach(p => on ? n.add(p.id) : n.delete(p.id));
                  return n;
                });
              };

              return (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">{group.label}</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 px-2 text-[10px] font-bold"
                      onClick={() => toggleGroup(!allGroupOn)}
                    >
                      {allGroupOn ? "Desmarcar Todo" : "Marcar Todo"}
                    </Button>
                  </div>
                  <div className="grid gap-4">
                    {group.modules.map((mod) => {
                      const modPerms = permissions.filter(p => p.module === mod);
                      if (modPerms.length === 0) return null;
                      const allOn = modPerms.every(p => editPermSet.has(p.id));
                      return (
                        <div key={mod} className="flex flex-col md:flex-row md:items-center gap-4 p-3 rounded-lg border border-border bg-secondary/10">
                          <div className="md:w-48 flex items-center gap-2">
                            <Checkbox checked={allOn} onCheckedChange={(v) => toggleModule(mod, !!v)} />
                            <span className="text-sm font-semibold">{MODULE_LABELS[mod] || mod}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {modPerms.map((p) => (
                              <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:text-accent transition-colors">
                                <Checkbox checked={editPermSet.has(p.id)} onCheckedChange={() => togglePerm(p.id)} />
                                <span>{p.label || p.action}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setEditingRole(null)}>Cancelar</Button>
            <Button onClick={savePermissions} disabled={saving} className="min-w-[140px]">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
