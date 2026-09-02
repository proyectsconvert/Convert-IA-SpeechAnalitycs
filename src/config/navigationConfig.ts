import {
  Home,
  Mic,
  FileAudio,
  MessageCircle,
  BarChart3,
  LineChart,
  Sparkles,
  Tags,
  BookOpen,
  Settings,
  Cable,
  AudioLines,
  ShieldCheck,
  Shield,
  Building2,
  Users,
  CreditCard,
  Gauge,
  ClipboardList,
  HelpCircle,
  Plus,
  LucideIcon,
} from "lucide-react";

export type NavPermission = {
  module: string;
  action: string;
};

export interface NavChildItem {
  id: string;
  title: string;
  description?: string;
  url: string;
  icon: LucideIcon;
  perm: NavPermission;
  isAction?: boolean;
  actionType?: "upload" | "custom";
}

export interface DockGroupItem {
  id: string;
  title: string;
  shortTitle?: string;
  icon: LucideIcon;
  url?: string;
  perm?: NavPermission;
  children?: NavChildItem[];
  exact?: boolean;
  action?: {
    type: "upload" | "custom";
    label: string;
    icon: LucideIcon;
  };
}

/**
 * Configuración única y centralizada de la navegación de Convert-IA.
 * Define los 8 grupos principales del Dock y todos sus submódulos con permisos y rutas reales.
 */
export const NAVIGATION_CONFIG: DockGroupItem[] = [
  // 1. INICIO
  {
    id: "home",
    title: "Inicio",
    icon: Home,
    url: "/",
    exact: true,
    perm: { module: "dashboard", action: "view" },
  },

  // 2. GRABACIONES
  {
    id: "recordings",
    title: "Grabaciones",
    icon: FileAudio,
    url: "/biblioteca",
    perm: { module: "library", action: "view" },
  },

  // 3. CONVERSACIONES
  {
    id: "conversations",
    title: "Conversaciones",
    icon: MessageCircle,
    url: "/analytics-whatsapp",
    perm: { module: "whatsapp", action: "view" },
  },

  // 4. TRANSCRIPCIONES
  {
    id: "transcriptions",
    title: "Transcripciones",
    icon: Mic,
    url: "/transcripciones",
    perm: { module: "transcriptions", action: "view" },
  },

  // 5. ANALÍTICA
  {
    id: "analytics",
    title: "Analítica",
    icon: BarChart3,
    children: [
      {
        id: "analytics-unified",
        title: "Analítica",
        description: "Analítica unificada y explorador multicriterio",
        url: "/analizador-total",
        icon: BarChart3,
        perm: { module: "analytics", action: "view" },
      },
      {
        id: "analytics-indicators",
        title: "Indicadores",
        description: "Métricas e indicadores estratégicos de operación",
        url: "/analiticas",
        icon: LineChart,
        perm: { module: "reports", action: "view" },
      },
    ],
  },

  // 6. INTELIGENCIA IA
  {
    id: "intelligence",
    title: "Inteligencia IA",
    shortTitle: "Inteligencia IA",
    icon: Sparkles,
    children: [
      {
        id: "ai-copilot",
        title: "Copiloto IA",
        description: "Consultas conversacionales y análisis global con IA",
        url: "/consulta-ia",
        icon: Sparkles,
        perm: { module: "chat_ai", action: "view" },
      },
      {
        id: "ai-rules",
        title: "Reglas de Extracción",
        description: "Extracción automática de datos estructurados",
        url: "/extracciones",
        icon: Tags,
        perm: { module: "analytics", action: "view" },
      },
      {
        id: "ai-prompts",
        title: "Prompts",
        description: "Catálogo de prompts personalizados por macroproceso",
        url: "/prompts",
        icon: BookOpen,
        perm: { module: "prompts", action: "view" },
      },
    ],
  },

  // 7. CONFIGURACIÓN
  {
    id: "settings",
    title: "Configuración",
    icon: Settings,
    children: [
      {
        id: "settings-integrations",
        title: "Integraciones",
        description: "Conexiones SFTP, API y almacenamiento",
        url: "/conexion",
        icon: Cable,
        perm: { module: "connections", action: "view" },
      },
      {
        id: "settings-models",
        title: "Modelos de Transcripción",
        description: "Motores de transcripción y parámetros acústicos",
        url: "/modelos-transcripcion",
        icon: AudioLines,
        perm: { module: "transcription_models", action: "view" },
      },
      {
        id: "settings-evaluation",
        title: "Evaluación de Modelos",
        description: "Validación y benchmarking WER/CER de modelos",
        url: "/validacion-modelos",
        icon: ShieldCheck,
        perm: { module: "transcription_models", action: "view" },
      },
    ],
  },

  // 8. ADMINISTRACIÓN
  {
    id: "administration",
    title: "Administración",
    icon: Shield,
    children: [
      {
        id: "admin-accounts",
        title: "Cuentas",
        description: "Gestión de organizaciones y tenants",
        url: "/cuentas",
        icon: Building2,
        perm: { module: "accounts", action: "view" },
      },
      {
        id: "admin-users",
        title: "Usuarios",
        description: "Miembros del equipo y accesos",
        url: "/usuarios",
        icon: Users,
        perm: { module: "users", action: "view" },
      },
      {
        id: "admin-roles",
        title: "Roles y Permisos",
        description: "Matriz de privilegios por módulo y acción",
        url: "/roles",
        icon: Shield,
        perm: { module: "roles", action: "view" },
      },
      {
        id: "admin-limits",
        title: "Uso y Límites",
        description: "Cuotas de procesamiento y consumo",
        url: "/limites",
        icon: Gauge,
        perm: { module: "billing", action: "view" },
      },
      {
        id: "admin-billing",
        title: "Facturación",
        description: "Planes, facturas y suscripción",
        url: "/facturacion",
        icon: CreditCard,
        perm: { module: "billing", action: "view" },
      },
      {
        id: "admin-audit",
        title: "Auditoría",
        description: "Registro de actividad y seguridad",
        url: "/auditoria",
        icon: ClipboardList,
        perm: { module: "audit", action: "view" },
      },
      {
        id: "admin-support",
        title: "Soporte",
        description: "Centro de ayuda y tickets de asistencia",
        url: "/soporte",
        icon: HelpCircle,
        perm: { module: "soporte", action: "view" },
      },
    ],
  },
];
