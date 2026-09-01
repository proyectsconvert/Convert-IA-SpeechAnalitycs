// Edge function: generate-slide
// Genera el contenido de UNA slide editable a partir de un contexto del usuario
// y los datos del reporte (sourceResponse). Devuelve un objeto Slide compatible
// con el modelo EditablePresentation (schemaVersion 4) del frontend.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SLIDE_W = 1920;
const SLIDE_H = 1080;

const C = {
  navy: "#0F172A",
  white: "#FFFFFF",
  blue: "#3B82F6",
  blueLight: "#60A5FA",
  slate700: "#334155",
  slate500: "#64748B",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  red: "#DC2626",
  green: "#10B981",
  greenLight: "#ECFDF5",
  amber: "#D97706",
};

interface SlideElement {
  id: string;
  type: "text" | "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  // text
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  // shape
  shape?: "rect" | "roundRect" | "ellipse";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

const uid = () =>
  `el_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

function fallbackSlide(
  title: string,
  body: string,
  bullets: string[],
): SlideElement[] {
  const els: SlideElement[] = [
    {
      id: uid(),
      type: "text",
      x: 80,
      y: 80,
      w: 1760,
      h: 90,
      text: title,
      fontSize: 56,
      fontWeight: 800,
      color: C.navy,
      align: "left",
    },
    {
      id: uid(),
      type: "shape",
      x: 80,
      y: 180,
      w: 180,
      h: 6,
      shape: "rect",
      fill: C.blue,
    },
  ];

  if (body) {
    els.push({
      id: uid(),
      type: "text",
      x: 80,
      y: 230,
      w: 1760,
      h: 200,
      text: body,
      fontSize: 28,
      fontWeight: 400,
      color: C.slate700,
      align: "left",
      valign: "top",
      lineHeight: 1.5,
    });
  }

  if (bullets?.length) {
    const startY = body ? 460 : 260;
    const rowH = 100;
    bullets.slice(0, 5).forEach((b, i) => {
      const y = startY + i * (rowH + 16);
      els.push(
        {
          id: uid(),
          type: "shape",
          x: 80,
          y,
          w: 1760,
          h: rowH,
          shape: "roundRect",
          fill: C.slate50,
          radius: 12,
          stroke: C.slate200,
          strokeWidth: 1,
        },
        {
          id: uid(),
          type: "text",
          x: 110,
          y: y + 18,
          w: 60,
          h: 64,
          text: String(i + 1),
          fontSize: 32,
          fontWeight: 800,
          color: C.blue,
          align: "left",
        },
        {
          id: uid(),
          type: "text",
          x: 190,
          y: y + 22,
          w: 1620,
          h: 60,
          text: b,
          fontSize: 22,
          fontWeight: 500,
          color: C.navy,
          align: "left",
          valign: "middle",
          lineHeight: 1.35,
        },
      );
    });
  }

  return els;
}

interface AiSlide {
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  metric?: { value: string; label: string };
  background?: string;
}

function buildElementsFromAi(s: AiSlide): SlideElement[] {
  const bg = s.background || C.white;
  const onDark = bg === C.navy || bg.toLowerCase() === "#0f172a";
  const titleColor = onDark ? C.white : C.navy;
  const subColor = onDark ? "#94A3B8" : C.slate500;
  const bodyColor = onDark ? "#CBD5E1" : C.slate700;

  const els: SlideElement[] = [
    {
      id: uid(),
      type: "text",
      x: 80,
      y: 80,
      w: 1760,
      h: 100,
      text: s.title || "Nueva diapositiva",
      fontSize: 56,
      fontWeight: 800,
      color: titleColor,
      align: "left",
    },
    {
      id: uid(),
      type: "shape",
      x: 80,
      y: 190,
      w: 180,
      h: 6,
      shape: "rect",
      fill: C.blue,
    },
  ];

  let cursorY = 230;

  if (s.subtitle) {
    els.push({
      id: uid(),
      type: "text",
      x: 80,
      y: cursorY,
      w: 1760,
      h: 60,
      text: s.subtitle,
      fontSize: 26,
      fontWeight: 500,
      color: subColor,
      align: "left",
    });
    cursorY += 80;
  }

  if (s.metric?.value) {
    els.push(
      {
        id: uid(),
        type: "text",
        x: 80,
        y: cursorY,
        w: 800,
        h: 220,
        text: s.metric.value,
        fontSize: 180,
        fontWeight: 800,
        color: C.blue,
        align: "left",
      },
      {
        id: uid(),
        type: "text",
        x: 80,
        y: cursorY + 230,
        w: 800,
        h: 60,
        text: s.metric.label || "",
        fontSize: 22,
        fontWeight: 500,
        color: subColor,
        align: "left",
      },
    );
  }

  const textX = s.metric?.value ? 920 : 80;
  const textW = s.metric?.value ? 920 : 1760;

  if (s.body) {
    els.push({
      id: uid(),
      type: "text",
      x: textX,
      y: cursorY,
      w: textW,
      h: 240,
      text: s.body,
      fontSize: 26,
      fontWeight: 400,
      color: bodyColor,
      align: "left",
      valign: "top",
      lineHeight: 1.5,
    });
    if (!s.metric?.value) cursorY += 260;
  }

  if (s.bullets?.length) {
    const bulletStartY = s.metric?.value
      ? cursorY + 280
      : s.body
        ? cursorY
        : cursorY;
    const rowH = 96;
    const maxBullets = Math.min(s.bullets.length, 5);
    s.bullets.slice(0, maxBullets).forEach((b, i) => {
      const y = bulletStartY + i * (rowH + 14);
      if (y + rowH > SLIDE_H - 40) return;
      els.push(
        {
          id: uid(),
          type: "shape",
          x: 80,
          y,
          w: 1760,
          h: rowH,
          shape: "roundRect",
          fill: onDark ? "#1E293B" : C.slate50,
          radius: 12,
          stroke: onDark ? "#334155" : C.slate200,
          strokeWidth: 1,
        },
        {
          id: uid(),
          type: "text",
          x: 110,
          y: y + 18,
          w: 60,
          h: 60,
          text: String(i + 1),
          fontSize: 30,
          fontWeight: 800,
          color: C.blue,
          align: "left",
        },
        {
          id: uid(),
          type: "text",
          x: 190,
          y: y + 22,
          w: 1620,
          h: 56,
          text: b,
          fontSize: 22,
          fontWeight: 500,
          color: titleColor,
          align: "left",
          valign: "middle",
          lineHeight: 1.35,
        },
      );
    });
  }

  return els;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for usage tracking + limit checks (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const userContext: string = String(body?.context ?? "").trim();
    const sourceResponse = body?.sourceResponse ?? null;
    const presentationTitle: string = String(body?.presentationTitle ?? "");
    const accountId: string | null = body?.accountId ? String(body.accountId) : null;

    // Verify chatbot/AI limit before invoking the model
    if (accountId) {
      const { data: limitOk, error: limitErr } = await supabaseAdmin.rpc(
        "check_account_limits",
        { p_account_id: accountId, p_check_type: "chatbot" },
      );
      if (limitErr) console.error("check_account_limits error:", limitErr);
      if (limitOk === false) {
        return new Response(
          JSON.stringify({
            error:
              "Has alcanzado el límite de consultas IA del mes. No se pueden generar más slides con IA. Puedes agregar diapositivas en blanco y editarlas manualmente.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (!userContext) {
      return new Response(
        JSON.stringify({ error: "El contexto es obligatorio" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback sin IA: slide básico con el contexto como cuerpo
      const elements = fallbackSlide(
        userContext.split("\n")[0].slice(0, 80) || "Nueva diapositiva",
        userContext,
        [],
      );
      return new Response(
        JSON.stringify({ slide: { background: C.white, elements } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Compactar el contexto del reporte para no saturar el prompt
    let dataDigest = "";
    if (sourceResponse?.meta && sourceResponse?.stats) {
      const m = sourceResponse.meta;
      const s = sourceResponse.stats;
      const a = sourceResponse.analysis ?? {};
      dataDigest = JSON.stringify(
        {
          rangoFechas: m.dateRange,
          interaccionesAnalizadas: m.rowsAnalyzed,
          fuente: m.source?.mode,
          porCanal: (s.by_canal ?? []).slice(0, 6),
          porAsesor: (s.by_asesor ?? []).slice(0, 6),
          porPromesa: (s.by_promesa_pago ?? []).slice(0, 6),
          resumen: a.executive_summary?.narrative,
          metricasClave: (a.key_metrics ?? [])
            .slice(0, 6)
            .map((k: { label: string; value: string }) => ({
              label: k.label,
              value: k.value,
            })),
          hallazgoCritico: a.critical_finding
            ? {
                titulo: a.critical_finding.title,
                stat: a.critical_finding.statistic,
              }
            : undefined,
          recomendaciones: (a.recommendations ?? [])
            .slice(0, 4)
            .map((r: { title: string }) => r.title),
        },
        null,
        0,
      ).slice(0, 6000);
    }

    const systemPrompt = `Eres un diseñador de presentaciones ejecutivas en español. Generas UNA diapositiva concisa, accionable y visualmente clara basada en datos reales del reporte.

REGLAS:
- Responde SOLO llamando la función emit_slide.
- Usa texto en ESPAÑOL, profesional, sin jerga técnica.
- Título corto (máx 60 chars). Subtítulo opcional (máx 90 chars).
- Si el contexto pide una métrica destacada, úsala en el campo "metric".
- "bullets" deben ser frases accionables (máx 80 chars cada una, máx 5 ítems).
- "body" es opcional, máximo 320 caracteres.
- Si el usuario pide un fondo oscuro o portada, usa background "#0F172A". Sino "#FFFFFF".
- Basa los números/datos ESTRICTAMENTE en el digest del reporte. No inventes cifras.`;

    const userPrompt = `CONTEXTO DEL USUARIO PARA LA NUEVA DIAPOSITIVA:
"""
${userContext}
"""

PRESENTACIÓN ACTUAL: ${presentationTitle || "Reporte ejecutivo"}

DIGEST DE DATOS DEL REPORTE (úsalo como única fuente de verdad):
${dataDigest || "(sin datos del reporte disponibles, usa solo el contexto)"}

Genera la diapositiva ahora.`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_slide",
                description: "Devuelve el contenido estructurado de una diapositiva.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    subtitle: { type: "string" },
                    body: { type: "string" },
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                    },
                    metric: {
                      type: "object",
                      properties: {
                        value: { type: "string" },
                        label: { type: "string" },
                      },
                      required: ["value", "label"],
                      additionalProperties: false,
                    },
                    background: {
                      type: "string",
                      enum: ["#FFFFFF", "#0F172A"],
                    },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "emit_slide" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Se agotaron los créditos de IA. Recarga en Configuración para continuar.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      // Fallback graceful
      const elements = fallbackSlide(
        userContext.split("\n")[0].slice(0, 80) || "Nueva diapositiva",
        userContext,
        [],
      );
      return new Response(
        JSON.stringify({ slide: { background: C.white, elements } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let slideData: AiSlide | null = null;
    if (toolCall?.function?.arguments) {
      try {
        slideData = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.warn("Failed to parse tool args:", e);
      }
    }

    if (!slideData?.title) {
      const elements = fallbackSlide(
        userContext.split("\n")[0].slice(0, 80) || "Nueva diapositiva",
        userContext,
        [],
      );
      if (accountId) {
        const { error: incErr } = await supabaseAdmin.rpc("increment_usage", {
          p_account_id: accountId,
          p_chatbot_queries: 1,
        });
        if (incErr) console.error("increment_usage error:", incErr);
      }
      return new Response(
        JSON.stringify({ slide: { background: C.white, elements } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const elements = buildElementsFromAi(slideData);
    const background = slideData.background || C.white;

    // Increment AI usage: 1 credit per generated slide
    if (accountId) {
      const { error: incErr } = await supabaseAdmin.rpc("increment_usage", {
        p_account_id: accountId,
        p_chatbot_queries: 1,
      });
      if (incErr) console.error("increment_usage error:", incErr);
    }

    return new Response(
      JSON.stringify({ slide: { background, elements } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-slide error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
