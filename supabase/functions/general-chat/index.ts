import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================================
// HELPERS — replican la lógica del export maestro (deriveData / unifiedCobranzaFields)
// para que el AI Copilot vea EXACTAMENTE la misma información que el usuario exporta.
// ============================================================================

const jsonToRecord = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("{")) {
      try { return JSON.parse(t) as Record<string, unknown>; } catch { /* */ }
    }
  }
  return {};
};

function getMergedAnalysisRecord(results: unknown, summary: string): Record<string, unknown> {
  const base = jsonToRecord(results);
  const s = String(summary ?? "").trim();
  if (s.startsWith("{")) {
    try { Object.assign(base, JSON.parse(s)); } catch { /* */ }
  }
  if (typeof base.analysis === "string") {
    const t = (base.analysis as string).trim();
    if (t.startsWith("{")) {
      try { Object.assign(base, JSON.parse(t)); } catch { /* */ }
    }
  }
  return base;
}

function classifyPromesaDePago(merged: Record<string, unknown>, summary: string): string {
  const compactMerged = [
    merged.estado_pago,
    merged.estadoPago,
    merged.motivo_no_pago,
    merged.motivo_contacto,
    merged.promesa_pago,
    merged.compromiso_pago,
    merged.conclusiones,
  ].map((v) => String(v ?? "")).join(" ");
  const blob = `${compactText(summary, 1200)} ${compactText(compactMerged, 1200)}`.toLowerCase();
  if (/\bno es cliente\b|persona equivocada|n[uú]mero equivocado/.test(blob)) return "No es cliente";
  if (/cliente al d[ií]a|al corriente|sin mora|al d[ií]a con el pago/.test(blob)) return "Cliente al día";
  if (/no responde|evade|no contesta|ignora.*mensaje/.test(blob)) return "Cliente no responde o evade";
  const ep = String(merged.estado_pago ?? merged.estadoPago ?? "").toLowerCase();
  if (ep) {
    if (/no quiere pagar|no puede pagar/.test(ep)) return "No";
    if (/hoy|mañana|manana|pr[oó]xima semana|semana siguiente/.test(ep)) return "Sí";
    if (/no confirma/.test(ep)) return "No clasificado";
  }
  const s = summary.toLowerCase();
  if (/compromiso (de )?pago|promesa (de )?pago|pagar[áa]/.test(s) && !/no (quiere|puede|podr[aá]) pagar/.test(s)) return "Sí";
  if (/no (quiere|puede|podr[aá]) pagar|rechaza pagar/.test(s)) return "No";
  if (!summary || summary.length < 8) return "No clasificado";
  if (/pendiente|ambiguo|inconcluso|sin definir/.test(blob)) return "No clasificado";
  return "Otros";
}

function pickMotivo(merged: Record<string, unknown>): string {
  const direct = merged.motivo_no_pago ?? merged.motivo_contacto ?? merged.Motivo ?? merged.motivo;
  if (direct != null && String(direct).trim() !== "") return String(direct).trim();
  if (merged.submotivo) {
    const m = merged.motivo_contacto ?? merged.motivo;
    if (m) return `${String(m).trim()} · ${String(merged.submotivo).trim()}`;
    return String(merged.submotivo).trim();
  }
  return "Otros";
}

function pickResponsabilidad(merged: Record<string, unknown>): string {
  for (const k of Object.keys(merged)) {
    const kl = k.toLowerCase();
    if ((kl.includes("responsabilidad") || kl.includes("atribuci")) && merged[k] != null && String(merged[k]).trim() !== "") {
      return String(merged[k]).trim();
    }
  }
  return "Otros";
}

const compactText = (value: unknown, max = 280) => String(value ?? "").slice(0, max);

