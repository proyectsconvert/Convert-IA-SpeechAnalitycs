import { useMemo, useState, useEffect, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Shield, Check, X, Plus, Save, Loader2, Pencil, Search, Copy, Trash2,
  ChevronRight, ChevronDown, Users, Sparkles, AlertCircle, MoreVertical,
  SlidersHorizontal, CheckCircle2, Eye, Power, AlertTriangle,
  LayoutGrid, Table2, Info, ArrowRight, Lock, CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Permission = Database["public"]["Tables"]["permissions"]["Row"];
type CustomRole = Database["public"]["Tables"]["custom_roles"]["Row"];

const FIXED_ROLES: { value: AppRole; label: string; description: string; color: string }[] = [
  { value: "superadmin", label: "Super Admin", description: "Control total y absoluto sobre todas las cuentas, modelos y configuraciones del sistema.", color: "#8B5CF6" },
  { value: "admin", label: "Administrador", description: "Gestión avanzada de la organización, miembros, conexiones y modelos asignados.", color: "#3B82F6" },
  { value: "supervisor", label: "Supervisor", description: "Monitoreo de agentes, evaluación de calidad y supervisión de transcripciones.", color: "#10B981" },
  { value: "analyst", label: "Analista", description: "Exploración de llamadas, transcripciones, chat IA y métricas analíticas.", color: "#F59E0B" },
  { value: "observer", label: "Observador", description: "Acceso de solo lectura para consulta de paneles e informes ejecutivos.", color: "#6B7280" },
];

/**
 * 6 Bloques Jerárquicos alineados EXACTAMENTE a la navegación superior real de Convert-IA.
 */
interface ModuleMeta {
  id: string;
  name: string;
  route: string;
  description: string;
  dbModules: string[]; // Módulos en la tabla `permissions`
  submodules?: string[];
  readOnlyActions?: string[]; // Acciones consideradas "solo lectura"
  operationActions?: string[]; // Acciones consideradas "operación normal"
}

interface NavCategoryBlock {
  id: string;
  title: string;
  description: string;
  modules: ModuleMeta[];
}

const HIERARCHICAL_STRUCTURE: NavCategoryBlock[] = [
  {
    id: "operacion",
    title: "1. Principal / Operación",
    description: "Módulos operativos centrales accesibles directamente en la barra superior.",
    modules: [
      {
        id: "dashboard",
        name: "Panel General",
        route: "/",
        description: "Dashboard ejecutivo con métricas de llamadas y actividad en tiempo real.",
        dbModules: ["dashboard"],
        readOnlyActions: ["view"],
        operationActions: ["view", "export"],
      },
      {
        id: "library",
        name: "Biblioteca de Grabaciones",
        route: "/biblioteca",
        description: "Catálogo de audios procesados, reproductor, descargas, subidas y gestión.",
        dbModules: ["library", "uploads"],
        readOnlyActions: ["view", "play"],
        operationActions: ["view", "play", "export", "reprocess", "create", "bulk_create"],
      },
      {
        id: "whatsapp",
        name: "Gestión de Chats WhatsApp",
        route: "/analytics-whatsapp",
        description: "Explorador de conversaciones, cargas masivas de chats y análisis estructurado.",
        dbModules: ["whatsapp"],
        readOnlyActions: ["view"],
        operationActions: ["view", "upload", "export", "create"],
      },
      {
        id: "transcriptions",
        name: "Transcripciones",
        route: "/transcripciones",
        description: "Visualizador de texto completo diarizado, segmentos temporales y edición.",
        dbModules: ["transcriptions"],
        readOnlyActions: ["view"],
        operationActions: ["view", "edit", "export"],
      },
    ],
  },
  {
    id: "analitica",
    title: "2. Analítica",
    description: "Explorador unificado multicriterio y métricas de calidad estratégica.",
    modules: [
      {
        id: "analizador-total",
        name: "Analítica",
        route: "/analizador-total",
        description: "Analítica combinada de llamadas y WhatsApp, con matrices de calidad y filtros.",
        dbModules: ["analytics", "analyses"],
        readOnlyActions: ["view"],
        operationActions: ["view", "export", "create", "edit"],
      },
      {
        id: "analiticas",
        name: "Indicadores",
        route: "/analiticas",
        description: "Indicadores estratégicos de negocio, resúmenes ejecutivos y exportación PDF.",
        dbModules: ["reports"],
        readOnlyActions: ["view"],
        operationActions: ["view", "create", "share", "export"],
      },
    ],
  },
  {
    id: "inteligencia",
    title: "3. Inteligencia IA",
    description: "Herramientas de IA conversacional, extracción de entidades y catálogo de prompts.",
    modules: [
      {
        id: "consulta-ia",
        name: "Copiloto IA",
        route: "/consulta-ia",
        description: "Asistente conversacional para consultas libres sobre todas las interacciones.",
        dbModules: ["chat_ai"],
        readOnlyActions: ["view", "history"],
        operationActions: ["view", "use", "history"],
      },
      {
        id: "extracciones",
        name: "Reglas de Extracción",
        route: "/extracciones",
        description: "Configuración de reglas automáticas de extracción de variables en audios y chats.",
        dbModules: ["extractions"],
        readOnlyActions: ["view"],
        operationActions: ["view", "manage"],
      },
      {
        id: "prompts",
        name: "Prompts",
        route: "/prompts",
        description: "Catálogo de prompts parametrizados, optimizador con IA y versiones en producción.",
        dbModules: ["prompts"],
        readOnlyActions: ["view"],
        operationActions: ["view", "create", "edit", "optimize", "compare"],
      },
    ],
  },
  {
    id: "configuracion",
    title: "4. Configuración",
    description: "Infraestructura técnica, conectores de ingesta y motores de transcripción.",
    modules: [
      {
        id: "conexion",
        name: "Integraciones",
        route: "/conexion",
        description: "Configuración de fuentes de ingesta remota (SFTP, FTP, Webhooks).",
        dbModules: ["connections"],
        readOnlyActions: ["view"],
        operationActions: ["view", "create", "edit", "run"],
      },
      {
        id: "modelos-transcripcion",
        name: "Modelos de Transcripción",
        route: "/modelos-transcripcion",
        description: "Selección y afinación de proveedores de ASR (OpenAI Whisper, Deepgram, etc.).",
        dbModules: ["transcription_models"],
        readOnlyActions: ["view"],
        operationActions: ["view", "edit"],
      },
      {
        id: "validacion-modelos",
        name: "Evaluación de Modelos",
        route: "/validacion-modelos",
        description: "Validación de credenciales y pruebas de conectividad y latencia de modelos.",
        dbModules: ["transcription_models"],
        readOnlyActions: ["test"],
        operationActions: ["test"],
      },
    ],
  },
  {
    id: "administracion",
    title: "5. Administración",
    description: "Gestión corporativa de cuentas, miembros, roles, cuotas y auditoría.",
    modules: [
      {
        id: "cuentas",
        name: "Cuentas",
        route: "/cuentas",
        description: "Administración de organizaciones y tenants multi-empresa.",
        dbModules: ["accounts"],
        readOnlyActions: ["view"],
        operationActions: ["view", "switch"],
      },
      {
        id: "usuarios",
        name: "Usuarios",
        route: "/usuarios",
        description: "Directorio de usuarios, invitaciones y asignación de cuentas y roles.",
        dbModules: ["users"],
        readOnlyActions: ["view"],
        operationActions: ["view", "invite", "create", "edit", "assign_role"],
      },
      {
        id: "roles",
        name: "Roles y Permisos",
        route: "/roles",
        description: "Creación de roles y personalización de la matriz de privilegios.",
        dbModules: ["roles"],
        readOnlyActions: ["view"],
        operationActions: ["view", "create", "edit", "duplicate"],
      },
      {
        id: "limites",
        name: "Uso y Límites",
        route: "/limites",
        description: "Consumo de horas de audio, cuotas de procesamiento y almacenamiento.",
        dbModules: ["billing"],
        readOnlyActions: ["view"],
        operationActions: ["view"],
      },
      {
        id: "facturacion",
        name: "Facturación",
        route: "/facturacion",
        description: "Planes contratados, facturas descargables e historial de cobros.",
        dbModules: ["billing"],
        readOnlyActions: ["view"],
        operationActions: ["view", "export"],
      },
      {
        id: "auditoria",
        name: "Auditoría",
        route: "/auditoria",
        description: "Registro cronológico de actividad, inicios de sesión y operaciones sensibles.",
        dbModules: ["audit"],
        readOnlyActions: ["view"],
        operationActions: ["view", "export"],
      },
      {
        id: "soporte",
        name: "Soporte",
        route: "/soporte",
        description: "Tickets de asistencia técnica y centro de ayuda de la plataforma.",
        dbModules: ["soporte"],
        readOnlyActions: ["view"],
        operationActions: ["view"],
      },
    ],
  },
  {
    id: "otras-configuraciones",
    title: "6. Otras Configuraciones",
    description: "Ajustes de personalización general accesibles desde el menú de perfil.",
    modules: [
      {
        id: "configuracion",
        name: "Configuración de perfil / plataforma",
        route: "/configuracion",
        description: "Ajustes del perfil, identidad visual (branding) y políticas de seguridad.",
        dbModules: ["settings"],
        readOnlyActions: ["view"],
        operationActions: ["view", "edit"],
      },
    ],
  },
];

const PRESET_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899",
  "#06B6D4", "#6366F1", "#14B8A6", "#F97316", "#64748B",
];

