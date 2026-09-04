// Schema/contract de las 26 columnas del Excel maestro y respuesta v2 de total-analyzer.

export type ColumnCategory = "id_meta" | "metric_quant" | "categorical" | "raw_text" | "ai_preprocessed";
export type ColumnDtype = "string" | "number" | "category" | "text-long";

export type MasterColumnSpec = {
  /** Nombre exacto del header en el Excel maestro (case-sensitive, con tildes). */
  name: string;
  category: ColumnCategory;
  dtype: ColumnDtype;
  /** Si es crítica para el análisis (sin ella se bloquea generación en modo upload). */
  critical: boolean;
  /** Cómo se usa en el informe ejecutivo. */
  description: string;
};

export const MASTER_COLUMNS: MasterColumnSpec[] = [
  // Identificadores y metadatos (6)
  { name: "canal", category: "id_meta", dtype: "category", critical: true, description: "Llamada o WhatsApp. Base del análisis multicanal." },
  { name: "archivo", category: "id_meta", dtype: "string", critical: false, description: "Identificador único del registro." },
  { name: "fecha", category: "id_meta", dtype: "string", critical: true, description: "Fecha de la interacción. Define el periodo del informe." },
  { name: "ext_fecha", category: "id_meta", dtype: "string", critical: false, description: "Fecha extraída de fuentes externas (calendarios)." },
  { name: "ext_Nombre Asesor", category: "id_meta", dtype: "category", critical: true, description: "Asesor a cargo. Análisis de carga, dispersión y desempeño." },
  { name: "ext_Nombre Campaña", category: "id_meta", dtype: "category", critical: false, description: "Campaña/cliente. Cruce con sentimiento y score." },

  // Métricas cuantitativas (6)
  { name: "duracion_segundos", category: "metric_quant", dtype: "number", critical: false, description: "Duración en segundos (llamadas)." },
  { name: "duracion_Minutos", category: "metric_quant", dtype: "number", critical: false, description: "Duración en minutos. Estadísticas y outliers." },
  { name: "duracion_Horas", category: "metric_quant", dtype: "number", critical: false, description: "Duración en horas (acumulados)." },
  { name: "mensajes", category: "metric_quant", dtype: "number", critical: false, description: "Cantidad de mensajes (WhatsApp)." },
  { name: "score_0_1", category: "metric_quant", dtype: "number", critical: false, description: "Score normalizado 0-1." },
  { name: "score_pct", category: "metric_quant", dtype: "number", critical: false, description: "Score en porcentaje. Calidad de la interacción." },

  // Categóricas (3)
  { name: "sentimiento", category: "categorical", dtype: "category", critical: true, description: "Positivo / negativo / neutral. Eje principal del análisis emocional." },
  { name: "Atribución responsabilidad", category: "categorical", dtype: "category", critical: false, description: "A quién se atribuye la responsabilidad del resultado (Cliente | Asesor | No aplica)." },
  { name: "Motivo principal", category: "categorical", dtype: "category", critical: true, description: "Razón principal del contacto. Segmentación operativa." },

  // Contenido crudo (1)
  { name: "conversación", category: "raw_text", dtype: "text-long", critical: true, description: "Transcripción completa. Fuente de citas textuales y patrones." },

  // Análisis pre-procesado por LLM upstream (8)
  { name: "resumen de la llamada y/o de la conversacion", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Resumen ejecutivo generado por IA en la fase upstream." },
  { name: "Análisis según Prompt", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Análisis aplicando el prompt activo del cliente." },
  { name: "Puntos Positivos", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Fortalezas detectadas por interacción. Mina de oro para el informe." },
  { name: "Puntos Negativos", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Debilidades por interacción. Insumo de oportunidades." },
  { name: "Oportunidades", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Oportunidades específicas detectadas por la IA." },
  { name: "Insights", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Hallazgos accionables por interacción." },
  { name: "Conclusiones", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Cierre interpretativo por interacción." },
  { name: "Recomendaciones", category: "ai_preprocessed", dtype: "text-long", critical: false, description: "Recomendaciones específicas por interacción." },
];

export const MASTER_COLUMN_NAMES = MASTER_COLUMNS.map((c) => c.name);
export const CRITICAL_COLUMN_NAMES = MASTER_COLUMNS.filter((c) => c.critical).map((c) => c.name);
export const OPTIONAL_COLUMN_NAMES = MASTER_COLUMNS.filter((c) => !c.critical).map((c) => c.name);

export const COLUMN_CATEGORY_LABEL: Record<ColumnCategory, string> = {
  id_meta: "Identificadores y metadatos",
  metric_quant: "Métricas cuantitativas",
  categorical: "Categóricas",
  raw_text: "Contenido crudo",
  ai_preprocessed: "Análisis pre-procesado por IA",
};

// ---------------------------------------------------------------------------
// Validación de schema
// ---------------------------------------------------------------------------

export type SchemaValidationResult = {
  ok: boolean;
  missingCritical: string[];
  missingOptional: string[];
  extra: string[];
  present: string[];
};

export function validateSchema(headers: string[]): SchemaValidationResult {
  const set = new Set(headers.map((h) => h.trim()));
  const missingCritical = CRITICAL_COLUMN_NAMES.filter((c) => !set.has(c));
  const missingOptional = OPTIONAL_COLUMN_NAMES.filter((c) => !set.has(c));
  const present = MASTER_COLUMN_NAMES.filter((c) => set.has(c));
  const extra = headers.filter((h) => !MASTER_COLUMN_NAMES.includes(h));
  return {
    ok: missingCritical.length === 0,
    missingCritical,
    missingOptional,
    extra,
    present,
  };
}

// ---------------------------------------------------------------------------
// Tipos de la respuesta v2 de total-analyzer
// ---------------------------------------------------------------------------

export type AnalyzerSourceMeta = {
  mode: "master" | "upload";
  activeFilters?: Record<string, unknown>;
  totalRowsBeforeFilter?: number;
  fileName?: string;
  fileSize?: number;
};

export type AnalyzerStats = {
  total: number;
  by_canal: { label: string; count: number; pct: number }[];
  by_sentimiento: { label: string; count: number; pct: number }[];
  by_promesa_pago: { label: string; count: number; pct: number }[];
  by_motivo_principal: { label: string; count: number; pct: number }[];
  by_atribucion_responsabilidad: { label: string; count: number; pct: number }[];
  by_estado_pago: { label: string; count: number; pct: number }[];
  by_asesor: { label: string; count: number; pct: number }[];
  by_campania: { label: string; count: number; pct: number }[];
  canal_x_sentimiento: Record<string, Record<string, number>>;
  canal_x_promesa: Record<string, Record<string, number>>;
  duracion_min_global: { n: number; sum: number; mean: number; median: number; min: number; max: number } | null;
  duracion_min_por_canal: Record<string, { n: number; sum: number; mean: number; median: number; min: number; max: number } | null>;
  mensajes_por_canal: Record<string, { n: number; sum: number; mean: number; median: number; min: number; max: number } | null>;
  score_global: { n: number; sum: number; mean: number; median: number; min: number; max: number } | null;
  nulls: Record<string, number>;
  concentracion_top3_asesores_pct: number;
};

export type AnalyzerHeadlineStat = { value: string; label: string };
export type AnalyzerKeyMetric = { value: string; label: string; context?: string };
export type AnalyzerPositivePoint = { title: string; detail: string };
export type AnalyzerOpportunity = {
  priority: "CRÍTICO" | "ALTO" | "MEDIO";
  title: string;
  detail: string;
  evidence?: string;
};
export type AnalyzerCase = { tag: string; title: string; body: string; lesson?: string };
export type AnalyzerRecommendation = {
  title: string;
  detail: string;
  impact: "Alto" | "Medio" | "Bajo";
  effort: "Alto" | "Medio" | "Bajo";
};
export type AnalyzerRoadmapPhase = {
  phase: "0-30 días" | "30-60 días" | "60-90 días" | string;
  focus: string;
  items: string[];
};

export type AnalyzerAnalysis = {
  executive_summary: { narrative: string; headline_stats: AnalyzerHeadlineStat[] };
  key_metrics: AnalyzerKeyMetric[];
  channel_analysis: { insight: string; breakdown?: Record<string, unknown> };
  critical_finding: { title: string; statistic: string; detail: string };
  advisor_analysis: { top_load_pct: string; observations: string[] };
  positive_points: AnalyzerPositivePoint[];
  improvement_opportunities: AnalyzerOpportunity[];
  highlighted_cases: AnalyzerCase[];
  recommendations: AnalyzerRecommendation[];
  roadmap_90_days: AnalyzerRoadmapPhase[];
};

export type TotalAnalyzerV2Response = {
  meta: {
    accountId?: string;
    dateRange?: string;
    rowsAnalyzed: number;
    generatedAt: string;
    source: AnalyzerSourceMeta;
  };
  stats: AnalyzerStats;
  analysis: AnalyzerAnalysis;
};

/** Persistencia v3: la respuesta cruda del analyzer va a `presentations.slides_data`. */
export type ReportV3Payload = {
  schemaVersion: 3;
  data: TotalAnalyzerV2Response;
};

export function isReportV3(d: unknown): d is ReportV3Payload {
  return (
    typeof d === "object" &&
    d !== null &&
    !Array.isArray(d) &&
    (d as ReportV3Payload).schemaVersion === 3 &&
    typeof (d as ReportV3Payload).data === "object"
  );
}