function buildMasterRecord(channel: "call" | "whatsapp", row: any): Record<string, unknown> {
  const merged = getMergedAnalysisRecord(row.results, row.summary || "");
  const sentiment = String(row.sentiment || merged.sentimiento_cliente || "neutral").toLowerCase();
  const sentLabel = sentiment.includes("positiv") ? "positivo" : sentiment.includes("negativ") ? "negativo" : "neutral";

  const score01 = (() => {
    const s = Number(row.score) || 0;
    return s <= 1.5 ? s : s / 100;
  })();

  return {
    canal: channel === "call" ? "Llamada" : "WhatsApp",
    archivo: row.file_name || row.contact_name || row.id,
    fecha: row.created_at,
    "ext_Nombre Asesor": row.agent || "Desconocido",
    "ext_Nombre Campaña": row.campaign || "",
    duracion_segundos: row.duration_seconds || 0,
    duracion_Minutos: Math.round(((row.duration_seconds || 0) / 60) * 100) / 100,
    mensajes: row.total_messages || 0,
    score_0_1: Math.round(score01 * 100) / 100,
    score_pct: Math.round(score01 * 100),
    sentimiento: sentLabel,
    "Atribución responsabilidad": pickResponsabilidad(merged),
    "Promesa de pago": classifyPromesaDePago(merged, String(row.summary || "")),
    "Motivo principal": pickMotivo(merged),
    "Estado pago (detalle)": String(merged.estado_pago ?? merged.estadoPago ?? ""),
    "resumen de la llamada y/o de la conversacion": String(merged.resumen_ejecutivo ?? merged.resumen ?? row.summary ?? ""),
    "Puntos Positivos": Array.isArray(merged.puntos_positivos) ? merged.puntos_positivos.join(" | ") : String(merged.puntos_positivos ?? ""),
    "Puntos Negativos": Array.isArray(merged.puntos_negativos) ? merged.puntos_negativos.join(" | ") : String(merged.puntos_negativos ?? ""),
    Oportunidades: Array.isArray(merged.oportunidades) ? merged.oportunidades.join(" | ") : String(merged.oportunidades ?? ""),
    Insights: Array.isArray(row.insights) ? row.insights.map((i: any) => i.text || i).join(" | ") : "",
    Conclusiones: String(merged.conclusiones ?? ""),
    Recomendaciones: Array.isArray(merged.recomendaciones) ? merged.recomendaciones.join(" | ") : String(merged.recomendaciones ?? ""),
  };
}

// ============================================================================

