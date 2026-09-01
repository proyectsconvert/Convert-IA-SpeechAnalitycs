import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, type, name } = await req.json();
    if (!content || typeof content !== "string") throw new Error("El contenido del prompt es requerido.");

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("API key no configurada");

    const scope = type === "summary"
      ? "Genera un prompt que instruya a producir un resumen estructurado y accionable de la llamada."
      : type === "feedback"
      ? "Genera un prompt que instruya a producir feedback específico, constructivo y accionable."
      : "Genera un prompt que instruya a analizar comunicaciones comerciales y de servicio con buenas prácticas.";

    const systemPrompt = `Eres un editor experto de prompts para IA de análisis de llamadas. 
Reescribe y potencia el prompt proporcionado, haciéndolo más claro, profesional y útil.

REQUISITOS:
- Devuelve SOLO el prompt mejorado (sin explicaciones ni markdown extra)
- En español, listo para usarse como instrucciones del sistema
- Incluye: Rol, Objetivo, Instrucciones de análisis, Entregables numerados, Criterios de calidad, Restricciones
- Si un entregable no está en la conversación, instruye a reportarlo como "no identificado"

CONTEXTO: ${scope}

Integra el contenido del prompt original sin perder su intención.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Prompt original (nombre: "${name}"):\n---\n${content}\n---\nReescríbelo integrando las secciones requeridas.` },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);

    const data = await response.json();
    const improvedContent = data.choices[0].message.content?.trim() || "";

    return new Response(
      JSON.stringify({ improvedContent, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("improve-prompt error:", error);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
