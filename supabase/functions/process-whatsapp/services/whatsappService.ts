import { createChatCompletion } from "../utils/openai.ts";

const MAX_TRANSCRIPT_CHARS = 80_000; // ~20k tokens aprox, seguro para gpt-4o-mini

/**
 * Normaliza la conversación de WhatsApp para el LLM.
 * Sanitiza contenido y trunca si excede el límite.
 */
export function normalizeWhatsAppTranscript(conversation: any, messages: any[]): string {
  if (!messages || messages.length === 0) {
    return "[Sin mensajes en esta conversación]";
  }

  const lines = messages.map((msg) => {
    const date = new Date(msg.timestamp);
    const time = date.toLocaleTimeString("es-MX", { hour12: false });
    const dateStr = date.toLocaleDateString("es-MX");

    let role = "[AGENTE]";
    if (msg.sender_type === "Contacto") {
      role = "[CLIENTE]";
    } else if (msg.sender_type === "Bot") {
      role = "[BOT]";
    }

    const sender =
      msg.agent_name && msg.sender_type === "Agente" ? ` (${msg.agent_name})` : "";

    let content = msg.content || "";
    if (msg.message_type === "Audio") {
      content = `[Audio transcrito]: ${content || "Contenido no disponible"}`;
    } else if (msg.message_type === "Imagen") {
      content = "[Imagen]";
    } else if (msg.message_type === "Documento") {
      content = `[Documento: ${content || "archivo"}]`;
    }

    // Sanitizar contenido individual
    content = content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/\uFFFD/g, "")
      .replace(/\uFEFF/g, "");

    return `[${dateStr} ${time}] ${role}${sender}: ${content}`;
  });

  let transcript = lines.join("\n");

  // Truncar si es demasiado largo, conservando inicio y final
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const halfLimit = Math.floor(MAX_TRANSCRIPT_CHARS / 2) - 100;
    transcript =
      transcript.substring(0, halfLimit) +
      "\n\n[... CONVERSACIÓN TRUNCADA POR EXTENSIÓN ...]\n\n" +
      transcript.substring(transcript.length - halfLimit);
  }

  return transcript;
}

/** Mismos límites que `analysisFieldLimits` en el frontend / feedback de llamadas. */
const WA_TEXT_LIMIT = {
  analysis: 2000,
  positiveItem: 360,
  negativeItem: 420,
  opportunityItem: 420,
  insights: 1200,
  conclusions: 1200,
  recommendations: 1200,
};