serve(async (req: any) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, accountId, chatHistory = [], channelFilter, dateFilter } = await req.json();

    if (!message || !accountId) {
      return new Response(JSON.stringify({ error: "Message and account ID required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Track usage
    try {
      await supabase.rpc("increment_usage", {
        p_account_id: accountId,
        p_transcription_hours: 0,
        p_chatbot_queries: 1,
        p_files_processed: 0,
      });
    } catch (e) {
      console.error("Usage tracking error:", e);
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthLabel = monthStart.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

    const systemPrompt = `Eres el AI Copilot de una plataforma avanzada de análisis conversacional de Llamadas y WhatsApp.
Tu misión es brindar respuestas precisas, útiles y basadas en las interacciones reales (grabaciones, transcripciones, análisis de IA, resúmenes, objeciones y métricas) disponibles en la cuenta.

HERRAMIENTAS:
1. query_unified_dataset: Devuelve métricas consolidadas (Llamadas + WhatsApp), totales, distribución de motivos/sentimientos y registros de muestra con resúmenes, puntos negativos, objeciones, oportunidades y conclusiones.
   - Úsala para análisis generales, preguntas sobre el negocio ("¿por qué no compran los clientes?", "¿cuáles son las quejas principales?", "¿cómo rinden los asesores?"), totales y rankings.
2. query_single_interaction: Busca interacciones puntuales por palabra clave, nombre de cliente/archivo, o tema en la conversación/transcripción. Devuelve la transcripción completa y el análisis IA.

REGLAS DE BÚSQUEDA:
- **Disponibilidad de Datos**: Si el usuario no pide un rango de fechas explícito, analiza todas las interacciones disponibles en la cuenta (o el periodo disponible). NUNCA digas que no hay datos si la herramienta devuelve registros en la cuenta.
- **Preguntas Temáticas/Objeciones (ej: "¿por qué no compran?", "¿por qué reclaman?", "¿qué objeciones ponen?")**:
  - Lee los resúmenes, puntos negativos, oportunidades, motivos y fragmentos de conversación que devuelven las herramientas.
  - Sintetiza de manera estructurada los motivos reales que surgen de las llamadas/chats (ej. precio, falta de seguimiento, producto no se ajusta, dudas no resueltas, falta de interés, etc.).
- **Ambos Canales**: Siempre que haya datos, menciona tanto Llamadas como WhatsApp.
- **Cita siempre la base**: Indica brevemente "Basado en X interacciones analizadas en la cuenta...".
- **Formato**: Responde siempre en español, con markdown estructurado (títulos, negritas, listas ordenadas, viñetas y tablas).`;

    const mappedHistory = chatHistory.slice(-6).map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content),
    }));

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...mappedHistory,
      { role: "user", content: message },
    ];

    const tools = [
      {
        type: "function",
        function: {
          name: "query_unified_dataset",
          description: "Devuelve el dataset consolidado de la cuenta (Llamadas + WhatsApp) con métricas, motivos, sentimientos y registros de muestra con resúmenes y objeciones.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["all", "call", "whatsapp"], description: "Filtra por canal. Default: all" },
              start_date: { type: "string", description: "ISO 8601 inicio. OPCIONAL: solo enviar si el usuario pide una fecha específica." },
              end_date: { type: "string", description: "ISO 8601 fin. OPCIONAL: solo enviar si el usuario pide una fecha específica." },
              sentiment: { type: "string", enum: ["positivo", "negativo", "neutral"] },
              agent: { type: "string", description: "Filtro por nombre de asesor" },
              motivo: { type: "string", description: "Término o motivo a buscar" },
              limit: { type: "number", description: "Máximo de registros a procesar. Por defecto 5000." },
            },
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "query_single_interaction",
          description: "Busca interacciones específicas por nombre de archivo, cliente, teléfono o búsqueda de texto en la transcripción/resumen.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string", description: "Texto a buscar en transcripción, resumen, archivo o cliente" },
              channel: { type: "string", enum: ["all", "call", "whatsapp"] },
            },
            required: ["search"],
          },
        },
      },
    ];

    // First LLM call
    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.1,
      }),
    });

    if (!initialResponse.ok) {
      const errText = await initialResponse.text();
      console.error("OpenAI error 1:", errText);
      throw new Error(`OpenAI error: ${errText}`);
    }

    const initialData = await initialResponse.json();
    const assistantMessage = initialData.choices[0].message;

    // ----- Helpers de fetch -----
    const PAGE_SIZE = 200;
    const HARD_CAP = 5000;

    const fetchCalls = async (filters: { start?: string; end?: string; agent?: string; sentiment?: string; limit?: number; searchIds?: string[]; lean?: boolean }) => {
      const cap = Math.min(filters.limit || HARD_CAP, HARD_CAP);
      const lean = filters.lean !== false;
      const selectCols = lean
        ? `id, file_name, created_at, duration_seconds, metadata, summary, sentiment,
           analyses(summary, overall_sentiment, sentiment_score, results, tags)`
        : `id, file_name, created_at, duration_seconds, metadata, summary, sentiment,
           transcriptions(full_text),
           analyses(summary, overall_sentiment, sentiment_score, results, insights, tags)`;
      
      let q = supabase
        .from("audio_files")
        .select(selectCols)
        .eq("account_id", accountId);

      if (filters.start) q = q.gte("created_at", filters.start);
      if (filters.end) q = q.lte("created_at", filters.end);
      if (filters.searchIds && filters.searchIds.length) {
        q = q.in("id", Array.from(new Set(filters.searchIds)));
      }

      const { data, error } = await q.order("created_at", { ascending: false }).limit(cap);
      if (error) { console.error("fetchCalls error:", error); return []; }

      const out: any[] = [];
      for (const af of data || []) {
        const a = (Array.isArray(af.analyses) && af.analyses.length > 0) ? af.analyses[0] : {};
        const md = af.metadata || {};
        out.push({
          id: af.id,
          file_name: af.file_name,
          created_at: af.created_at,
          duration_seconds: af.duration_seconds,
          agent: md.agent_name || md.user_name || md.agent || (af.file_name?.includes("-") ? af.file_name.split("-")[0].trim() : "Desconocido"),
          campaign: md.campaign,
          sentiment: a.overall_sentiment || af.sentiment || "neutral",
          score: a.sentiment_score,
          summary: a.summary || af.summary || "",
          results: a.results || {},
          insights: lean ? [] : (a.insights || []),
          tags: a.tags || [],
          transcription: lean ? "" : (af.transcriptions?.[0]?.full_text || ""),
        });
      }
      return out;
    };

    const fetchWhatsapp = async (filters: { start?: string; end?: string; agent?: string; limit?: number; searchIds?: string[]; lean?: boolean }) => {
      const cap = Math.min(filters.limit || HARD_CAP, HARD_CAP);
      const lean = filters.lean !== false;
      const selectCols = lean
        ? "id, account_id, external_id, contact_name, phone_number, first_agent_name, campaign, start_date, total_messages, duracion_conversacion, status, score_general, sentiment, ticket"
        : "*";
      
      let q = supabase
        .from("whatsapp_conversations")
        .select(selectCols)
        .eq("account_id", accountId);

      if (filters.start) q = q.gte("start_date", filters.start);
      if (filters.end) q = q.lte("start_date", filters.end);
      if (filters.agent) q = q.ilike("first_agent_name", `%${filters.agent}%`);
      if (filters.searchIds && filters.searchIds.length) {
        q = q.in("id", Array.from(new Set(filters.searchIds)));
      }

      const { data, error } = await q.order("start_date", { ascending: false }).limit(cap);
      if (error) { console.error("fetchWhatsapp error:", error); return []; }

      const list = data || [];
      if (list.length === 0) return [];
      const ids = list.map((c: any) => c.id);
      const { data: results } = await supabase
        .from("whatsapp_analysis_results")
        .select("conversation_id, results, score_general, prompt_name, analyzed_at")
        .in("conversation_id", ids)
        .eq("analysis_status", "completed");
      
      const byConv = new Map<string, any>();
      (results || []).forEach((r: any) => {
        const prev = byConv.get(r.conversation_id);
        if (!prev || new Date(r.analyzed_at || 0) > new Date(prev.analyzed_at || 0)) byConv.set(r.conversation_id, r);
      });

      return list.map((c: any) => {
        const r = byConv.get(c.id);
        return {
          id: c.id,
          file_name: c.contact_name || c.ticket || c.phone_number || c.external_id,
          contact_name: c.contact_name,
          phone_number: c.phone_number,
          created_at: c.start_date || c.created_at,
          duration_seconds: c.duracion_conversacion || 0,
          total_messages: c.total_messages,
          agent: c.first_agent_name || "Desconocido",
          campaign: c.campaign,
          sentiment: c.sentiment,
          score: r?.score_general ?? c.score_general,
          summary: typeof r?.results === "object" ? (r.results as any)?.resumen_ejecutivo : "",
          results: r?.results,
          prompt_name: r?.prompt_name,
        };
      });
    };

    // Process tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        let result: any = {};

        try {
          if (toolCall.function.name === "query_unified_dataset") {
            const channel = args.channel || "all";
            const perChannelLimit = args.limit ? Math.min(args.limit, HARD_CAP) : HARD_CAP;

            const startISO = args.start_date || null;
            const endISO = args.end_date || null;

            let { data: aggregate, error: aggregateError } = await supabase.rpc("vm_general_chat_aggregate", {
              p_account_id: accountId,
              p_start_date: startISO,
              p_end_date: endISO,
              p_channel: channel,
              p_sentiment: args.sentiment || null,
              p_agent: args.agent || null,
              p_motivo: args.motivo || null,
              p_limit: perChannelLimit,
            });

            // Fallback: si con filtros estrictos da 0, consultar sin filtro de motivo ni fecha para tener los datos reales
            if (!aggregate || aggregate.total_records_in_dataset === 0) {
              const fallbackRes = await supabase.rpc("vm_general_chat_aggregate", {
                p_account_id: accountId,
                p_start_date: null,
                p_end_date: null,
                p_channel: channel,
                p_sentiment: null,
                p_agent: null,
                p_motivo: null,
                p_limit: perChannelLimit,
              });
              if (fallbackRes?.data && fallbackRes.data.total_records_in_dataset > 0) {
                aggregate = fallbackRes.data;
              }
            }

            result = {
              period_analyzed: (startISO || endISO) ? `${startISO || ''} → ${endISO || ''}` : "Histórico disponible de la cuenta",
              filters_applied: {
                channel,
                sentiment: args.sentiment || null,
                agent: args.agent || null,
                motivo: args.motivo || null,
              },
              ...(aggregate || {}),
              note: (aggregate?.total_records_in_dataset || 0) > 0
                ? `Total de interacciones analizadas: ${aggregate.total_records_in_dataset}. Revisa los sample_records para detalles, motivos, puntos negativos y conclusiones.`
                : "No se encontraron interacciones en la cuenta.",
            };
          } else if (toolCall.function.name === "query_single_interaction") {
            const search = String(args.search || "").trim();
            const channel = args.channel || "all";
            const callIds: string[] = [];
            const waIds: string[] = [];

            if (channel !== "whatsapp") {
              // Búsqueda en nombre de archivo, transcripciones y resúmenes
              const [fileMatches, transMatches, anMatches] = await Promise.all([
                supabase.from("audio_files").select("id").eq("account_id", accountId).ilike("file_name", `%${search}%`).limit(10),
                supabase.from("transcriptions").select("audio_file_id").eq("account_id", accountId).ilike("full_text", `%${search}%`).limit(10),
                supabase.from("analyses").select("audio_file_id").eq("account_id", accountId).ilike("summary", `%${search}%`).limit(10),
              ]);
              (fileMatches.data || []).forEach((m: any) => callIds.push(m.id));
              (transMatches.data || []).forEach((m: any) => m.audio_file_id && callIds.push(m.audio_file_id));
              (anMatches.data || []).forEach((m: any) => m.audio_file_id && callIds.push(m.audio_file_id));

              // Si no hubo coincidencia exacta por texto, cargar las llamadas existentes en la cuenta
              if (callIds.length === 0) {
                const { data: recents } = await supabase.from("audio_files").select("id").eq("account_id", accountId).order("created_at", { ascending: false }).limit(5);
                (recents || []).forEach((m: any) => callIds.push(m.id));
              }
            }

            if (channel !== "call") {
              const { data: waMatches } = await supabase
                .from("whatsapp_conversations")
                .select("id")
                .eq("account_id", accountId)
                .or(`contact_name.ilike.%${search}%,phone_number.ilike.%${search}%,ticket.ilike.%${search}%,external_id.ilike.%${search}%`)
                .limit(10);
              (waMatches || []).forEach((m: any) => waIds.push(m.id));

              if (waIds.length === 0) {
                const { data: recentsWa } = await supabase.from("whatsapp_conversations").select("id").eq("account_id", accountId).order("start_date", { ascending: false }).limit(5);
                (recentsWa || []).forEach((m: any) => waIds.push(m.id));
              }
            }

            const [calls, whatsapps] = await Promise.all([
              callIds.length > 0 ? fetchCalls({ searchIds: callIds, limit: 10, lean: false }) : Promise.resolve([]),
              waIds.length > 0 ? fetchWhatsapp({ searchIds: waIds, limit: 10, lean: false }) : Promise.resolve([]),
            ]);

            const enrichedWa = await Promise.all(whatsapps.map(async (w: any) => {
              const { data: msgs } = await supabase
                .from("whatsapp_messages")
                .select("sender_type, agent_name, content, timestamp")
                .eq("conversation_id", w.id)
                .order("timestamp", { ascending: true })
                .limit(200);
              const conversation = (msgs || []).map((m: any) => {
                const who = m.sender_type === "Contacto" ? "Cliente" : (m.agent_name || "Agente");
                return `[${m.timestamp || ""}] ${who}: ${m.content || ""}`;
              }).join("\n");
              return { ...w, conversation };
            }));

            const records = [
              ...calls.map((c: any) => ({ ...buildMasterRecord("call", c), conversación: c.transcription })),
              ...enrichedWa.map((w: any) => ({ ...buildMasterRecord("whatsapp", w), conversación: w.conversation })),
            ];

            result = {
              matches_found: records.length,
              records,
              note: records.length > 0 ? `Se encontraron ${records.length} interacciones relevantes con su conversación y análisis completo.` : "No se encontraron interacciones.",
            };
          }
        } catch (err) {
          console.error("Tool error:", err);
          result = { error: String(err) };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      // Fallback si no generó tool calls: invocar query_unified_dataset automáticamente
      const { data: aggregate } = await supabase.rpc("vm_general_chat_aggregate", {
        p_account_id: accountId,
        p_start_date: null,
        p_end_date: null,
        p_channel: "all",
        p_sentiment: null,
        p_agent: null,
        p_motivo: null,
        p_limit: 50,
      });

      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "fb_unified", type: "function", function: { name: "query_unified_dataset", arguments: "{}" } },
        ],
      });
      messages.push({
        role: "tool",
        tool_call_id: "fb_unified",
        content: JSON.stringify({
          period_analyzed: "Todo el histórico disponible",
          ...(aggregate || {}),
        }),
      });
    }

    // Second LLM call
    const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.2,
        max_tokens: 2500,
      }),
    });

    if (!finalResponse.ok) {
      const errText = await finalResponse.text();
      throw new Error(`OpenAI error 2: ${errText}`);
    }

    const finalData = await finalResponse.json();
    const finalContent = finalData.choices[0].message.content;

    return new Response(JSON.stringify({
      response: finalContent,
      metadata: {
        query_type: "unified_master_dataset",
        channels: ["calls", "whatsapp"],
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("general-chat error:", error);
    return new Response(JSON.stringify({
      error: "Error interno del servidor",
      details: error.message,
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
