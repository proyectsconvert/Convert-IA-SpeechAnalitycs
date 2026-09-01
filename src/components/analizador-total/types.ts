export type DateRangePreset = "today" | "7d" | "15d" | "30d" | "this_month" | "last_month" | "custom";

export type UnifiedChannel = "call" | "whatsapp";

/** Fila unificada voz + WhatsApp; campos dinámicos `ext_*` vienen de extracciones. */
export interface AnalizadorUnifiedRow {
  channel: UnifiedChannel;
  id: string | number;
  file_name: string;
  created_at: Date | string;
  duration: number;
  status: string;
  sentiment: string;
  score: number;
  summary: string;
  results: Record<string, unknown>;
  tags: string[];
  agent: string;
  campaign?: string;
  waConversationId?: string;
  total_messages?: number;
  __conversation?: string;
  atribucion_responsabilidad?: string;
  motivo_principal?: string;
  promesa_de_pago?: string;
  estado_pago_detalle?: string;
}

export type ChartNamedValue = { name: string; value: number };

/**
 * Filtros multi-selección. Array vacío = "Todos".
 * scoreRange / durationRange son rangos exclusivos (single).
 */
export interface AnalizadorFilters {
  sentiment: string[];
  agent: string[];
  campaign: string[];
  scoreRange: "all" | "low" | "mid" | "high";
  durationRange: "all" | "short" | "medium" | "long";
}

export const emptyAnalizadorFilters = (): AnalizadorFilters => ({
  sentiment: [],
  agent: [],
  campaign: [],
  scoreRange: "all",
  durationRange: "all",
});