function waTrunc(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

function waTruncArr(arr: string[], max: number): string[] {
  return arr.map((x) => waTrunc(String(x), max));
}

const WA_RISK_SIGNAL_RX = /\b(cancel(ar|ación|acion|e|en|ado|ada)?|termin(ar|ación|acion|e|en)?|baja|no\s+pagar[eé]?|no\s+voy\s+a\s+pagar|no\s+pagar[ée]|pagar[eé].{0,80}(cancel|termin)|incumpl|sin\s+servicio|no\s+recib|molest|queja|reclamo)\b/i;

function rebalanceWhatsAppRisk(r: Record<string, any>, transcript: string): Record<string, any> {
  const moved: string[] = [];
  const positive = (Array.isArray(r.positive) ? r.positive : []).filter((item: string) => {
    if (WA_RISK_SIGNAL_RX.test(String(item))) {
      moved.push(String(item));
      return false;
    }
    return true;
  });
  const negative = [...(Array.isArray(r.negative) ? r.negative : []), ...moved.map((item) => `Riesgo de cancelación o pérdida: ${item}`)];
  const hasRiskSignal = WA_RISK_SIGNAL_RX.test(transcript);
  if (hasRiskSignal && !negative.some((item) => WA_RISK_SIGNAL_RX.test(String(item)))) {
    negative.push("El cliente expresa intención de cancelar, terminar la relación o no continuar; esto es un punto negativo aunque exista promesa de pago.");
  }
  const opportunities = Array.isArray(r.opportunities) ? [...r.opportunities] : [];
  if (hasRiskSignal && !opportunities.some((item) => /retenci[oó]n|cancel|seguimiento|resolver|evidencia|aclar/i.test(String(item)))) {
    opportunities.push("Activar una gestión de retención: aclarar el motivo de cancelación, validar cargos/servicio, documentar compromisos y ofrecer una alternativa antes del cierre.");
  }
  return {
    ...r,
    positive,
    negative,
    opportunities,
    overall_sentiment: hasRiskSignal ? "negative" : r.overall_sentiment,
    sentimiento_cliente: hasRiskSignal ? "negative" : r.sentimiento_cliente,
    score_general: hasRiskSignal ? Math.min(Number(r.score_general) || 0, 65) : r.score_general,
  };
}

/**
 * Alinea el JSON del modelo con el mismo contrato enriquecido que el análisis de voz
 * (Transcripts / `analyses.results`) para UI unificada.
 */
function enrichWhatsAppResult(result: Record<string, any>): Record<string, any> {
  const r = { ...result };
  if (r.summary == null && r.resumen != null) r.summary = String(r.resumen);
  if (r.resumen == null && r.summary != null) r.resumen = String(r.summary);
  if (!r.overall_sentiment && r.sentimiento_cliente) {
    const t = String(r.sentimiento_cliente).toLowerCase();
    if (t.includes("posit")) r.overall_sentiment = "positive";
    else if (t.includes("negat")) r.overall_sentiment = "negative";
    else r.overall_sentiment = "neutral";
  }
  if (!Array.isArray(r.positive)) r.positive = [];
  if (!Array.isArray(r.negative)) r.negative = [];
  if (!Array.isArray(r.opportunities)) r.opportunities = [];
  if (!Array.isArray(r.entities)) r.entities = [];
  if (!Array.isArray(r.hallazgos_criticos)) r.hallazgos_criticos = [];
  if (!Array.isArray(r.next_steps)) r.next_steps = [];
  if (!Array.isArray(r.tags)) r.tags = [];
  if (typeof r.insights !== "string") r.insights = r.insights != null ? String(r.insights) : "";
  if (typeof r.recommendations !== "string") {
    r.recommendations = r.recommendations != null ? String(r.recommendations) : "";
  }
  if (typeof r.conclusions !== "string") {
    r.conclusions = r.conclusions != null ? String(r.conclusions) : "";
  }
  if (typeof r.analysis !== "string") r.analysis = r.analysis != null ? String(r.analysis) : "";

  r.analysis = waTrunc(r.analysis, WA_TEXT_LIMIT.analysis);
  r.insights = waTrunc(r.insights, WA_TEXT_LIMIT.insights);
  r.conclusions = waTrunc(r.conclusions, WA_TEXT_LIMIT.conclusions);
  r.recommendations = waTrunc(r.recommendations, WA_TEXT_LIMIT.recommendations);
  r.positive = waTruncArr(r.positive, WA_TEXT_LIMIT.positiveItem);
  r.negative = waTruncArr(r.negative, WA_TEXT_LIMIT.negativeItem);
  r.opportunities = waTruncArr(r.opportunities, WA_TEXT_LIMIT.opportunityItem);
  if (Array.isArray(r.hallazgos_criticos)) {
    r.hallazgos_criticos = waTruncArr(r.hallazgos_criticos, WA_TEXT_LIMIT.negativeItem);
  }
  if (Array.isArray(r.next_steps)) {
    r.next_steps = waTruncArr(r.next_steps, WA_TEXT_LIMIT.recommendations);
  }
  if (typeof r.feedback_agente === "string") {
    r.feedback_agente = waTrunc(r.feedback_agente, WA_TEXT_LIMIT.recommendations);
  }

  return r;
}

/**
 * Genera el análisis de WhatsApp.
 * Incluye validación del JSON de respuesta.
 */
export async function analyzeWhatsAppConversation(
  transcript: string,
  prompt: any
): Promise<any> {
  const systemPrompt = `
Eres un analista experto en conversaciones de WhatsApp para contact centers.
A continuación recibirás una conversación de WhatsApp entre un cliente y un agente (y posiblemente un bot/asistente virtual).

Los participantes están identificados como:
- [CLIENTE]: El cliente que contacta o es contactado.
- [AGENTE]: El agente humano que gestiona la conversación.
- [BOT]: El asistente virtual o bot (si participó).

La conversación puede ser asíncrona (con pausas de minutos u horas entre mensajes).
Los timestamps de cada mensaje están incluidos.
Si hay notas de voz, están transcritas e indicadas como [Audio transcrito].
Si hay imágenes o documentos, están indicados como [Imagen] o [Documento].

Analiza esta conversación aplicando los siguientes criterios:

${prompt.system_instructions || "Evalúa la calidad general de atención."}

Reglas obligatorias para clasificar puntos positivos, negativos y oportunidades:
- "positive" solo debe contener hechos favorables para la atención, solución, continuidad o experiencia del cliente.
- "negative" debe incluir señales reales de riesgo: intención de cancelar, terminar contrato, no pagar, baja, abandono, molestia, incumplimiento, objeción fuerte, promesa de pago condicionada a cancelación o pérdida de venta.
- Si el cliente dice algo como "Pagaré los 250 y por favor que se cancele todo", clasifícalo como NEGATIVO, no positivo, porque el pago está asociado a cancelar/terminar la relación.
- "opportunities" debe proponer acciones concretas para corregir los negativos: retención, aclaración contractual, evidencia, seguimiento, escalamiento o solución.
- No copies frases sueltas sin contexto; explica por qué el hecho es positivo, negativo u oportunidad según el resultado para el negocio y el cliente.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks). Debe incluir:
1) Campos alineados al módulo de transcripciones/voz (misma semántica que el análisis por prompt en llamadas):
   - "summary": string (resumen ejecutivo; mismo contenido que "resumen" si prefieres duplicar),
   - "overall_sentiment": "positive" | "negative" | "neutral",
   - "analysis": string (análisis detallado según el prompt de análisis anterior),
   - "positive": string[], "negative": string[], "opportunities": string[],
   - "insights": string, "recommendations": string, "conclusions": string,
   - "entities": string[] (nombres de productos, montos citados, etc. si aplican).
2) Campos específicos de WhatsApp (mantener también):
{
  "score_general": number,
  "scores_detallados": object,
  "resumen": string,
  "summary": string,
  "overall_sentiment": "positive" | "negative" | "neutral",
  "analysis": string,
  "positive": string[],
  "negative": string[],
  "opportunities": string[],
  "insights": string,
  "recommendations": string,
  "conclusions": string,
  "entities": string[],
  "motivo_contacto": string,
  "submotivo": string,
  "sentimiento_cliente": string,
  "sentimiento_evolucion": string,
  "intencion_compra": string,
  "venta_concretada": boolean,
  "venta_perdida": boolean,
  "motivo_venta_perdida": string | null,
  "producto_servicio": string,
  "cumplimiento_protocolo": boolean,
  "hallazgos_criticos": string[],
  "next_steps": string[],
  "tags": string[],
  "feedback_agente": string
}
Todas las secciones deben estar alineadas con el PROMPT DE ANÁLISIS indicado arriba (instrucciones del usuario).

LÍMITES DE EXTENSIÓN (caracteres con espacios; sé breve y directo):
- "analysis": resume al máximo (~600 ideal); máximo absoluto 2000
- cada string en "positive": máximo 360; en "negative" y "opportunities": máximo 420 por ítem
- "insights", "conclusions", "recommendations": máximo 1200 cada uno. Deben ser textos completos de 2 a 4 frases, con contexto, consecuencia y siguiente acción cuando aplique. No cierres con puntos suspensivos ni dejes frases a medias.
  `.trim();

  const response = await createChatCompletion({
    model: prompt.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
    timeoutMs: 120_000,
    maxRetries: 2,
  });

  const raw = response?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned empty response");
  }

  // Limpiar posible markdown wrapping
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();

  let result: any;
  try {
    result = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse OpenAI JSON response:", cleaned.substring(0, 500));
    throw new Error(`Invalid JSON from OpenAI: ${e}`);
  }

  // Garantizar que score_general sea un número
  if (typeof result.score_general !== "number") {
    result.score_general = Number(result.score_general) || 0;
  }

  return enrichWhatsAppResult(rebalanceWhatsAppRisk(result, transcript));
}
