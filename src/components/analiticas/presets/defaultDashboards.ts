export type WidgetType =
  | "kpi-summary"
  | "channel-trend"
  | "sentiment-pie"
  | "hourly-heatmap"
  | "sales-funnel"
  | "objections-breakdown"
  | "agent-ranking"
  | "duration-buckets"
  | "wa-speed-buckets"
  | "csat-timeline"
  | "top-tags"
  | "operational-insights"
  | "custom-chart";

export interface CustomChartConfig {
  chartType: "bar" | "line" | "pie" | "kpi";
  metric: "volume" | "score" | "duration" | "conversion";
  dimension: "channel" | "sentiment" | "agent" | "day";
  title?: string;
  color?: string;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  title: string;
  subtitle?: string;
  colSpan?: 1 | 2 | 3; // 1 = 1-column, 2 = 2-columns (wide), 3 = 3-columns (full)
  customConfig?: CustomChartConfig;
}

export interface DashboardPreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  iconName: "LayoutDashboard" | "TrendingUp" | "Award" | "Clock" | "Phone" | "MessageSquare" | "Sparkles";
  badge?: string;
  defaultWidgets: WidgetInstance[];
}

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  // 1. Resumen Ejecutivo
  {
    id: "executive",
    name: "Resumen Ejecutivo",
    shortName: "Resumen",
    description: "Visión global consolidada de operaciones, volumen y sentimiento",
    iconName: "LayoutDashboard",
    badge: "Principal",
    defaultWidgets: [
      { id: "exec-kpi", type: "kpi-summary", title: "Métricas Clave de Operación", colSpan: 3 },
      { id: "exec-insights", type: "operational-insights", title: "Insights Operacionales con IA", colSpan: 3 },
      { id: "exec-trend", type: "channel-trend", title: "Tendencia Diaria por Canal", colSpan: 2 },
      { id: "exec-sentiment", type: "sentiment-pie", title: "Distribución de Sentimiento", colSpan: 1 },
      { id: "exec-hourly", type: "hourly-heatmap", title: "Picos de Tráfico por Hora del Día", colSpan: 2 },
      { id: "exec-tags", type: "top-tags", title: "Temas y Tags Más Frecuentes", colSpan: 1 },
    ],
  },

  // 2. Ventas y Conversión
  {
    id: "sales",
    name: "Ventas y Conversión",
    shortName: "Ventas",
    description: "Embudo de conversión comercial, objeciones y efectividad de cierres",
    iconName: "TrendingUp",
    badge: "Comercial",
    defaultWidgets: [
      { id: "sales-funnel", type: "sales-funnel", title: "Embudo de Conversión de Interacciones", colSpan: 2 },
      { id: "sales-objections", type: "objections-breakdown", title: "Objeciones Comerciales Detectadas", colSpan: 1 },
      { id: "sales-ranking", type: "agent-ranking", title: "Ranking de Asesores por Desempeño", colSpan: 2 },
      { id: "sales-trend", type: "channel-trend", title: "Evolución Temporal de Contactos", colSpan: 1 },
    ],
  },

  // 3. Calidad y Satisfacción
  {
    id: "quality",
    name: "Calidad y Satisfacción",
    shortName: "Calidad",
    description: "Pulso de CSAT, NPS, evolución de sentimiento y alertas de fricción",
    iconName: "Award",
    badge: "Auditoría",
    defaultWidgets: [
      { id: "qual-csat", type: "csat-timeline", title: "Evolución Temporal del Sentimiento y Score", colSpan: 2 },
      { id: "qual-sentiment", type: "sentiment-pie", title: "Distribución de Sentimiento de Clientes", colSpan: 1 },
      { id: "qual-ranking", type: "agent-ranking", title: "Score y Calidad por Asesor", colSpan: 2 },
      { id: "qual-tags", type: "top-tags", title: "Motivos Críticos de Contacto", colSpan: 1 },
    ],
  },

  // 4. Eficiencia y SLA
  {
    id: "efficiency",
    name: "Eficiencia y SLA Operativo",
    shortName: "Eficiencia",
    description: "Tiempos medios de atención (AHT), mapas de tráfico y velocidad",
    iconName: "Clock",
    badge: "Operaciones",
    defaultWidgets: [
      { id: "eff-hourly", type: "hourly-heatmap", title: "Distribución de Tráfico y Picos de Carga", colSpan: 2 },
      { id: "eff-duration", type: "duration-buckets", title: "Duración de Llamadas (AHT)", colSpan: 1 },
      { id: "eff-wa-speed", type: "wa-speed-buckets", title: "Longitud de Conversaciones WhatsApp", colSpan: 1 },
      { id: "eff-ranking", type: "agent-ranking", title: "Tiempos y Volumen por Asesor", colSpan: 2 },
    ],
  },

  // 5. Llamadas (Voz)
  {
    id: "calls",
    name: "Llamadas de Audio",
    shortName: "Llamadas",
    description: "Análisis especializado del canal telefónico, duración y sentimiento de voz",
    iconName: "Phone",
    defaultWidgets: [
      { id: "calls-kpi", type: "kpi-summary", title: "Métricas Telefónicas", colSpan: 3 },
      { id: "calls-duration", type: "duration-buckets", title: "Volumen por Duración de Llamada", colSpan: 2 },
      { id: "calls-sentiment", type: "sentiment-pie", title: "Sentimiento en Llamadas", colSpan: 1 },
      { id: "calls-ranking", type: "agent-ranking", title: "Desempeño de Agentes en Llamadas", colSpan: 2 },
      { id: "calls-tags", type: "top-tags", title: "Tags Destacados en Llamadas", colSpan: 1 },
    ],
  },

  // 6. WhatsApp
  {
    id: "whatsapp",
    name: "Conversaciones WhatsApp",
    shortName: "WhatsApp",
    description: "Análisis del canal de mensajería, volumen de mensajes y satisfacción digital",
    iconName: "MessageSquare",
    defaultWidgets: [
      { id: "wa-kpi", type: "kpi-summary", title: "Métricas de WhatsApp", colSpan: 3 },
      { id: "wa-speed", type: "wa-speed-buckets", title: "Volumen por Cantidad de Mensajes", colSpan: 2 },
      { id: "wa-sentiment", type: "sentiment-pie", title: "Sentimiento en WhatsApp", colSpan: 1 },
      { id: "wa-ranking", type: "agent-ranking", title: "Desempeño de Asesores WhatsApp", colSpan: 2 },
      { id: "wa-tags", type: "top-tags", title: "Tags Destacados en WhatsApp", colSpan: 1 },
    ],
  },

  // 7. Mi Tablero Personalizado
  {
    id: "custom",
    name: "Mi Tablero Personalizado",
    shortName: "Personalizado",
    description: "Espacio a medida para crear, ordenar y personalizar tus propios gráficos",
    iconName: "Sparkles",
    badge: "Editable",
    defaultWidgets: [
      { id: "custom-kpi", type: "kpi-summary", title: "Resumen Clave", colSpan: 3 },
      { id: "custom-trend", type: "channel-trend", title: "Evolución Temporal", colSpan: 2 },
      { id: "custom-sentiment", type: "sentiment-pie", title: "Sentimiento", colSpan: 1 },
      { id: "custom-ranking", type: "agent-ranking", title: "Ranking de Asesores", colSpan: 2 },
      { id: "custom-funnel", type: "sales-funnel", title: "Embudo de Conversión", colSpan: 1 },
    ],
  },
];

