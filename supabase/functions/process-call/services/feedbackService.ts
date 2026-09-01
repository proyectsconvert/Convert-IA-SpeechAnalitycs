
import { createChatCompletion } from "../utils/openai.ts";

/** Límites alineados con `src/lib/analysis/analysisFieldLimits.ts` (UI transcripciones / WhatsApp). */
const FB_LIMIT = {
  /** Tope duro; el modelo se instruye a resumir ~600 caracteres. */
  analysisPrompt: 2000,
  positiveItem: 360,
  negativeItem: 420,
  opportunityItem: 420,
  insights: 1200,
  conclusions: 1200,
  recommendations: 1200,
};

function truncStr(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

function truncArr(arr: string[], maxPer: number): string[] {
  return arr.map((x) => truncStr(String(x), maxPer));
}

const RISK_SIGNAL_RX = /\b(cancel(ar|ación|acion|e|en|ado|ada)?|termin(ar|ación|acion|e|en)?|baja|no\s+pagar[eé]?|no\s+voy\s+a\s+pagar|no\s+pagar[ée]|pagar[eé].{0,80}(cancel|termin)|incumpl|sin\s+servicio|no\s+recib|molest|queja|reclamo)\b/i;

function rebalanceRiskFindings<T extends { positive: string[]; negative: string[]; opportunities: string[]; sentiment: string; score: number }>(feedback: T, transcript: string): T {
  const moved: string[] = [];
  const positive = feedback.positive.filter((item) => {
    if (RISK_SIGNAL_RX.test(item)) {
      moved.push(item);
      return false;
    }
    return true;
  });
  const negative = [...feedback.negative, ...moved.map((item) => `Riesgo de cancelación o pérdida: ${item}`)];
  const hasRiskSignal = RISK_SIGNAL_RX.test(transcript);
  if (hasRiskSignal && !negative.some((item) => RISK_SIGNAL_RX.test(item))) {
    negative.push("El cliente expresa intención de cancelar, terminar la relación o no continuar; debe tratarse como riesgo negativo aunque exista una promesa de pago.");
  }
  const opportunities = [...feedback.opportunities];
  if (hasRiskSignal && !opportunities.some((item) => /retenci[oó]n|cancel|seguimiento|resolver|evidencia|aclar/i.test(item))) {
    opportunities.push("Activar gestión de retención: aclarar la causa de inconformidad, documentar evidencia y ofrecer una solución antes de cerrar o confirmar la cancelación.");
  }
  return {
    ...feedback,
    positive,
    negative,
    opportunities,
    sentiment: hasRiskSignal ? "negative" : feedback.sentiment,
    score: hasRiskSignal ? Math.min(feedback.score, 65) : feedback.score,
  };
}

function applyFeedbackCharLimits(f: {
  score: number;
  positive: string[];
  negative: string[];
  opportunities: string[];
  sentiment: string;
  entities: string[];
  topics: string[];
  behaviors_analysis: any[];
  insights: string;
  recommendations: string;
  conclusions: string;
  analysis_prompt_aligned: string;
}) {
  return {
    ...f,
    analysis_prompt_aligned: truncStr(f.analysis_prompt_aligned, FB_LIMIT.analysisPrompt),
    insights: truncStr(f.insights, FB_LIMIT.insights),
    recommendations: truncStr(f.recommendations, FB_LIMIT.recommendations),
    conclusions: truncStr(f.conclusions, FB_LIMIT.conclusions),
    positive: truncArr(f.positive, FB_LIMIT.positiveItem),
    negative: truncArr(f.negative, FB_LIMIT.negativeItem),
    opportunities: truncArr(f.opportunities, FB_LIMIT.opportunityItem),
  };
}

/**
 * Genera feedback automático para la llamada usando OpenAI
 */
export async function generateFeedback(
  transcription: string,
  summary: string,
  customPrompt?: string,
  selectedBehaviorIds: string[] = []
): Promise<{
  score: number;
  positive: string[];
  negative: string[];
  opportunities: string[];
  sentiment: string;
  entities: string[];
  topics: string[];
  behaviors_analysis: any[];
  insights: string;
  recommendations: string;
  conclusions: string;
  analysis_prompt_aligned: string;
}> {
  // Validar que la transcripción sea útil para el análisis
  const isValidTranscription = transcription &&
    transcription.length > 50 &&
    !transcription.toLowerCase().includes('no hay transcripción') &&
    !transcription.toLowerCase().includes('transcripción no disponible') &&
    !transcription.toLowerCase().includes('error en la transcripción') &&
    (transcription.includes('Asesor:') || transcription.includes('Cliente:') || transcription.includes('Agent:') || transcription.includes('Customer:') || transcription.split(' ').length > 20);

  if (!isValidTranscription) {
    console.log("Invalid or insufficient transcription for feedback generation");
    return applyFeedbackCharLimits({
      score: 0,
      positive: [],
      negative: ['No hay contenido analizable en la transcripción - información insuficiente'],
      opportunities: ['Verificar calidad del audio y contenido de la llamada'],
      sentiment: 'neutral',
      entities: [],
      topics: [],
      behaviors_analysis: [],
      insights: 'Información insuficiente',
      recommendations: 'Verificar calidad del audio',
      conclusions: 'Llamada no analizable',
      analysis_prompt_aligned: 'No se pudo realizar el análisis',
    });
  }

  if (!Deno.env.get('OPENAI_API_KEY')) {
    console.error("OpenAI API key not found");
    throw new Error("API key de OpenAI no encontrada");
  }

  // Prompt base para análisis de feedback
  const basePrompt = customPrompt || `
  Analiza esta llamada de servicio al cliente y proporciona feedback detallado.
  
  Evalúa:
  - Calidad del servicio al cliente
  - Comunicación efectiva
  - Resolución de problemas
  - Profesionalismo
  - Empatía y cortesía
  `;

  const systemMessage = `
  Eres un experto analista de calidad de centros de contacto. Tu tarea es analizar la comunicación entre un agente y un cliente.

  INSTRUCCIONES CRÍTICAS:
  1. Analiza ÚNICAMENTE el contenido de la transcripción real proporcionada.
  2. NO inventes nombres, problemas, soluciones o detalles que no aparezcan en la transcripción.
  3. Base tu análisis SOLO en lo que realmente se dice en la conversación.
  4. Utiliza el siguiente PROMPT DE ANÁLISIS ESPECÍFICO para guiar todo tu reporte:
     --- PROMPT DE ANÁLISIS ---
     ${basePrompt}
     --- FIN DEL PROMPT ---

  5. Clasificación obligatoria de hallazgos:
     - "positive" solo puede contener conductas o resultados favorables para la experiencia y continuidad del cliente.
     - "negative" debe incluir señales de riesgo, molestia, rechazo, incumplimiento, objeciones fuertes, intención de cancelar, terminar contrato, no pagar, baja, abandono o pérdida de venta. Ejemplo: "Pagaré los 250 y por favor que se cancele todo" es NEGATIVO porque expresa intención de cancelar.
     - "opportunities" debe convertir los negativos en acciones concretas para retener, resolver o mejorar.
     - No clasifiques como positivo un pago, acuerdo o promesa si está ligado a cancelación, inconformidad o pérdida del cliente.

  6. Debes generar las siguientes secciones OBLIGATORIAMENTE, todas alineadas con el prompt de análisis anterior:
     - analysis_prompt_aligned: Análisis según el prompt, lo más resumido posible (apunta a ~600 caracteres).
     - insights: Hallazgo completo en 2 a 4 frases, con contexto, causa y consecuencia observada. No terminar con puntos suspensivos.
     - recommendations: Recomendación completa en 2 a 4 frases accionables. No terminar con puntos suspensivos.
     - conclusions: Cierre completo en 2 a 4 frases con estado final, riesgo y siguiente acción. No terminar con puntos suspensivos.

  7. Responde en formato JSON con esta estructura exacta:
  {
    "score": número del 0 al 100 evaluando el cumplimiento del prompt,
    "positive": ["punto positivo 1", "punto positivo 2"],
    "negative": ["punto negativo 1", "punto negativo 2"],
    "opportunities": ["oportunidad 1", "oportunidad 2"],
    "sentiment": "positive", "negative", o "neutral",
    "entities": ["entidad 1", "entidad 2"],
    "topics": ["tema 1", "tema 2"],
    "analysis_prompt_aligned": "texto resumido del análisis (ideal ~600 caracteres)",
    "insights": "texto de insights",
    "recommendations": "texto de recomendaciones",
    "conclusions": "texto de conclusiones"
  }

  8. LÍMITES DE EXTENSIÓN (caracteres con espacios):
     - analysis_prompt_aligned: RESUME el análisis todo lo posible; apunta a ~600 caracteres. Máximo absoluto 2000 (nunca lo excedas).
     - cada ítem en positive: máximo 360
     - cada ítem en negative: máximo 420
     - cada ítem en opportunities: máximo 420
     - insights, conclusions, recommendations: máximo 1200 cada uno; deben ser textos completos, sin truncarse ni cerrar con "..."`;

  const userMessage = `Analiza esta transcripción REAL basándote en el PROMPT anterior:

TRANSCRIPCIÓN:
${transcription}

RESUMEN PREVIO:
${summary}

Proporciona el análisis en el formato JSON solicitado, siendo muy específico y evitando generalidades.`;

  try {
    console.log('Generating feedback with OpenAI...');
    
    const response = await createChatCompletion({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      timeoutMs: 45000,
    });

    const content = response.choices[0].message.content;
    let result;
    
    try {
      result = JSON.parse(content || "{}");
    } catch (e) {
      console.error("Error parsing feedback JSON:", e);
      result = {
        score: 50,
        positive: ['Transcripción procesada'],
        negative: ['Error en parsing'],
        opportunities: [],
        sentiment: 'neutral',
        entities: [],
        topics: [],
        analysis_prompt_aligned: 'Error al generar el análisis detallado.',
        insights: 'N/A',
        recommendations: 'N/A',
        conclusions: 'N/A'
      };
    }

    // Validar y limpiar resultado
    const feedback = {
      score: Math.max(0, Math.min(100, result.score || 0)),
      positive: Array.isArray(result.positive) ? result.positive : [],
      negative: Array.isArray(result.negative) ? result.negative : [],
      opportunities: Array.isArray(result.opportunities) ? result.opportunities : [],
      sentiment: ['positive', 'negative', 'neutral'].includes(result.sentiment) ? result.sentiment : 'neutral',
      entities: Array.isArray(result.entities) ? result.entities : [],
      topics: Array.isArray(result.topics) ? result.topics : [],
      behaviors_analysis: [],
      analysis_prompt_aligned: result.analysis_prompt_aligned || result.summary || 'No disponible',
      insights: result.insights || 'No disponible',
      recommendations: result.recommendations || 'No disponible',
      conclusions: result.conclusions || 'No disponible'
    };

    const capped = applyFeedbackCharLimits(rebalanceRiskFindings(feedback, transcription));
    console.log('Feedback generated successfully:', capped);
    return capped;
    
  } catch (error: any) {
    console.error('Error generating feedback:', error);
    throw new Error(`Error generando feedback: ${error?.message || String(error)}`);
  }
}