export default function RolesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const isSuperadmin = !!profile?.is_superadmin;
  const canEditRoles = isSuperadmin || can("roles", "edit");

  // Estado de vista: 'cards' (por defecto) o 'matrix' (avanzada)
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [searchRole, setSearchRole] = useState("");

  // Editor de permisos activo
  const [editingRole, setEditingRole] = useState<{
    kind: "fixed"; role: AppRole; name: string; color: string; description: string;
  } | {
    kind: "custom"; id: string; name: string; color: string; description: string;
  } | null>(null);

  // Set de permission_id habilitados en el editor
  const [editPermSet, setEditPermSet] = useState<Set<string>>(new Set());
  const [initialPermSet, setInitialPermSet] = useState<Set<string>>(new Set());
  const [editorSearch, setEditorSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    operacion: true, analitica: true, inteligencia: true, configuracion: true, administracion: true, "otras-configuraciones": true,
  });
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Modal: Crear nuevo rol
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
    copyFrom: "none",
  });
  const [creatingRole, setCreatingRole] = useState(false);

  // Modal: Duplicar rol
  const [duplicatingRole, setDuplicatingRole] = useState<{
    kind: "fixed" | "custom"; id: string; name: string;
  } | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateSaving, setDuplicateSaving] = useState(false);

  // Modal: Eliminar rol personalizado
  const [deletingRole, setDeletingRole] = useState<CustomRole | null>(null);
  const [deleteUsersCount, setDeleteUsersCount] = useState(0);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Consultas de datos
  const { data: permissions = [], isLoading: pLoading } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("*")
        .order("sort_order")
        .order("module")
        .order("action");
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

  // Conteo de usuarios por rol (en cuentas activas)
  const { data: userAccounts = [] } = useQuery({
    queryKey: ["user-accounts-for-roles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_accounts")
        .select("user_id, role, custom_role_id, is_active")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Total de perfiles superadmin
  const { data: superadminProfiles = [] } = useQuery({
    queryKey: ["superadmin-profiles-count"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id").eq("is_superadmin", true);
      return data || [];
    },
  });

  // Mapa de usuarios por rol
  const userCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Superadmin: perfiles con is_superadmin = true + membresías con role superadmin
    const superadminIds = new Set([
      ...superadminProfiles.map((p: any) => p.id),
      ...userAccounts.filter((ua: any) => ua.role === "superadmin").map((ua: any) => ua.user_id),
    ]);
    counts["fixed:superadmin"] = superadminIds.size;

    FIXED_ROLES.forEach((r) => {
      if (r.value === "superadmin") return;
      const count = new Set(
        userAccounts
          .filter((ua: any) => ua.role === r.value && !ua.custom_role_id)
          .map((ua: any) => ua.user_id)
      ).size;
      counts[`fixed:${r.value}`] = count;
    });

    customRoles.forEach((cr) => {
      const count = new Set(
        userAccounts
          .filter((ua: any) => ua.custom_role_id === cr.id)
          .map((ua: any) => ua.user_id)
      ).size;
      counts[`custom:${cr.id}`] = count;
    });

    return counts;
  }, [userAccounts, superadminProfiles, customRoles]);

  // Lista de permisos por rol para cálculo de estadísticas y vista de matriz
  const rolePermMap = useMemo(() => {
    const m: Record<string, Set<string>> = {};

    [...FIXED_ROLES.map((r) => `fixed:${r.value}`), ...customRoles.map((c) => `custom:${c.id}`)].forEach((rk) => {
      m[rk] = new Set();
    });

    // Superadmin tiene TODOS los permisos
    if (m["fixed:superadmin"]) {
      permissions.forEach((p) => m["fixed:superadmin"].add(p.id));
    }

    rolePerms.forEach((rp: any) => {
      const key = `fixed:${rp.role}`;
      if (m[key]) m[key].add(rp.permission_id);
    });

    customRolePerms.forEach((crp: any) => {
      if (!crp.granted) return;
      const key = `custom:${crp.custom_role_id}`;
      if (m[key]) m[key].add(crp.permission_id);
    });

    return m;
  }, [permissions, rolePerms, customRoles, customRolePerms]);

  // Helpers para obtener permisos de un módulo
  const getModulePermissions = (mod: ModuleMeta): Permission[] => {
    return permissions.filter((p) => {
      if (!mod.dbModules.includes(p.module)) return false;
      // Para modelos de transcripción vs evaluación de modelos
      if (mod.id === "validacion-modelos") return p.action === "test";
      if (mod.id === "modelos-transcripcion") return p.action !== "test";
      // Para uso y límites vs facturación
      if (mod.id === "limites" && p.module === "billing") {
        return p.submodule === "limits" || p.submodule === "usage" || p.action.includes("limits") || p.action.includes("usage");
      }
      if (mod.id === "facturacion" && p.module === "billing") {
        return p.submodule === "invoices" || p.action.includes("invoices") || (!p.submodule && !p.action.includes("limits") && !p.action.includes("usage"));
      }
      return true;
    });
  };

  // Conteo de módulos habilitados por rol (de los 18 módulos totales)
  const allModulesList = useMemo(() => {
    return HIERARCHICAL_STRUCTURE.flatMap((cat) => cat.modules);
  }, []);

  const totalModulesCount = allModulesList.length;

  const roleModuleStats = useMemo(() => {
    const stats: Record<string, { enabledModules: number; totalPerms: number; isFullAccess: boolean }> = {};

    Object.keys(rolePermMap).forEach((roleKey) => {
      const permSet = rolePermMap[roleKey] || new Set();
      let enabledCount = 0;

      allModulesList.forEach((mod) => {
        const modPerms = getModulePermissions(mod);
        if (modPerms.length > 0 && modPerms.some((p) => permSet.has(p.id))) {
          enabledCount++;
        }
      });

      const isFull = roleKey === "fixed:superadmin" || (enabledCount === totalModulesCount && permSet.size >= permissions.length);

      stats[roleKey] = {
        enabledModules: roleKey === "fixed:superadmin" ? totalModulesCount : enabledCount,
        totalPerms: permSet.size,
        isFullAccess: isFull,
      };
    });

    return stats;
  }, [rolePermMap, allModulesList, permissions]);

  // Roles filtrados para la pantalla principal
  const filteredFixedRoles = useMemo(() => {
    if (!searchRole.trim()) return FIXED_ROLES;
    const q = searchRole.toLowerCase();
    return FIXED_ROLES.filter((r) => r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [searchRole]);

  const filteredCustomRoles = useMemo(() => {
    if (!searchRole.trim()) return customRoles;
    const q = searchRole.toLowerCase();
    return customRoles.filter((cr) => cr.name.toLowerCase().includes(q) || (cr.description || "").toLowerCase().includes(q));
  }, [customRoles, searchRole]);

  // Iniciar edición de rol
  const startEditRole = (roleKey: string) => {
    const isFixed = roleKey.startsWith("fixed:");
    const id = roleKey.replace(/^(fixed:|custom:)/, "");

    let name = "";
    let color = "#3B82F6";
    let description = "";

    if (isFixed) {
      const fixed = FIXED_ROLES.find((r) => r.value === id);
      if (!fixed) return;
      name = fixed.label;
      color = fixed.color;
      description = fixed.description;
      setEditingRole({ kind: "fixed", role: fixed.value, name, color, description });
    } else {
      const custom = customRoles.find((c) => c.id === id);
      if (!custom) return;
      name = custom.name;
      color = custom.color || "#3B82F6";
      description = custom.description || "";
      setEditingRole({ kind: "custom", id: custom.id, name, color, description });
    }

    const currentPerms = new Set(rolePermMap[roleKey] || []);
    setEditPermSet(new Set(currentPerms));
    setInitialPermSet(new Set(currentPerms));
    setEditorSearch("");
  };

  // Comprobar si hay cambios sin guardar
  const isDirty = useMemo(() => {
    if (editPermSet.size !== initialPermSet.size) return true;
    for (const pid of editPermSet) {
      if (!initialPermSet.has(pid)) return true;
    }
    return false;
  }, [editPermSet, initialPermSet]);

  // Guardar permisos editados
  const savePermissions = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      const ids = Array.from(editPermSet);

      if (editingRole.kind === "fixed") {
        if (editingRole.role === "superadmin") {
          toast.info("El rol Super Admin siempre conserva acceso total por seguridad.");
          setEditingRole(null);
          return;
        }

        const { error: delErr } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", editingRole.role);
        if (delErr) throw delErr;

        if (ids.length > 0) {
          const rows = ids.map((pid) => ({ role: editingRole.role, permission_id: pid }));
          const { error: insErr } = await supabase.from("role_permissions").insert(rows);
          if (insErr) throw insErr;
        }
      } else {
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
          const { error: insErr } = await supabase.from("custom_role_permissions").insert(rows);
          if (insErr) throw insErr;
        }
      }

      toast.success("Permisos actualizados correctamente");
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["custom-role-permissions"] });
      qc.invalidateQueries({ queryKey: ["effective-role-permissions"] });
      setEditingRole(null);
    } catch (err: any) {
      console.error("Error guardando permisos:", err);
      toast.error("Error al guardar: " + (err.message || "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  // Crear nuevo rol personalizado
  const handleCreateRole = async () => {
    if (!createForm.name.trim()) {
      toast.error("Ingresa el nombre del rol");
      return;
    }

    setCreatingRole(true);
    try {
      const { data: newRole, error: crErr } = await supabase
        .from("custom_roles")
        .insert({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          color: createForm.color,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (crErr) throw crErr;

      // Si seleccionó copiar de otro rol
      if (createForm.copyFrom && createForm.copyFrom !== "none") {
        const sourcePermIds = Array.from(rolePermMap[createForm.copyFrom] || []);
        if (sourcePermIds.length > 0) {
          const rows = sourcePermIds.map((pid) => ({
            custom_role_id: newRole.id,
            permission_id: pid,
            granted: true,
          }));
          const { error: insErr } = await supabase.from("custom_role_permissions").insert(rows);
          if (insErr) throw insErr;
        }
      }

      toast.success(`Rol "${newRole.name}" creado con éxito`);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["custom-role-permissions"] });
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "", color: "#3B82F6", copyFrom: "none" });

      // Abrir editor inmediatamente para personalizar
      startEditRole(`custom:${newRole.id}`);
    } catch (err: any) {
      console.error("Error creando rol:", err);
      toast.error("Error al crear rol: " + (err.message || "desconocido"));
    } finally {
      setCreatingRole(false);
    }
  };

  // Iniciar duplicar rol
  const startDuplicateRole = (roleKey: string, roleName: string) => {
    const isFixed = roleKey.startsWith("fixed:");
    const id = roleKey.replace(/^(fixed:|custom:)/, "");
    setDuplicatingRole({
      kind: isFixed ? "fixed" : "custom",
      id,
      name: roleName,
    });
    setDuplicateName(`${roleName} (copia)`);
  };

  // Ejecutar duplicar rol
  const handleDuplicateRole = async () => {
    if (!duplicatingRole || !duplicateName.trim()) return;
    setDuplicateSaving(true);
    try {
      const sourceKey = `${duplicatingRole.kind}:${duplicatingRole.id}`;
      const sourcePermIds = Array.from(rolePermMap[sourceKey] || []);

      const { data: newRole, error: crErr } = await supabase
        .from("custom_roles")
        .insert({
          name: duplicateName.trim(),
          description: `Copia de permisos basada en "${duplicatingRole.name}"`,
          color: "#10B981",
          created_by: profile?.id,
        })
        .select()
        .single();

      if (crErr) throw crErr;

      if (sourcePermIds.length > 0) {
        const rows = sourcePermIds.map((pid) => ({
          custom_role_id: newRole.id,
          permission_id: pid,
          granted: true,
        }));
        const { error: insErr } = await supabase.from("custom_role_permissions").insert(rows);
        if (insErr) throw insErr;
      }

      toast.success(`Rol duplicado como "${newRole.name}"`);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["custom-role-permissions"] });
      setDuplicatingRole(null);
    } catch (err: any) {
      console.error("Error duplicando rol:", err);
      toast.error("Error al duplicar: " + (err.message || "desconocido"));
    } finally {
      setDuplicateSaving(false);
    }
  };

  // Preparar eliminación de rol personalizado
  const startDeleteRole = (cr: CustomRole) => {
    const assignedCount = userCounts[`custom:${cr.id}`] || 0;
    setDeleteUsersCount(assignedCount);
    setDeletingRole(cr);
  };

  // Confirmar eliminación de rol
  const confirmDeleteRole = async () => {
    if (!deletingRole) return;
    setDeleteSaving(true);
    try {
      // 1. Desvincular usuarios asignados a este rol personalizado
      await supabase
        .from("user_accounts")
        .update({ custom_role_id: null })
        .eq("custom_role_id", deletingRole.id);

      // 2. Eliminar permisos asociados
      await supabase
        .from("custom_role_permissions")
        .delete()
        .eq("custom_role_id", deletingRole.id);

      // 3. Eliminar el rol
      const { error } = await supabase
        .from("custom_roles")
        .delete()
        .eq("id", deletingRole.id);

      if (error) throw error;

      toast.success(`Rol "${deletingRole.name}" eliminado`);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["custom-role-permissions"] });
      qc.invalidateQueries({ queryKey: ["user-accounts-for-roles"] });
      qc.invalidateQueries({ queryKey: ["effective-role-permissions"] });
      setDeletingRole(null);
    } catch (err: any) {
      console.error("Error eliminando rol:", err);
      toast.error("Error al eliminar rol: " + (err.message || "desconocido"));
    } finally {
      setDeleteSaving(false);
    }
  };

  // Toggle activo/inactivo rol personalizado
  const toggleRoleActive = async (cr: CustomRole) => {
    try {
      const nextActive = !cr.is_active;
      const { error } = await supabase
        .from("custom_roles")
        .update({ is_active: nextActive })
        .eq("id", cr.id);
      if (error) throw error;
      toast.success(`Rol "${cr.name}" ${nextActive ? "activado" : "desactivado"}`);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
    } catch (err: any) {
      toast.error("Error al actualizar estado: " + err.message);
    }
  };

  // Toggle permiso individual en editor
  const togglePerm = (id: string) => {
    setEditPermSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Toggle módulo completo en editor (Lógica padre-hijo)
  const toggleModule = (mod: ModuleMeta, enable: boolean) => {
    const modPerms = getModulePermissions(mod);
    setEditPermSet((prev) => {
      const next = new Set(prev);
      modPerms.forEach((p) => (enable ? next.add(p.id) : next.delete(p.id)));
      return next;
    });
  };

  // Toggle categoría completa en editor (Marcar / Desmarcar todo)
  const toggleCategory = (cat: NavCategoryBlock, enable: boolean) => {
    const catPerms = cat.modules.flatMap((m) => getModulePermissions(m));
    setEditPermSet((prev) => {
      const next = new Set(prev);
      catPerms.forEach((p) => (enable ? next.add(p.id) : next.delete(p.id)));
      return next;
    });
  };

  // Preset rápido por módulo: "Solo lectura", "Operación", "Acceso completo"
  const applyModulePreset = (mod: ModuleMeta, preset: "readOnly" | "operation" | "all") => {
    const modPerms = getModulePermissions(mod);
    setEditPermSet((prev) => {
      const next = new Set(prev);
      // Primero limpiamos las del módulo
      modPerms.forEach((p) => next.delete(p.id));

      if (preset === "all") {
        modPerms.forEach((p) => next.add(p.id));
      } else if (preset === "readOnly") {
        const readKeywords = mod.readOnlyActions || ["view", "play", "history", "test"];
        modPerms.forEach((p) => {
          if (readKeywords.includes(p.action)) next.add(p.id);
        });
      } else if (preset === "operation") {
        const opKeywords = mod.operationActions || ["view", "play", "export", "use", "create", "edit", "reprocess"];
        modPerms.forEach((p) => {
          if (opKeywords.includes(p.action)) next.add(p.id);
        });
      }

      return next;
    });
  };

  // Determinar estado de un módulo en el editor: 'full', 'partial', 'none'
  const getModuleState = (mod: ModuleMeta, currentSet: Set<string>): "full" | "partial" | "none" => {
    const modPerms = getModulePermissions(mod);
    if (modPerms.length === 0) return "none";
    const grantedCount = modPerms.filter((p) => currentSet.has(p.id)).length;
    if (grantedCount === 0) return "none";
    if (grantedCount === modPerms.length) return "full";
    return "partial";
  };

  // Conteo en tiempo real para el editor
  const editorStats = useMemo(() => {
    let enabledModCount = 0;
    allModulesList.forEach((mod) => {
      const s = getModuleState(mod, editPermSet);
      if (s !== "none") enabledModCount++;
    });
    return {
      enabledModules: enabledModCount,
      activePerms: editPermSet.size,
    };
  }, [editPermSet, allModulesList]);

  if (pLoading || rpLoading || crLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando sistema de Roles y Permisos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* 1. CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center text-accent shadow-xs">
              <Shield className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                Roles y Permisos
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configura roles dinámicos y asigna privilegios granulares adaptados a la navegación real de la plataforma.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Switcher de Vista: Tarjetas vs Matriz */}
          <div className="flex items-center bg-secondary/80 p-1 rounded-xl border border-border/60">
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                viewMode === "cards"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Roles</span>
            </button>
            <button
              onClick={() => setViewMode("matrix")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                viewMode === "matrix"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Vista avanzada</span>
            </button>
          </div>

          {canEditRoles && (
            <Button
              onClick={() => setShowCreateModal(true)}
              className="rounded-xl gap-2 font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Crear rol</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. VISTA DE TARJETAS / FILAS (EXPERIENCIA PRINCIPAL) */}
      {viewMode === "cards" && (
        <div className="space-y-6">
          {/* Buscador de Roles */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar rol por nombre..."
                value={searchRole}
                onChange={(e) => setSearchRole(e.target.value)}
                className="pl-9 h-9 rounded-xl bg-card border-border/70 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Total de roles: <span className="font-semibold text-foreground">{filteredFixedRoles.length + filteredCustomRoles.length}</span>
            </div>
          </div>

          {/* Sección 1: Roles del Sistema */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-violet-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Roles del Sistema
                </h2>
                <Badge variant="outline" className="text-[10px] bg-secondary/50 font-normal">
                  Predefinidos protegidos
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFixedRoles.map((role) => {
                const roleKey = `fixed:${role.value}`;
                const stats = roleModuleStats[roleKey] || { enabledModules: 0, totalPerms: 0, isFullAccess: false };
                const userCount = userCounts[roleKey] || 0;

                return (
                  <div
                    key={role.value}
                    className="group bg-card hover:bg-card/90 border border-border/80 hover:border-accent/40 rounded-2xl p-4 shadow-xs transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: role.color }}
                          />
                          <h3 className="font-bold text-sm text-foreground">{role.label}</h3>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-semibold flex items-center gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                        >
                          <Lock className="w-2.5 h-2.5" /> Rol del sistema
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                        {role.description}
                      </p>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground">Usuarios:</span>
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <Users className="w-3 h-3 text-muted-foreground" /> {userCount} {userCount === 1 ? "usuario" : "usuarios"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground">Módulos:</span>
                          <span className="font-semibold text-foreground">
                            {role.value === "superadmin" ? "Todos (18 de 18)" : `${stats.enabledModules} de ${totalModulesCount}`}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        Permisos:{" "}
                        <span className="font-semibold text-foreground">
                          {stats.isFullAccess ? "Acceso completo" : `${stats.totalPerms} permisos activos`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 mt-3 border-t border-border/50">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditRole(roleKey)}
                        className="flex-1 rounded-xl text-xs font-semibold h-8"
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1 text-accent" />
                        {role.value === "superadmin" ? "Ver permisos" : "Editar permisos"}
                      </Button>

                      {canEditRoles && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startDuplicateRole(roleKey, role.label)}
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                          title="Duplicar rol para crear uno personalizado"
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Duplicar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sección 2: Roles Personalizados */}
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Roles Personalizados
                </h2>
                <Badge variant="outline" className="text-[10px] bg-secondary/50 font-normal">
                  {filteredCustomRoles.length} creados
                </Badge>
              </div>
            </div>

            {filteredCustomRoles.length === 0 ? (
              <div className="bg-card/50 border border-dashed border-border rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto text-accent">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Sin roles personalizados</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                    Crea roles específicos para tu equipo (ej. "Analista de Calidad", "Auditor Externo") sin modificar código.
                  </p>
                </div>
                {canEditRoles && (
                  <Button
                    size="sm"
                    onClick={() => setShowCreateModal(true)}
                    className="rounded-xl gap-1.5 text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear primer rol</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCustomRoles.map((cr) => {
                  const roleKey = `custom:${cr.id}`;
                  const stats = roleModuleStats[roleKey] || { enabledModules: 0, totalPerms: 0, isFullAccess: false };
                  const userCount = userCounts[roleKey] || 0;

                  return (
                    <div
                      key={cr.id}
                      className={cn(
                        "group bg-card hover:bg-card/90 border rounded-2xl p-4 shadow-xs transition-all flex flex-col justify-between",
                        cr.is_active ? "border-border/80 hover:border-accent/40" : "border-border/40 opacity-70"
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cr.color || "#3B82F6" }}
                            />
                            <h3 className="font-bold text-sm text-foreground truncate">{cr.name}</h3>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {!cr.is_active && (
                              <Badge variant="outline" className="text-[10px] text-amber-500 bg-amber-500/10 border-amber-500/20">
                                Inactivo
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-semibold flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            >
                              <Users className="w-2.5 h-2.5" /> Personalizado
                            </Badge>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                          {cr.description || "Sin descripción proporcionada."}
                        </p>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">Usuarios:</span>
                            <span className="font-semibold text-foreground flex items-center gap-1">
                              <Users className="w-3 h-3 text-muted-foreground" /> {userCount} {userCount === 1 ? "usuario" : "usuarios"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">Módulos:</span>
                            <span className="font-semibold text-foreground">
                              {stats.enabledModules} de {totalModulesCount}
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground">
                          Permisos:{" "}
                          <span className="font-semibold text-foreground">
                            {stats.totalPerms === 0 ? "Sin acceso asignado" : `${stats.totalPerms} permisos activos`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-4 mt-3 border-t border-border/50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditRole(roleKey)}
                          className="flex-1 rounded-xl text-xs font-semibold h-8"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1 text-accent" />
                          Editar permisos
                        </Button>

                        {canEditRoles && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startDuplicateRole(roleKey, cr.name)}
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                              title="Duplicar rol"
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Duplicar
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                                <DropdownMenuItem onClick={() => toggleRoleActive(cr)} className="text-xs">
                                  <Power className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                  {cr.is_active ? "Desactivar rol" : "Activar rol"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => startDeleteRole(cr)}
                                  className="text-xs text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                                  Eliminar rol
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. VISTA AVANZADA (MATRIZ DETALLADA CONSERVADA) */}
      {viewMode === "matrix" && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-secondary/60 border-b border-border">
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase sticky left-0 bg-secondary/90 backdrop-blur-md z-20 min-w-[220px] border-r border-border">
                      Categoría / Módulo
                    </th>
                    {FIXED_ROLES.map((role) => (
                      <th
                        key={role.value}
                        className="text-center px-3 py-3 border-r border-border last:border-r-0 min-w-[120px]"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                          <span className="font-bold text-foreground">{role.label}</span>
                        </div>
                      </th>
                    ))}
                    {customRoles.map((cr) => (
                      <th
                        key={cr.id}
                        className="text-center px-3 py-3 border-r border-border last:border-r-0 min-w-[120px]"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cr.color || "#3B82F6" }} />
                          <span className="font-bold text-foreground">{cr.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HIERARCHICAL_STRUCTURE.map((category) => (
                    <Fragment key={category.id}>
                      <tr className="bg-muted/60 border-b border-border">
                        <td
                          colSpan={1 + FIXED_ROLES.length + customRoles.length}
                          className="px-4 py-2 font-bold text-foreground uppercase tracking-wider text-[10px]"
                        >
                          {category.title}
                        </td>
                      </tr>
                      {category.modules.map((mod) => {
                        return (
                          <tr key={mod.id} className="border-b border-border/60 hover:bg-secondary/10 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-foreground sticky left-0 bg-card z-10 border-r border-border">
                              <div>
                                <p className="font-semibold">{mod.name}</p>
                                <p className="text-[9px] text-muted-foreground font-mono">{mod.route}</p>
                              </div>
                            </td>
                            {FIXED_ROLES.map((role) => {
                              const key = `fixed:${role.value}`;
                              const permSet = rolePermMap[key] || new Set();
                              const state = getModuleState(mod, permSet);

                              return (
                                <td key={`${role.value}-${mod.id}`} className="text-center px-2 py-2 border-r border-border/40">
                                  {state === "full" && (
                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                      🟢 Completo
                                    </Badge>
                                  )}
                                  {state === "partial" && (
                                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                      🟡 Parcial
                                    </Badge>
                                  )}
                                  {state === "none" && (
                                    <span className="text-muted-foreground/30 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {customRoles.map((cr) => {
                              const key = `custom:${cr.id}`;
                              const permSet = rolePermMap[key] || new Set();
                              const state = getModuleState(mod, permSet);

                              return (
                                <td key={`${cr.id}-${mod.id}`} className="text-center px-2 py-2 border-r border-border/40">
                                  {state === "full" && (
                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                      🟢 Completo
                                    </Badge>
                                  )}
                                  {state === "partial" && (
                                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                      🟡 Parcial
                                    </Badge>
                                  )}
                                  {state === "none" && (
                                    <span className="text-muted-foreground/30 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: CREAR NUEVO ROL */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent" />
              Crear Nuevo Rol
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define un rol personalizado y elige si deseas configurarlo desde cero o clonar permisos existentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nombre del rol *</Label>
              <Input
                placeholder="Ej: Analista de Calidad, Auditor Externo..."
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Descripción</Label>
              <Textarea
                placeholder="Describe brevemente las responsabilidades y alcance de este rol..."
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                className="rounded-xl resize-none text-xs min-h-[60px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Color identificador</Label>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCreateForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "w-6 h-6 rounded-full transition-all border-2",
                      createForm.color === c ? "border-foreground scale-110 shadow-xs" : "border-transparent opacity-80 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <Label className="text-xs font-semibold">Estrategia inicial de permisos</Label>
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-xl border border-border/70 hover:bg-secondary/50 transition-colors">
                  <input
                    type="radio"
                    name="copyFromOption"
                    checked={createForm.copyFrom === "none"}
                    onChange={() => setCreateForm((f) => ({ ...f, copyFrom: "none" }))}
                    className="accent-accent"
                  />
                  <div>
                    <p className="font-semibold text-foreground">Crear desde cero</p>
                    <p className="text-[10px] text-muted-foreground">Inicia sin ningún permiso asignado y configura manualmente.</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-xl border border-border/70 hover:bg-secondary/50 transition-colors">
                  <input
                    type="radio"
                    name="copyFromOption"
                    checked={createForm.copyFrom !== "none"}
                    onChange={() => setCreateForm((f) => ({ ...f, copyFrom: "fixed:analyst" }))}
                    className="accent-accent"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Copiar permisos de otro rol</p>
                    <p className="text-[10px] text-muted-foreground mb-1.5">Toma la configuración de un rol existente como plantilla.</p>
                    {createForm.copyFrom !== "none" && (
                      <select
                        value={createForm.copyFrom}
                        onChange={(e) => setCreateForm((f) => ({ ...f, copyFrom: e.target.value }))}
                        className="w-full h-8 text-xs bg-secondary rounded-lg px-2 border border-border outline-none"
                      >
                        <optgroup label="Roles del Sistema">
                          {FIXED_ROLES.map((r) => (
                            <option key={r.value} value={`fixed:${r.value}`}>
                              {r.label}
                            </option>
                          ))}
                        </optgroup>
                        {customRoles.length > 0 && (
                          <optgroup label="Roles Personalizados">
                            {customRoles.map((cr) => (
                              <option key={cr.id} value={`custom:${cr.id}`}>
                                {cr.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={handleCreateRole}
              disabled={!createForm.name.trim() || creatingRole}
              className="rounded-xl text-xs font-semibold gap-1.5"
            >
              {creatingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Crear y configurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. MODAL: DUPLICAR ROL */}
      <Dialog open={!!duplicatingRole} onOpenChange={(open) => !open && setDuplicatingRole(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-accent" />
              Duplicar Rol
            </DialogTitle>
            <DialogDescription className="text-xs">
              Crea una copia de <strong>"{duplicatingRole?.name}"</strong> con todos sus permisos asignados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nombre del nuevo rol *</Label>
              <Input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setDuplicatingRole(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={handleDuplicateRole}
              disabled={!duplicateName.trim() || duplicateSaving}
              className="rounded-xl text-xs font-semibold gap-1.5"
            >
              {duplicateSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. MODAL: ELIMINAR ROL PERSONALIZADO */}
      <Dialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Eliminar Rol Personalizado
            </DialogTitle>
            <DialogDescription className="text-xs">
              ¿Estás seguro de que deseas eliminar el rol <strong>"{deletingRole?.name}"</strong>?
            </DialogDescription>
          </DialogHeader>

          {deleteUsersCount > 0 ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Atención: Hay {deleteUsersCount} usuario(s) asignados a este rol.
              </p>
              <p className="text-[11px] leading-relaxed">
                Si eliminas este rol, los usuarios vinculados perderán sus privilegios personalizados y operarán con su rol base.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ningún usuario tiene asignado este rol actualmente. Esta acción no se puede deshacer.
            </p>
          )}

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setDeletingRole(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteRole}
              disabled={deleteSaving}
              className="rounded-xl text-xs font-semibold gap-1.5"
            >
              {deleteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. NUEVO EDITOR DE PERMISOS (MODAL AMPLIO / WORKSPACE CON BARRA STICKY) */}
      <Dialog
        open={!!editingRole}
        onOpenChange={(open) => {
          if (!open) {
            if (isDirty && !window.confirm("Tienes cambios sin guardar. ¿Deseas salir y descartarlos?")) {
              return;
            }
            setEditingRole(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 rounded-3xl border-border/90 bg-background shadow-2xl overflow-hidden">
          {/* Header del Editor */}
          <div className="p-5 border-b border-border/80 bg-card/80 backdrop-blur-md flex-shrink-0 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 shadow-xs"
                  style={{ backgroundColor: editingRole?.color || "#3B82F6" }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground tracking-tight truncate">
                      {editingRole?.name}
                    </h2>
                    {editingRole?.kind === "fixed" ? (
                      <Badge variant="secondary" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        🔒 Rol del sistema
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        👤 Rol personalizado
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {editingRole?.description || "Configuración granular de módulos y acciones."}
                  </p>
                </div>
              </div>

              {/* Métricas en Tiempo Real */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs px-2.5 py-1 bg-secondary/60">
                  <span className="font-bold text-foreground mr-1">{editorStats.enabledModules}</span> de {totalModulesCount} módulos
                </Badge>
                <Badge variant="outline" className="text-xs px-2.5 py-1 bg-secondary/60">
                  <span className="font-bold text-accent mr-1">{editorStats.activePerms}</span> permisos activos
                </Badge>
                <Badge variant="outline" className="text-xs px-2.5 py-1 bg-secondary/60">
                  <Users className="w-3 h-3 mr-1 text-muted-foreground" />
                  <span className="font-bold text-foreground mr-1">
                    {userCounts[`${editingRole?.kind}:${editingRole?.kind === "fixed" ? (editingRole as any).role : (editingRole as any)?.id}`] || 0}
                  </span>{" "}
                  usuarios
                </Badge>
              </div>
            </div>

            {/* Buscador interno y Controles Globales */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar módulo o acción en este rol..."
                  value={editorSearch}
                  onChange={(e) => setEditorSearch(e.target.value)}
                  className="pl-8 h-8 rounded-xl text-xs bg-background/80"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    HIERARCHICAL_STRUCTURE.forEach((c) => (all[c.id] = true));
                    setExpandedCategories(all);
                  }}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Expandir todo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedCategories({})}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Colapsar todo
                </Button>
              </div>
            </div>
          </div>

          {/* Cuerpo Scrollable: Bloques Desplegables de Navegación Real */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {editingRole?.kind === "fixed" && editingRole.role === "superadmin" && (
              <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl flex items-center gap-3 text-xs text-violet-700 dark:text-violet-300">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <p>
                  El rol <strong>Super Admin</strong> tiene acceso garantizado por arquitectura a todos los módulos y acciones del sistema.
                  Esta vista es únicamente de consulta.
                </p>
              </div>
            )}

            {HIERARCHICAL_STRUCTURE.map((category) => {
              // Filtrar módulos si hay búsqueda
              const filteredModules = category.modules.filter((m) => {
                if (!editorSearch.trim()) return true;
                const q = editorSearch.toLowerCase();
                const matchModuleName = m.name.toLowerCase().includes(q) || m.route.toLowerCase().includes(q);
                const modPerms = getModulePermissions(m);
                const matchAction = modPerms.some((p) => (p.label || p.action).toLowerCase().includes(q));
                return matchModuleName || matchAction;
              });

              if (filteredModules.length === 0) return null;

              const isExpanded = expandedCategories[category.id] ?? true;
              const catPerms = category.modules.flatMap((m) => getModulePermissions(m));
              const allCategoryOn = catPerms.length > 0 && catPerms.every((p) => editPermSet.has(p.id));

              return (
                <div
                  key={category.id}
                  className="bg-card rounded-2xl border border-border/80 shadow-xs overflow-hidden"
                >
                  {/* Encabezado de Categoría */}
                  <div className="px-4 py-3 bg-secondary/40 border-b border-border/60 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedCategories((prev) => ({ ...prev, [category.id]: !isExpanded }))}
                      className="flex items-center gap-2.5 text-left flex-1 group cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-transform" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-transform" />
                      )}
                      <div>
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                          {category.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground hidden sm:block">
                          {category.description}
                        </p>
                      </div>
                    </button>

                    {editingRole?.role !== "superadmin" && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCategory(category, !allCategoryOn)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-accent hover:bg-accent/15 rounded-lg"
                        >
                          {allCategoryOn ? "Desmarcar todo" : "Marcar todo"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Módulos de la Categoría */}
                  {isExpanded && (
                    <div className="divide-y divide-border/50">
                      {filteredModules.map((mod) => {
                        const modPerms = getModulePermissions(mod);
                        const state = getModuleState(mod, editPermSet);
                        const isModExpanded = expandedModules[mod.id] ?? (state !== "none" || !!editorSearch);

                        return (
                          <div key={mod.id} className="p-3.5 space-y-3 hover:bg-secondary/10 transition-colors">
                            {/* Cabecera del Módulo */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {/* Checkbox Principal del Módulo (Lógica Padre) */}
                                {editingRole?.role !== "superadmin" && (
                                  <Checkbox
                                    checked={state === "full" ? true : state === "partial" ? "indeterminate" : false}
                                    onCheckedChange={(checked) => toggleModule(mod, checked === true)}
                                    id={`chk-mod-${mod.id}`}
                                    className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                                  />
                                )}

                                <div
                                  className="min-w-0 cursor-pointer select-none"
                                  onClick={() => setExpandedModules((prev) => ({ ...prev, [mod.id]: !isModExpanded }))}
                                >
                                  <div className="flex items-center gap-2">
                                    <label htmlFor={`chk-mod-${mod.id}`} className="text-xs font-bold text-foreground cursor-pointer hover:text-accent transition-colors">
                                      {mod.name}
                                    </label>
                                    <code className="text-[10px] text-muted-foreground/80 bg-secondary/80 px-1.5 py-0.5 rounded font-mono">
                                      {mod.route}
                                    </code>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate max-w-lg">
                                    {mod.description}
                                  </p>
                                </div>
                              </div>

                              {/* Indicador de Estado y Acciones Rápidas */}
                              <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                                {/* Badge de Estado: 🟢 Completo | 🟡 Parcial | ⚪ Sin acceso */}
                                {state === "full" && (
                                  <Badge className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Completo
                                  </Badge>
                                )}
                                {state === "partial" && (
                                  <Badge className="text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                                    <AlertCircle className="w-3 h-3" /> Parcial
                                  </Badge>
                                )}
                                {state === "none" && (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground/60 border-border/80 gap-1">
                                    ⚪ Sin acceso
                                  </Badge>
                                )}

                                {editingRole?.role !== "superadmin" && (
                                  <div className="flex items-center border border-border/60 rounded-lg p-0.5 bg-secondary/40 text-[10px]">
                                    <button
                                      type="button"
                                      onClick={() => applyModulePreset(mod, "readOnly")}
                                      className="px-2 py-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors font-medium"
                                      title="Ver / consultar solamente"
                                    >
                                      Solo lectura
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => applyModulePreset(mod, "operation")}
                                      className="px-2 py-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors font-medium"
                                      title="Acciones operativas normales"
                                    >
                                      Operación
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => applyModulePreset(mod, "all")}
                                      className="px-2 py-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors font-medium"
                                      title="Todas las acciones"
                                    >
                                      Todo
                                    </button>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setExpandedModules((prev) => ({ ...prev, [mod.id]: !isModExpanded }))}
                                  className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                                >
                                  {isModExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {/* Acciones Granulares del Módulo (Desplegables) */}
                            {isModExpanded && (
                              <div className="pt-2 pl-6 sm:pl-7 border-t border-border/40">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                  {modPerms.map((p) => {
                                    const isChecked = editPermSet.has(p.id);

                                    return (
                                      <label
                                        key={p.id}
                                        className={cn(
                                          "flex items-start gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all select-none",
                                          isChecked
                                            ? "bg-accent/10 border-accent/30 text-foreground"
                                            : "bg-secondary/20 border-border/50 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                                        )}
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          disabled={editingRole?.role === "superadmin"}
                                          onCheckedChange={() => togglePerm(p.id)}
                                          className="mt-0.5"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="font-semibold text-[11px] leading-tight flex items-center justify-between gap-1">
                                            <span>{p.label || p.action}</span>
                                            <span className="text-[9px] font-mono text-muted-foreground/70 uppercase">
                                              {p.action}
                                            </span>
                                          </div>
                                          {p.description && (
                                            <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                                              {p.description}
                                            </p>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BARRA INFERIOR STICKY (SIEMPRE DISPONIBLE AL HACER SCROLL) */}
          <div className="p-4 border-t border-border/80 bg-card/95 backdrop-blur-xl flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs">
              {isDirty ? (
                <span className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400 animate-pulse">
                  <AlertCircle className="w-4 h-4" />
                  Tienes cambios sin guardar en este rol.
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" />
                  Todos los cambios están sincronizados.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (isDirty && !window.confirm("¿Deseas descartar los cambios sin guardar?")) {
                    return;
                  }
                  setEditingRole(null);
                }}
                className="rounded-xl text-xs h-9"
              >
                Cancelar
              </Button>

              {editingRole?.role !== "superadmin" && (
                <Button
                  onClick={savePermissions}
                  disabled={saving || !isDirty}
                  className="rounded-xl text-xs font-semibold h-9 min-w-[150px] gap-2 shadow-xs"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar cambios</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