export const AVAILABLE_WIDGET_CATALOG: Array<{
  type: WidgetType;
  title: string;
  category: "General" | "Ventas" | "Calidad" | "Eficiencia" | "Canales";
  description: string;
  defaultColSpan: 1 | 2 | 3;
}> = [
  { type: "kpi-summary", title: "Tarjetas de KPIs Consolidados", category: "General", description: "Métricas globales de volumen, llamadas, WhatsApp, score y errores", defaultColSpan: 3 },
  { type: "operational-insights", title: "Insights Operacionales con IA", category: "General", description: "Conclusiones y hallazgos clave generados automáticamente", defaultColSpan: 3 },
  { type: "channel-trend", title: "Tendencia Temporal por Canal", category: "Canales", description: "Gráfico de área con evolución de llamadas y WhatsApp por fecha", defaultColSpan: 2 },
  { type: "sentiment-pie", title: "Distribución de Sentimiento", category: "Calidad", description: "Donut chart con desglose positivo, neutral, negativo y mixto", defaultColSpan: 1 },
  { type: "hourly-heatmap", title: "Picos de Tráfico Horario", category: "Eficiencia", description: "Gráfico de barras de 00:00 a 23:00 con horarios de mayor flujo", defaultColSpan: 2 },
  { type: "sales-funnel", title: "Embudo de Conversión Comercial", category: "Ventas", description: "Pasos de contacto efectivo, interés, propuesta y cierre", defaultColSpan: 2 },
  { type: "objections-breakdown", title: "Objeciones Comerciales Frecuentes", category: "Ventas", description: "Ranking de principales frenos y objeciones de clientes", defaultColSpan: 1 },
  { type: "agent-ranking", title: "Ranking y Desempeño por Asesor", category: "Eficiencia", description: "Tabla con volumen, score promedio, % positivo y duración", defaultColSpan: 2 },
  { type: "duration-buckets", title: "Distribución de Duración (AHT)", category: "Eficiencia", description: "Cubetas de tiempo de llamada (<1m, 1-3m, 3-5m, etc.)", defaultColSpan: 1 },
  { type: "wa-speed-buckets", title: "Longitud de Chats WhatsApp", category: "Canales", description: "Volumen según número de mensajes intercambiados", defaultColSpan: 1 },
  { type: "csat-timeline", title: "Evolución de CSAT y Score Temporal", category: "Calidad", description: "Línea de tendencia del score de calidad promedio en el tiempo", defaultColSpan: 2 },
  { type: "top-tags", title: "Nube / Ranking de Tags y Temas", category: "General", description: "Temas y palabras clave más recurrentes en interacciones", defaultColSpan: 1 },
];
