/**
 * Límites de caracteres (espacios incluidos) para textos de análisis mostrados
 * en Transcripciones y WhatsApp. Listas: máximo por ítem.
 */
/** Objetivo de brevedad para la IA (resumir al máximo posible). El tope duro es `analysisPrompt`. */
export const ANALYSIS_PROMPT_TARGET_CHARS = 600;

export const ANALYSIS_FIELD_LIMITS = {
  /** Tope duro al guardar / mostrar “Análisis según Prompt” (el front muestra todo hasta este límite). */
  analysisPrompt: 2000,
  positiveItem: 360,
  negativeItem: 420,
  opportunityItem: 420,
  insights: 1200,
  conclusions: 1200,
  recommendations: 1200,
} as const;

/** Cadena truncada a como máximo `max` caracteres (incluye el sufijo de elipsis si aplica). */
export function truncateToMaxChars(value: string, max: number): string {
  const s = value ?? "";
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

export function truncateStringArray(items: string[], perItemMax: number): string[] {
  return items.map((x) => truncateToMaxChars(String(x), perItemMax));
}

/** Aplica límites al objeto `results` usado en insights (llamadas y WA normalizado). */
export function applyLimitsToAnalysisResults(results: Record<string, unknown>): Record<string, unknown> {
  const r = { ...results };
  if (typeof r.analysis === "string") {
    r.analysis = truncateToMaxChars(r.analysis, ANALYSIS_FIELD_LIMITS.analysisPrompt);
  }
  if (typeof r.insights === "string") {
    r.insights = truncateToMaxChars(r.insights, ANALYSIS_FIELD_LIMITS.insights);
  }
  if (typeof r.conclusions === "string") {
    r.conclusions = truncateToMaxChars(r.conclusions, ANALYSIS_FIELD_LIMITS.conclusions);
  }
  if (typeof r.recommendations === "string") {
    r.recommendations = truncateToMaxChars(r.recommendations, ANALYSIS_FIELD_LIMITS.recommendations);
  }
  if (Array.isArray(r.positive)) {
    r.positive = truncateStringArray(r.positive as string[], ANALYSIS_FIELD_LIMITS.positiveItem);
  }
  if (Array.isArray(r.negative)) {
    r.negative = truncateStringArray(r.negative as string[], ANALYSIS_FIELD_LIMITS.negativeItem);
  }
  if (Array.isArray(r.opportunities)) {
    r.opportunities = truncateStringArray(r.opportunities as string[], ANALYSIS_FIELD_LIMITS.opportunityItem);
  }
  return r;
}
