import { applyLimitsToAnalysisResults } from "./analysisFieldLimits";

/**
 * Convierte filas de `whatsapp_analysis_results` al mismo shape que espera
 * `TranscriptInsightsColumn` (alineado con `analyses` + `results` de voz).
 * Compatibilidad con datos antiguos solo con campos tipo resumen/motivo/hallazgos.
 */

function inferOverallSentiment(raw: Record<string, unknown>): "positive" | "negative" | "neutral" {
  const o = String(raw.overall_sentiment || "").toLowerCase();
  if (o === "positive" || o === "negative" || o === "neutral") return o;
  const s = String(raw.sentimiento_cliente || raw.sentiment || "").toLowerCase();
  if (s.includes("posit") || s === "positivo") return "positive";
  if (s.includes("negat") || s === "negativo") return "negative";
  return "neutral";
}

function qualityScoreFromRow(
  scoreGeneral: number | null | undefined,
  raw: Record<string, unknown>,
): number | null {
  const rawScore = raw.score != null ? Number(raw.score) : NaN;
  if (!Number.isNaN(rawScore) && rawScore >= 0) {
    return rawScore <= 1.5 ? Math.round(rawScore * 100) : Math.round(rawScore);
  }
  const sg = scoreGeneral != null ? Number(scoreGeneral) : NaN;
  if (Number.isNaN(sg)) return null;
  return sg <= 1.5 ? Math.round(sg * 100) : Math.round(sg);
}

export function normalizeWhatsappAnalysisForInsights(
  analysisResult: {
    score_general?: number | null;
    prompt_name?: string | null;
    results?: Record<string, unknown> | null;
  } | null,
  fallbackPromptName?: string | null,
): {
  analysis: Record<string, unknown> | null;
  results: Record<string, unknown>;
} {
  if (!analysisResult) {
    return { analysis: null, results: {} };
  }

  const raw: Record<string, unknown> = {
    ...(analysisResult.results || {}),
  };

  const summaryText = String(raw.summary || raw.resumen || "").trim();
  const sentiment = inferOverallSentiment(raw);
  const scoreDisplay = qualityScoreFromRow(
    analysisResult.score_general != null ? Number(analysisResult.score_general) : null,
    raw,
  );

  const analysis: Record<string, unknown> = {
    summary: summaryText,
    overall_sentiment: sentiment,
    prompts: {
      name: analysisResult.prompt_name || fallbackPromptName || "Predeterminado",
    },
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };

  let positive = Array.isArray(raw.positive) ? ([...raw.positive] as string[]) : [];
  let negative = Array.isArray(raw.negative) ? ([...raw.negative] as string[]) : [];
  if (!positive.length && typeof raw.feedback_agente === "string" && raw.feedback_agente.trim()) {
    positive = [raw.feedback_agente.trim()];
  }
  if (!negative.length && Array.isArray(raw.hallazgos_criticos) && raw.hallazgos_criticos.length) {
    negative = [...(raw.hallazgos_criticos as string[])];
  }

  let opportunities = Array.isArray(raw.opportunities) ? ([...raw.opportunities] as string[]) : [];

  let insights = String(raw.insights || "").trim();
  let recommendations = String(raw.recommendations || "").trim();
  let conclusions = String(raw.conclusions || "").trim();

  if (!recommendations && Array.isArray(raw.next_steps) && raw.next_steps.length) {
    recommendations = (raw.next_steps as string[]).join("\n");
  }
  if (!insights && raw.sentimiento_evolucion) {
    insights = `Evolución del sentimiento: ${String(raw.sentimiento_evolucion)}`;
  }

  let analysisPromptText = String(raw.analysis || raw.analysis_prompt_aligned || "").trim();
  if (!analysisPromptText) {
    const parts = [raw.motivo_contacto, raw.submotivo, raw.intencion_compra].filter(Boolean);
    if (parts.length) {
      analysisPromptText = parts.map(String).join("\n\n");
    }
  }

  const entities = Array.isArray(raw.entities) ? ([...raw.entities] as string[]) : [];

  const results: Record<string, unknown> = applyLimitsToAnalysisResults({
    score: scoreDisplay,
    analysis: analysisPromptText,
    positive,
    negative,
    opportunities,
    insights,
    conclusions,
    recommendations,
    entities,
  });

  return { analysis, results };
}
