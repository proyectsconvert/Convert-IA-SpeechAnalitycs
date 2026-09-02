// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  account_id: string;
  source_type: "call" | "whatsapp";
  audio_file_id?: string;
  whatsapp_conversation_id?: string;
  agent_name?: string | null;
  conversation_text: string;
  quality_matrix_id?: string | null;
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    if (!body?.account_id || !body?.source_type || !body?.conversation_text) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Obtener la versión de matriz a evaluar:
    // Si viene quality_matrix_id explícito, usarlo; si no, buscar la matriz is_default de la cuenta,
    // y fallback a is_active.
    let versionId: string | null = null;
    if (body.quality_matrix_id) {
      const { data: explicitVersion } = await supabase
        .from("quality_matrix_versions")
        .select("id")
        .eq("id", body.quality_matrix_id)
        .eq("account_id", body.account_id)
        .maybeSingle();
      if (explicitVersion) versionId = explicitVersion.id;
    }

    if (!versionId) {
      const { data: defaultVersion } = await supabase
        .from("quality_matrix_versions")
        .select("id")
        .eq("account_id", body.account_id)
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (defaultVersion) {
        versionId = defaultVersion.id;
      } else {
        const { data: activeVersion } = await supabase
          .from("quality_matrix_versions")
          .select("id")
          .eq("account_id", body.account_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeVersion) versionId = activeVersion.id;
      }
    }

    if (!versionId) {
      return new Response(JSON.stringify({ skipped: "no_active_matrix" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Items activos
    const { data: sections } = await supabase
      .from("quality_matrix_sections")
      .select("id,name,kind,sort_order, quality_matrix_items(id,attribute,sub_attribute,description,max_score,affectation,is_active,sort_order)")
      .eq("version_id", versionId)
      .order("sort_order", { ascending: true });

    const itemList: any[] = [];
    (sections ?? []).forEach((s: any) => {
      (s.quality_matrix_items ?? [])
        .filter((it: any) => it.is_active)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .forEach((it: any) => itemList.push({ ...it, section_name: s.name, kind: s.kind }));
    });

    if (itemList.length === 0) {
      return new Response(JSON.stringify({ skipped: "empty_matrix" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Construir prompt para el modelo
    const itemsForPrompt = itemList.map((it, idx) => ({
      idx,
      seccion: it.section_name,
      atributo: it.attribute,
      sub_atributo: it.sub_attribute || null,
      descripcion: it.description,
      puntaje_maximo: Number(it.max_score) || 0,
      tipo: it.kind === "critical" ? "ERROR_CRITICO" : (it.affectation || "none"),
    }));

    const transcriptTrimmed = body.conversation_text.length > 18000
      ? body.conversation_text.slice(0, 18000) + "\n...[TRUNCADO]"
      : body.conversation_text;

    const systemPrompt = `Eres un evaluador experto de calidad de interacciones (llamadas y WhatsApp). Tu tarea es calificar UNA interacción contra una matriz de calidad y devolver SOLO JSON válido.

Reglas:
- Cada item tiene un tipo ("REGULAR" o "ERROR_CRITICO") y un puntaje_maximo.
- Para cada item: status ∈ {"cumple", "no_cumple", "na", "critico"}.
- Si el agente cumple el criterio satisfactoriamente → status="cumple", score=puntaje_maximo.
- Si el agente NO cumple el criterio → status="no_cumple", score=0.
- Si en un item tipo ERROR_CRITICO el agente incurre en la falta o incumplimiento → status="critico" o "no_cumple", score=0.
- Si el criterio no aplica en la interacción → status="na", score=0 y explica brevemente en la observación.
- Observación: 1-2 oraciones citando evidencia textual del agente o cliente cuando aplique.
- NO inventes evidencia. Si la transcripción no es clara o no se evidencia el aspecto, usa "na".

Devuelve SOLO este JSON:
{
  "summary": "string corto (<=400 chars)",
  "items": [{"idx": number, "status": "cumple"|"no_cumple"|"na"|"critico", "score": number, "observation": "string"}]
}`;

    const userPrompt = `MATRIZ:\n${JSON.stringify(itemsForPrompt)}\n\nTRANSCRIPCIÓN/MENSAJES:\n${transcriptTrimmed}`;

    // 4. Llamar OpenAI directamente
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "ai_failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const itemsResp: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const respByIdx = new Map(itemsResp.map((r: any) => [Number(r.idx), r]));

    // 5. Calcular totales y armar inserts
    let totalScore = 0;
    let maxTotal = 0;
    let hasCritical = false;

    const evalItems = itemList.map((it, idx) => {
      const r = respByIdx.get(idx) || {};
      const isCritical = it.kind === "critical" || it.affectation === "critico";
      const max = Number(it.max_score) || 0;
      let status = String(r.status || "na").toLowerCase();
      let score = 0;

      if (status === "cumple") {
        score = max;
      } else if (status === "no_cumple" || status === "critico") {
        score = 0;
        if (isCritical) {
          hasCritical = true;
          status = "critico";
        }
      } else {
        status = "na";
        score = 0;
      }

      maxTotal += max;
      totalScore += score;

      return {
        item_id: it.id,
        section_name: it.section_name,
        attribute: it.attribute,
        sub_attribute: it.sub_attribute,
        affectation: isCritical ? "critico" : it.affectation,
        status,
        score,
        max_score: max,
        observation: String(r.observation || "").slice(0, 1000),
      };
    });

    // Si hubo falla crítica, la calificación total y porcentaje quedan en 0 automáticamente
    let percent = maxTotal > 0 ? Math.round((totalScore / maxTotal) * 1000) / 10 : (hasCritical ? 0 : 100);
    if (hasCritical) {
      percent = 0;
      totalScore = 0;
    }

    // 6. Insertar evaluación
    const { data: evalRow, error: evalErr } = await supabase
      .from("quality_evaluations")
      .insert({
        account_id: body.account_id,
        matrix_version_id: versionId,
        source_type: body.source_type,
        audio_file_id: body.source_type === "call" ? body.audio_file_id : null,
        whatsapp_conversation_id: body.source_type === "whatsapp" ? body.whatsapp_conversation_id : null,
        agent_name: body.agent_name || null,
        total_score: totalScore,
        max_total_score: maxTotal,
        percent_score: percent,
        has_critical_error: hasCritical,
        summary: String(parsed.summary || "").slice(0, 800),
      })
      .select("id")
      .single();

    if (evalErr) throw evalErr;

    const inserts = evalItems.map((it) => ({ ...it, evaluation_id: evalRow.id }));
    const { error: itemsErr } = await supabase.from("quality_evaluation_items").insert(inserts);
    if (itemsErr) throw itemsErr;

    return new Response(
      JSON.stringify({ success: true, evaluation_id: evalRow.id, percent_score: percent, has_critical_error: hasCritical }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("evaluate-quality error:", err);
    return new Response(JSON.stringify({ error: err?.message || "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
