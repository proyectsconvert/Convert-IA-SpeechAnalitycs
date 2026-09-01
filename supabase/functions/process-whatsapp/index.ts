import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./utils/cors.ts";
import {
  analyzeWhatsAppConversation,
  normalizeWhatsAppTranscript,
} from "./services/whatsappService.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

async function safeUpdateStatus(
  supabase: any,
  conversationId: string,
  status: string,
  extra: Record<string, any> = {},
): Promise<void> {
  try {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ status, ...extra })
      .eq("id", conversationId);
    if (error) {
      console.error(`Failed to update status to '${status}':`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception updating status to '${status}':`, e.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth check ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const internalHeader = req.headers.get("x-remote-import-internal") ||
    req.headers.get("x-internal-token");
  // Accept service role directly, or via internal header with anon Authorization from batch/import workers.
  const isServiceRole = token === supabaseServiceKey ||
    internalHeader === supabaseServiceKey;
  if (!isServiceRole) {
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let conversation_id: string | undefined;

  try {
    const body = await req.json();
    conversation_id = body.conversation_id;
    const { account_id, prompt_id, batch_id } = body;

    if (!conversation_id || !account_id) {
      return new Response(
        JSON.stringify({ error: "Missing conversation_id or account_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let finalPromptId = prompt_id;
    if (!finalPromptId) {
      // Try to find the default prompt for this account
      const { data: defaultPrompt } = await supabase
        .from("prompts")
        .select("id")
        .eq("account_id", account_id)
        .eq("is_default", true)
        .eq("status", "active")
        .maybeSingle();

      if (defaultPrompt) {
        finalPromptId = defaultPrompt.id;
      } else {
        // Fallback: take any active prompt for this account
        const { data: firstPrompt } = await supabase
          .from("prompts")
          .select("id")
          .eq("account_id", account_id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (firstPrompt) {
          finalPromptId = firstPrompt.id;
        }
      }
    }

    if (!finalPromptId) {
      return new Response(
        JSON.stringify({
          error:
            "No se encontró ningún prompt activo para procesar la conversación",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Fetch conversation, messages, prompt in parallel
    const [convRes, msgRes, promptRes] = await Promise.all([
      supabase.from("whatsapp_conversations").select("*").eq(
        "id",
        conversation_id,
      ).single(),
      supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("timestamp", { ascending: true }),
      supabase.from("prompts").select("*").eq("id", finalPromptId).single(),
    ]);

    if (convRes.error || !convRes.data) {
      throw new Error(
        `Conversation not found: ${convRes.error?.message || "no data"}`,
      );
    }
    if (msgRes.error) {
      throw new Error(`Error fetching messages: ${msgRes.error.message}`);
    }
    if (promptRes.error || !promptRes.data) {
      throw new Error(
        `Prompt not found: ${promptRes.error?.message || "no data"}`,
      );
    }

    const conversation = convRes.data;
    const messages = msgRes.data || [];
    const prompt = promptRes.data;

    // 2. Calculate conversation metrics
    const totalMensajes = messages.length;
    const mensajesCliente = messages.filter((m: any) =>
      m.sender_type === "Contacto"
    ).length;
    const mensajesAgente = messages.filter((m: any) =>
      m.sender_type === "Agente" || m.sender_type === "Bot"
    ).length;

    let duracionConversacion = 0;
    if (messages.length >= 2) {
      const firstTs = new Date(messages[0].timestamp).getTime();
      const lastTs = new Date(messages[messages.length - 1].timestamp)
        .getTime();
      duracionConversacion = Math.round((lastTs - firstTs) / 1000); // seconds
    }

    // 3. Mark as in_process with metrics
    await safeUpdateStatus(supabase, conversation_id, "en_proceso", {
      total_messages: totalMensajes,
      mensajes_cliente: mensajesCliente,
      mensajes_agente: mensajesAgente,
      duracion_conversacion: duracionConversacion,
      prompt_utilizado_id: finalPromptId,
      prompt_utilizado_nombre: prompt.name,
      canal: "whatsapp",
    });

    // 4. Normalize and analyze
    const transcript = normalizeWhatsAppTranscript(conversation, messages);
    const result = await analyzeWhatsAppConversation(transcript, prompt);

    // 5. Save results
    const { data: analysisResult, error: saveError } = await supabase
      .from("whatsapp_analysis_results")
      .insert({
        conversation_id,
        account_id,
        prompt_id: finalPromptId,
        prompt_name: prompt.name,
        analysis_status: "completed",
        score_general: result.score_general,
        results: result,
        batch_id: batch_id || null,
        model_used: "analysis-engine",
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      throw new Error(`Error saving analysis: ${saveError.message}`);
    }

    // 6. Update conversation with results + metrics
    await safeUpdateStatus(supabase, conversation_id, "analizado", {
      score_general: result.score_general,
      sentiment: result.sentimiento_cliente,
      total_messages: totalMensajes,
      mensajes_cliente: mensajesCliente,
      mensajes_agente: mensajesAgente,
      duracion_conversacion: duracionConversacion,
      prompt_utilizado_id: finalPromptId,
      prompt_utilizado_nombre: prompt.name,
      canal: "whatsapp",
    });

    // 7. Audit log (non-blocking)
    try {
      await supabase.from("audit_logs").insert({
        account_id,
        module: "whatsapp_analytics",
        action: "analyze_conversation",
        detail:
          `ID: ${conversation.external_id} | Score: ${result.score_general} | Prompt: ${prompt.name}`,
        result: "success",
      });
    } catch (e: any) {
      console.error("Audit log error:", e.message);
    }

    // Quality matrix evaluation (only NEW analyses)
    try {
      console.log("📊 Evaluando matriz de calidad para WhatsApp:", conversation_id);
      const evalRes = await fetch(`${supabaseUrl}/functions/v1/evaluate-quality`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
        },
        body: JSON.stringify({
          account_id,
          source_type: "whatsapp",
          whatsapp_conversation_id: conversation_id,
          agent_name: (conversation as any)?.agente_principal || null,
          conversation_text: transcript || "",
        }),
      });
      if (!evalRes.ok) {
        const errTxt = await evalRes.text();
        console.warn("evaluate-quality WA warning:", evalRes.status, errTxt);
      } else {
        const evalData = await evalRes.json();
        console.log("✅ evaluate-quality WA completado:", evalData);
      }
    } catch (e: any) {
      console.warn("evaluate-quality WA dispatch error:", e?.message);
    }

    return new Response(
      JSON.stringify({ success: true, analysis_id: analysisResult.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(
      "Error processing whatsapp analysis:",
      error.message || error,
    );

    if (conversation_id) {
      await safeUpdateStatus(supabase, conversation_id, "error");
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
