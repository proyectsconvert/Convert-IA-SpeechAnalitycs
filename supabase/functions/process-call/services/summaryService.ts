
import { createChatCompletion } from "../utils/openai.ts";

function cleanJsonSummary(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed === "string") return parsed;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? `• ${item}` : String(item))).join("\n");
      }
      if (typeof parsed === "object" && parsed !== null) {
        const sections: string[] = [];
        const mainKeys = ["resumen", "summary", "resumen_ejecutivo", "resumen_llamada", "executive_summary"];
        const foundKey = Object.keys(parsed).find((k) => mainKeys.includes(k.toLowerCase()));
        if (foundKey && parsed[foundKey]) {
          const val = parsed[foundKey];
          if (Array.isArray(val)) sections.push(val.map((x) => `• ${String(x)}`).join("\n"));
          else if (typeof val === "string") sections.push(val.trim());
        }
        for (const [k, v] of Object.entries(parsed)) {
          if (foundKey && k.toLowerCase() === foundKey.toLowerCase()) continue;
          if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
          const formattedKey = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          if (Array.isArray(v)) {
            sections.push(`\n${formattedKey}:\n${v.map((x) => `• ${String(x)}`).join("\n")}`);
          } else {
            sections.push(`\n${formattedKey}: ${String(v)}`);
          }
        }
        return sections.join("\n\n").trim();
      }
    } catch {
      return t;
    }
  }
  return t;
}

/**
 * Genera un resumen de la llamada usando OpenAI
 */
export async function generateSummary(transcription: string, customPrompt?: string): Promise<string> {
  // Validar que la transcripción sea útil para el análisis
  const isValidTranscription = transcription &&
    transcription.length > 50 &&
    !transcription.toLowerCase().includes('no hay transcripción') &&
    !transcription.toLowerCase().includes('transcripción no disponible') &&
    !transcription.toLowerCase().includes('error en la transcripción');

  if (!isValidTranscription) {
    console.log("Invalid or insufficient transcription for summary generation");
    return "No hay contenido suficiente para generar un resumen - transcripción insuficiente o inválida";
  }

  if (!Deno.env.get('OPENAI_API_KEY')) {
    console.error("OpenAI API key not found");
    throw new Error("API key de OpenAI no encontrada");
  }

  const basePrompt = customPrompt || `
  Crea un resumen conciso y en prosa limpia de esta llamada de atención al cliente.
  
  INSTRUCCIONES CRÍTICAS:
  - Usa ÚNICAMENTE la información que aparece en la transcripción
  - NO inventes nombres, problemas, soluciones o detalles que no estén en el texto
  - Redacta en texto continuo y párrafos limpios, sin envolver en JSON ni etiquetas de código
  - Mantén el resumen factual y basado en evidencia
  
  Incluye:
  - Tema principal de la llamada (si se puede identificar)
  - Participantes mencionados (solo si aparecen en la transcripción)
  - Acciones tomadas (solo las que se mencionan explícitamente)
  - Resultado (solo si se indica claramente)
  `;

  const systemMessage = `${basePrompt}

Devuelve el resumen en texto plano, limpio y legible, sin JSON ni markdown de código.`;

  const userMessage = `Crea un resumen basado ÚNICAMENTE en esta transcripción:

${transcription}

IMPORTANTE: No agregues información que no aparezca explícitamente en la transcripción.`;

  try {
    console.log('Generating summary with OpenAI...');
    
    const response = await createChatCompletion({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      timeoutMs: 45000,
    });

    const rawSummary = response.choices[0].message.content?.trim() || "No se pudo generar resumen";
    const summary = cleanJsonSummary(rawSummary);
    
    console.log('Summary generated successfully:', summary.substring(0, 100) + '...');
    return summary;
    
  } catch (error: any) {
    console.error('Error generating summary:', error);
    throw new Error(`Error generando resumen: ${error?.message || String(error)}`);
  }
}

/**
 * Detecta el tema principal de la llamada
 */
export async function detectCallTopic(transcription: string, summary: string): Promise<string> {
  // Validar que tengamos contenido para analizar
  if (!transcription || transcription.length < 50) {
    return 'Contenido insuficiente para determinar el tema';
  }

  if (!Deno.env.get('OPENAI_API_KEY')) {
    console.error("OpenAI API key not found");
    return 'Consulta general';
  }

  const systemMessage = `Identifica el tema principal de esta llamada basándote ÚNICAMENTE en el contenido proporcionado.

INSTRUCCIONES:
- Usa solo la información presente en la transcripción y resumen
- NO inventes detalles adicionales
- Responde con una categoría simple y directa

Categorías comunes:
- Consulta general
- Soporte técnico  
- Información de productos
- Reclamos
- Activación de servicios
- Facturación
- Seguimiento
- Otro (especifica brevemente)

Responde solo con el nombre de la categoría.`;

  const userMessage = `Transcripción: ${transcription}

Resumen: ${summary}

¿Cuál es el tema principal de esta llamada?`;

  try {
    const response = await createChatCompletion({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      timeoutMs: 30000,
    });

    const topic = response.choices[0].message.content?.trim() || 'Consulta general';
    console.log('Topic detected:', topic);
    return topic;
    
  } catch (error) {
    console.error('Error detecting topic:', error);
    return 'Consulta general';
  }
}
