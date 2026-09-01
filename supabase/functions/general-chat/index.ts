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

const addCount = (bucket: Record<string, number>, key: unknown) => {
  const label = String(key ?? "Otros").trim() || "Otros";
  bucket[label] = (bucket[label] || 0) + 1;
};

const topEntries = (bucket: Record<string, number>, max = 25) =>
  Object.fromEntries(Object.entries(bucket).sort((a, b) => b[1] - a[1]).slice(0, max));

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

    const systemPrompt = `Eres el AI Copilot de una plataforma de análisis de Llamadas y WhatsApp. Tu única fuente de verdad son las herramientas. NUNCA inventes datos.

DATOS DISPONIBLES (idénticos al Excel "Datos Maestros" exportable):
Cada interacción tiene 26 columnas: canal, archivo, fecha, ext_Nombre Asesor, ext_Nombre Campaña, duracion_segundos, duracion_Minutos, mensajes, score_0_1, score_pct, sentimiento, Atribución responsabilidad, Promesa de pago, Motivo principal, Estado pago (detalle), resumen, Puntos Positivos, Puntos Negativos, Oportunidades, Insights, Conclusiones, Recomendaciones.

HERRAMIENTAS:
- query_unified_dataset: Devuelve agregados (Llamadas + WhatsApp) estilo Excel maestro. Úsalo para análisis general, totales, comparativas, distribuciones, rankings de agentes, motivos, promesas de pago, sentimientos.
- query_single_interaction: Busca UNA interacción específica por nombre de archivo, contacto, teléfono o palabra clave. Devuelve el detalle completo (resumen, conversación, análisis IA).

⚠️ REGLA DE PERIODO (CRÍTICA — ahorro de recursos):
- **Por defecto SIEMPRE analiza únicamente el MES ACTUAL (${monthLabel})**. La herramienta query_unified_dataset usa este rango automáticamente si no envías fechas.
- SOLO especifica start_date/end_date cuando el usuario mencione explícitamente otro periodo (ej. "el mes pasado", "en marzo", "los últimos 7 días", "el 2025", "entre el 1 y 15", "ayer").
- En tus respuestas SIEMPRE indica el periodo analizado al inicio. Ejemplo:
  "📅 En **${monthLabel}** tenemos **XX interacciones por cancelación**. Los motivos son: ..."
- Si el usuario pregunta algo abierto como "¿cuántas cancelaciones hay?", responde con el dato del mes actual + desglose por motivo.

REGLAS CRÍTICAS:
1. **SIEMPRE considera AMBOS canales** salvo que el usuario pida solo uno. Nunca des respuesta basada en un solo frente si el otro tiene datos.
2. Para preguntas GENERALES/AGREGADAS → usa query_unified_dataset SIN filtro de canal y desglosa por canal.
3. Estructura recomendada:
   - **📅 Periodo analizado** (ej. mayo 2026)
   - **Resumen global** (totales combinados)
   - **📞 Llamadas:** métricas del canal voz
   - **💬 WhatsApp:** métricas del canal chat
   - **🔍 Comparativa / Conclusión**
4. Para preguntas UNITARIAS (ej. "¿qué pasó en la llamada de Juan Pérez?") → usa query_single_interaction.
5. Cita siempre: "Basado en X interacciones (Y llamadas + Z chats) del periodo [periodo]".
6. Convierte segundos a minutos/horas. Usa tablas markdown.
7. Responde SIEMPRE en español, formato markdown (negritas, listas, tablas, emojis 📞💬📅).
8. Si un canal no tiene datos en el periodo: "💬 WhatsApp: sin datos en ${monthLabel}". NO inventes.

${channelFilter ? `Canal preseleccionado: ${channelFilter}` : ""}
${dateFilter ? `Periodo preseleccionado: ${JSON.stringify(dateFilter)}` : ""}

Fecha actual: ${now.toISOString()}
Hoy: ${todayStart.toISOString()} | Semana: ${weekStart.toISOString()} | Mes actual: ${monthStart.toISOString()} → ${monthEnd.toISOString()}`;

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
          description: "Devuelve el dataset COMPLETO de la cuenta (Llamadas + WhatsApp) con las 26 columnas del Excel maestro. Úsalo para cualquier análisis agregado, ranking, distribución o comparativa.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["all", "call", "whatsapp"], description: "Filtra por canal. Default: all" },
              start_date: { type: "string", description: "ISO 8601 inicio. OPCIONAL — si no envías nada, se usa automáticamente el mes actual (recomendado)." },
              end_date: { type: "string", description: "ISO 8601 fin. OPCIONAL — si no envías nada, se usa fin del mes actual." },
              sentiment: { type: "string", enum: ["positivo", "negativo", "neutral"] },
              agent: { type: "string", description: "Filtro por nombre de asesor (substring, case-insensitive)" },
              motivo: { type: "string", description: "Substring para filtrar el campo 'Motivo principal' (ej. 'cancelación', 'pago', 'reclamo')." },
              limit: { type: "number", description: "Máximo de filas por canal. Por defecto 5.000. Sólo bájalo si quieres una muestra pequeña." },
            },
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "query_single_interaction",
          description: "Busca y devuelve UNA interacción específica con TODO su detalle (resumen, conversación, análisis IA, insights). Úsalo cuando el usuario pregunta por un caso puntual.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string", description: "Texto a buscar en file_name, contact_name, phone_number, ticket o resumen" },
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
        tool_choice: "required",
        temperature: 0.0,
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

    // `lean`=true → omite transcripciones e insights pesados (para agregados masivos).
    const fetchCalls = async (filters: { start?: string; end?: string; agent?: string; sentiment?: string; limit?: number; searchIds?: string[]; lean?: boolean }) => {
      const cap = Math.min(filters.limit || HARD_CAP, HARD_CAP);
      const lean = filters.lean !== false; // default true
      const selectCols = lean
        ? `id, file_name, created_at, duration_seconds, metadata, summary, sentiment,
           analyses(summary, overall_sentiment, sentiment_score, results, tags)`
        : `id, file_name, created_at, duration_seconds, metadata, summary, sentiment,
           transcriptions(full_text),
           analyses(summary, overall_sentiment, sentiment_score, results, insights, tags)`;
      const buildQ = () => {
        let q = supabase
          .from("audio_files")
          .select(selectCols)
          .eq("account_id", accountId)
          .eq("status", "completed");
        if (filters.start) q = q.gte("created_at", filters.start);
        if (filters.end) q = q.lte("created_at", filters.end);
        if (filters.searchIds && filters.searchIds.length) q = q.in("id", filters.searchIds);
        return q.order("created_at", { ascending: false });
      };

      const out: any[] = [];
      for (let from = 0; from < cap; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE - 1, cap - 1);
        const { data, error } = await buildQ().range(from, to);
        if (error) { console.error("fetchCalls page error:", error); break; }
        const batch = (data || []).filter((af: any) => Array.isArray(af.analyses) && af.analyses.length > 0);
        for (const af of batch) {
          const a = af.analyses[0];
          const md = af.metadata || {};
          out.push({
            id: af.id,
            file_name: af.file_name,
            created_at: af.created_at,
            duration_seconds: af.duration_seconds,
            agent: md.agent_name || md.user_name || (af.file_name?.includes("-") ? af.file_name.split("-")[0].trim() : "Desconocido"),
            campaign: md.campaign,
            sentiment: a.overall_sentiment,
            score: a.sentiment_score,
            summary: a.summary,
            results: a.results,
            insights: lean ? [] : a.insights,
            tags: a.tags,
            transcription: lean ? "" : (af.transcriptions?.[0]?.full_text || ""),
          });
        }
        if ((data || []).length < PAGE_SIZE) break;
      }
      return out;
    };

    const fetchWhatsapp = async (filters: { start?: string; end?: string; agent?: string; limit?: number; searchIds?: string[]; lean?: boolean }) => {
      const cap = Math.min(filters.limit || HARD_CAP, HARD_CAP);
      const lean = filters.lean !== false;
      const selectCols = lean
        ? "id, account_id, external_id, contact_name, phone_number, first_agent_name, campaign, start_date, total_messages, duracion_conversacion, status, score_general, sentiment, ticket"
        : "*";
      const buildQ = () => {
        let q = supabase
          .from("whatsapp_conversations")
          .select(selectCols)
          .eq("account_id", accountId)
          .eq("status", "analizado");
        if (filters.start) q = q.gte("start_date", filters.start);
        if (filters.end) q = q.lte("start_date", filters.end);
        if (filters.agent) q = q.ilike("first_agent_name", `%${filters.agent}%`);
        if (filters.searchIds && filters.searchIds.length) q = q.in("id", filters.searchIds);
        return q.order("start_date", { ascending: false });
      };

      const convsAll: any[] = [];
      for (let from = 0; from < cap; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE - 1, cap - 1);
        const { data, error } = await buildQ().range(from, to);
        if (error) { console.error("fetchWhatsapp page error:", error); break; }
        const batch = data || [];
        convsAll.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      const list = convsAll;
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

            // Por defecto restringimos al MES ACTUAL para acotar memoria y dar respuestas relevantes.
            const startISO = args.start_date || monthStart.toISOString();
            const endISO = args.end_date || monthEnd.toISOString();
            const periodLabel = (args.start_date || args.end_date)
              ? `${startISO.slice(0, 10)} → ${endISO.slice(0, 10)}`
              : monthLabel;

            const { data: aggregate, error: aggregateError } = await supabase.rpc("vm_general_chat_aggregate", {
              p_account_id: accountId,
              p_start_date: startISO,
              p_end_date: endISO,
              p_channel: channel,
              p_sentiment: args.sentiment || null,
              p_agent: args.agent || null,
              p_motivo: args.motivo || null,
              p_limit: perChannelLimit,
            });
            if (aggregateError) throw aggregateError;

            result = {
              period: {
                label: periodLabel,
                start: startISO,
                end: endISO,
                is_default_current_month: !args.start_date && !args.end_date,
              },
              filters_applied: {
                channel,
                sentiment: args.sentiment || null,
                agent: args.agent || null,
                motivo: args.motivo || null,
              },
              ...(aggregate || {}),
              note: (aggregate?.total_records_in_dataset || 0) > 30 ? `Se muestran 30 registros como muestra. Los agregados (summary) consideran TODO el dataset filtrado (${aggregate.total_records_in_dataset} interacciones) en el periodo ${periodLabel}.` : undefined,
            };
          } else if (toolCall.function.name === "query_single_interaction") {
            const search = String(args.search || "").trim();
            const channel = args.channel || "all";
            if (!search) {
              result = { error: "search es obligatorio" };
            } else {
              const callIds: string[] = [];
              const waIds: string[] = [];

              if (channel !== "whatsapp") {
                const { data: callMatches } = await supabase
                  .from("audio_files")
                  .select("id")
                  .eq("account_id", accountId)
                  .ilike("file_name", `%${search}%`)
                  .limit(5);
                (callMatches || []).forEach((m: any) => callIds.push(m.id));
              }
              if (channel !== "call") {
                const { data: waMatches } = await supabase
                  .from("whatsapp_conversations")
                  .select("id")
                  .eq("account_id", accountId)
                  .or(`contact_name.ilike.%${search}%,phone_number.ilike.%${search}%,ticket.ilike.%${search}%,external_id.ilike.%${search}%`)
                  .limit(5);
                (waMatches || []).forEach((m: any) => waIds.push(m.id));
              }

              const [calls, whatsapps] = await Promise.all([
                callIds.length > 0 ? fetchCalls({ searchIds: callIds, limit: 5, lean: false }) : Promise.resolve([]),
                waIds.length > 0 ? fetchWhatsapp({ searchIds: waIds, limit: 5 }) : Promise.resolve([]),
              ]);

              // Cargar mensajes para los chats encontrados
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
                note: records.length === 0 ? `No se encontró ninguna interacción que coincida con "${search}"` : undefined,
              };
            }
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
      // Fallback ultraligero: con tool_choice=required no debería ocurrir, pero evitamos cargar datasets completos.
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
          error: "No se ejecutó la herramienta de consulta. Reintenta usando query_unified_dataset para el mes actual.",
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
        max_tokens: 2000,
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
