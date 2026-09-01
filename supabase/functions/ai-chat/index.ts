import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, context, accountId, history } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Mensaje requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";

    // ========== CALL-SPECIFIC CHAT ==========
    if (context?.isCallSpecific && context?.audioFileId) {
      console.log("Per-call chat for:", context.audioFileId);

      // Get transcription for this audio file
      const { data: transcription } = await supabase
        .from("transcriptions")
        .select("full_text")
        .eq("audio_file_id", context.audioFileId)
        .single();

      // Get analysis
      const { data: analysis } = await supabase
        .from("analyses")
        .select("summary, overall_sentiment, sentiment_score, tags, insights, results")
        .eq("audio_file_id", context.audioFileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get audio file info
      const { data: audioFile } = await supabase
        .from("audio_files")
        .select("file_name, duration_seconds, created_at, call_topic, sentiment, summary")
        .eq("id", context.audioFileId)
        .single();

      systemPrompt = `Eres un asistente especializado en análisis detallado de llamadas telefónicas.

ESTÁS ANALIZANDO UNA LLAMADA ESPECÍFICA. Basa todas tus respuestas en los datos de esta llamada.

INFORMACIÓN DE LA LLAMADA:
- Archivo: ${audioFile?.file_name || "N/A"}
- Duración: ${audioFile?.duration_seconds || 0} segundos
- Fecha: ${audioFile?.created_at || "N/A"}
- Tema: ${audioFile?.call_topic || "No detectado"}
- Sentimiento: ${audioFile?.sentiment || "No analizado"}

RESUMEN: ${analysis?.summary || audioFile?.summary || "No disponible"}

ANÁLISIS:
${analysis?.results ? JSON.stringify(analysis.results, null, 2) : "No disponible"}

TRANSCRIPCIÓN COMPLETA:
${transcription?.full_text || "No disponible"}

Puedes:
- Analizar la calidad de la conversación
- Evaluar el desempeño del agente
- Identificar momentos clave
- Sugerir mejoras
- Responder preguntas sobre el contenido
- Analizar el sentimiento del cliente
- Evaluar cumplimiento de protocolos

SIEMPRE basa tus respuestas en los datos de esta llamada.`;

    } else {
      // ========== GENERAL CHAT ==========
      return new Response(JSON.stringify({ error: "Use general-chat for account-level queries" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages array
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }

    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Track usage
    try {
      if (accountId) {
        await supabase.rpc("increment_usage", {
          p_account_id: accountId,
          p_transcription_hours: 0,
          p_chatbot_queries: 1,
          p_files_processed: 0,
        });
      }
    } catch (e) {
      console.error("Usage tracking error:", e);
    }

    return new Response(JSON.stringify({
      response: aiResponse,
      callSpecific: true,
      audioFileId: context?.audioFileId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("ai-chat error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
