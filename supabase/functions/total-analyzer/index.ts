// total-analyzer (v2) — agregación en servidor + samples + schema estricto multi-macroproceso.
// El cliente envía las columnas del Excel maestro y aquí calculamos todas
// las cifras antes de pasarle al LLM según el macroproceso de la cuenta.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Row = {
  canal?: string;
  archivo?: string;
  fecha?: string;
  duracion_segundos?: number;
  duracion_Minutos?: number;
  duracion_Horas?: number;
  mensajes?: number | null;
  sentimiento?: string;
  score_0_1?: number;
  score_pct?: number;
  conversación?: string;
  "resumen de la llamada y/o de la conversacion"?: string;
  "Análisis según Prompt"?: string;
  "Puntos Positivos"?: string;
  "Puntos Negativos"?: string;
  Oportunidades?: string;
  Insights?: string;
  Conclusiones?: string;
  Recomendaciones?: string;
  "Atribución responsabilidad"?: string;
  "Promesa de pago"?: string;
  "Estado pago (detalle)"?: string;
  "Motivo principal"?: string;
  "ext_Nombre Asesor"?: string;
  "ext_Nombre Campaña"?: string;
  ext_fecha?: string;
  [k: string]: unknown;
};

type Source = {
  mode?: "master" | "upload";
  activeFilters?: Record<string, unknown>;
  totalRowsBeforeFilter?: number;
  fileName?: string;
  fileSize?: number;
};

type RequestBody = {
  accountId?: string;
  macroproceso?: string;
  dateRange?: string;
  customInstructions?: string;
  rows: Row[];
  source?: Source;
};

// ---------------------------------------------------------------------------
// Agregación determinista
// ---------------------------------------------------------------------------

const norm = (v: unknown): string => {
  const s = (v ?? "").toString().trim();
  return s || "(vacío)";
};

function countBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: rows.length ? +((count / rows.length) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function numStats(vals: number[]) {
  const xs = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return {
    n: xs.length,
    sum: +sum.toFixed(2),
    mean: +(sum / xs.length).toFixed(2),
    median: +median.toFixed(2),
    min: +xs[0].toFixed(2),
    max: +xs[xs.length - 1].toFixed(2),
  };
}

function crosstab<T>(rows: T[], rowKey: (r: T) => string, colKey: (r: T) => string) {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const rk = rowKey(r);
    const ck = colKey(r);
    (out[rk] ??= {})[ck] = (out[rk]?.[ck] ?? 0) + 1;
  }
  return out;
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function aggregate(rows: Row[]) {
  const total = rows.length;
  const asesor = (r: Row) => norm(r["ext_Nombre Asesor"] ?? r.ext_Nombre_Asesor);
  const campania = (r: Row) => norm(r["ext_Nombre Campaña"] ?? r.ext_Nombre_Campaña);
  const canal = (r: Row) => norm(r.canal);

  const byAsesor = countBy(rows, asesor).slice(0, 20);

  return {
    total,
    by_canal: countBy(rows, canal),
    by_sentimiento: countBy(rows, (r) => norm(r.sentimiento)),
    by_promesa_pago: countBy(rows, (r) => norm(r["Promesa de pago"])),
    by_motivo_principal: countBy(rows, (r) => norm(r["Motivo principal"])).slice(0, 12),
    by_atribucion_responsabilidad: countBy(rows, (r) => norm(r["Atribución responsabilidad"])),
    by_estado_pago: countBy(rows, (r) => norm(r["Estado pago (detalle)"])),
    by_asesor: byAsesor,
    by_campania: countBy(rows, campania).slice(0, 12),
    canal_x_sentimiento: crosstab(rows, canal, (r) => norm(r.sentimiento)),
    canal_x_promesa: crosstab(rows, canal, (r) => norm(r["Promesa de pago"])),
    duracion_min_global: numStats(rows.map((r) => asNumber(r.duracion_Minutos))),
    duracion_min_por_canal: Object.fromEntries(
      [...new Set(rows.map(canal))].map((c) => [
        c,
        numStats(rows.filter((r) => canal(r) === c).map((r) => asNumber(r.duracion_Minutos))),
      ]),
    ),
    score_global: numStats(
      rows.map((r) => {
        const s = asNumber(r.score_0_1 ?? r.score_pct);
        return s <= 1 ? s * 100 : s;
      }),
    ),
    score_por_canal: Object.fromEntries(
      [...new Set(rows.map(canal))].map((c) => [
        c,
        numStats(
          rows
            .filter((r) => canal(r) === c)
            .map((r) => {
              const s = asNumber(r.score_0_1 ?? r.score_pct);
              return s <= 1 ? s * 100 : s;
            }),
        ),
      ]),
    ),
    nulls: {
      sin_asesor: rows.filter((r) => !r["ext_Nombre Asesor"] && !r.ext_Nombre_Asesor).length,
      sin_campania: rows.filter((r) => !r["ext_Nombre Campaña"] && !r.ext_Nombre_Campaña).length,
      sin_resumen: rows.filter((r) => !r["resumen de la llamada y/o de la conversacion"]).length,
      sin_score: rows.filter((r) => r.score_0_1 == null && r.score_pct == null).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Selección de muestras representativas
// ---------------------------------------------------------------------------

function pickSamples(rows: Row[], maxTotal = 15) {
  const buckets: Record<string, Row[]> = {
    pos: rows.filter((r) => (r.sentimiento ?? "").toLowerCase().includes("pos")),
    neg: rows.filter((r) => (r.sentimiento ?? "").toLowerCase().includes("neg")),
    neu: rows.filter((r) => (r.sentimiento ?? "").toLowerCase().includes("neu")),
  };

  const picked: Row[] = [];
  const takeFrom = (arr: Row[], n: number) => {
    const step = Math.max(1, Math.floor(arr.length / n));
    for (let i = 0; i < arr.length && picked.length < maxTotal && n > 0; i += step, n--) {
      picked.push(arr[i]);
    }
  };

  takeFrom(buckets.neg, 6);
  takeFrom(buckets.pos, 5);
  takeFrom(buckets.neu, 4);

  return picked.map((r) => ({
    canal: r.canal,
    asesor: r["ext_Nombre Asesor"] ?? r.ext_Nombre_Asesor,
    campaña: r["ext_Nombre Campaña"] ?? r.ext_Nombre_Campaña,
    duracion_min: r.duracion_Minutos,
    sentimiento: r.sentimiento,
    score: r.score_0_1 ?? r.score_pct,
    motivo: r["Motivo principal"],
    promesa_pago: r["Promesa de pago"],
    resumen: r["resumen de la llamada y/o de la conversacion"],
    analisis: r["Análisis según Prompt"],
    puntos_positivos: r["Puntos Positivos"],
    puntos_negativos: r["Puntos Negativos"],
    oportunidades: r.Oportunidades,
    insights: r.Insights,
  }));
}

// ---------------------------------------------------------------------------
// Schema estricto de salida
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "executive_summary",
    "key_metrics",
    "channel_analysis",
    "critical_finding",
    "advisor_analysis",
    "positive_points",
    "improvement_opportunities",
    "highlighted_cases",
    "recommendations",
    "roadmap_90_days",
  ],
  properties: {
    executive_summary: {
      type: "object",
      required: ["narrative", "headline_stats"],
      properties: {
        narrative: { type: "string" },
        headline_stats: {
          type: "array",
          minItems: 3,
          maxItems: 4,
          items: {
            type: "object",
            required: ["label", "value"],
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              context: { type: "string" },
            },
          },
        },
      },
    },
    key_metrics: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        required: ["name", "value", "context"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          context: { type: "string" },
          benchmark: { type: "string" },
        },
      },
    },
    channel_analysis: {
      type: "object",
      required: ["insight"],
      properties: {
        insight: { type: "string" },
        breakdown: { type: "object" },
      },
    },
    critical_finding: {
      type: "object",
      required: ["title", "statistic", "detail"],
      properties: {
        title: { type: "string" },
        statistic: { type: "string" },
        detail: { type: "string" },
      },
    },
    advisor_analysis: {
      type: "object",
      required: ["top_load_pct", "observations"],
      properties: {
        top_load_pct: { type: "string" },
        observations: { type: "array", items: { type: "string" } },
      },
    },
    positive_points: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        required: ["title", "detail"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    improvement_opportunities: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        required: ["priority", "title", "detail", "evidence"],
        properties: {
          priority: { type: "string", enum: ["CRÍTICO", "ALTO", "MEDIO"] },
          title: { type: "string" },
          detail: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    highlighted_cases: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        required: ["tag", "title", "body", "lesson"],
        properties: {
          tag: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          lesson: { type: "string" },
        },
      },
    },
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        required: ["title", "detail", "impact", "effort"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          impact: { type: "string", enum: ["Alto", "Medio", "Bajo"] },
          effort: { type: "string", enum: ["Alto", "Medio", "Bajo"] },
        },
      },
    },
    roadmap_90_days: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        required: ["phase", "focus", "items"],
        properties: {
          phase: { type: "string", enum: ["0-30 días", "30-60 días", "60-90 días"] },
          focus: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Prompt builder multi-macroproceso
// ---------------------------------------------------------------------------

const MACROPROCESO_DOMAINS: Record<string, string> = {
  ventas: "ventas comerciales (conversión, manejo de objeciones, propuesta de valor, cierre comercial y venta cruzada/upselling). NUNCA asumas cobranza.",
  servicio_cliente: "servicio al cliente y atención (resolución en primer contacto, empatía, claridad en la información, tiempos de espera y satisfacción CSAT). NUNCA asumas cobranza.",
  cobranza: "cobranza y recuperación de cartera (acuerdos de pago, detección de motivos de no pago, negociación y seguimiento).",
  soporte_tecnico: "soporte técnico (diagnóstico eficiente, solución de fallas, guía paso a paso, escalamiento y confirmación de operatividad). NUNCA asumas cobranza.",
  retencion: "retención y fidelización de clientes (manejo de solicitudes de cancelación, detección de dolor, contraofertas efectivas y salvamento de clientes). NUNCA asumas cobranza.",
  agendamiento: "agendamiento y coordinación de citas/visitas (confirmación de datos, verificación de disponibilidad, recordatorios y reprogramación). NUNCA asumas cobranza.",
  prospeccion: "prospección y generación de leads (calificación de prospectos, identificación de decisores, pitch de interés y agendamiento de demos). NUNCA asumas cobranza.",
  encuestas: "encuestas y sondeos de satisfacción (captura de retroalimentación, aplicación del cuestionario, neutralidad y categorización de opiniones). NUNCA asumas cobranza.",
  postventa: "gestión postventa y onboarding (acompañamiento posterior a la compra, uso de producto, resolución de dudas iniciales y satisfacción). NUNCA asumas cobranza.",
  pqrs_backoffice: "gestión de PQRS y requerimientos formales de backoffice (registro formal, tiempos de respuesta SLA, apego normativo y trazabilidad). NUNCA asumas cobranza.",
};

function buildPrompt(args: {
  dateRange: string;
  macroproceso: string;
  customInstructions: string;
  source: Source | undefined;
  stats: unknown;
  samples: unknown;
  schema: unknown;
}): string {
  const { dateRange, macroproceso, customInstructions, source, stats, samples, schema } = args;
  const sourceLabel =
    source?.mode === "upload"
      ? `Excel subido: ${source.fileName ?? "archivo.xlsx"}`
      : `Datos Maestros filtrados${source?.totalRowsBeforeFilter ? ` (de ${source.totalRowsBeforeFilter} totales)` : ""}`;

  const domainDescription = MACROPROCESO_DOMAINS[macroproceso] || `gestión de ${macroproceso} y customer experience`;

  return [
    `# Tarea`,
    `Eres un consultor BI senior especializado en ${domainDescription}.`,
    `Analiza el dataset enfocado rigurosamente en la operación de ${macroproceso.toUpperCase()} y produce un reporte ejecutivo estructurado según el schema JSON al final.`,
    ``,
    `# Contexto de la Operación`,
    `Tipo de Macroproceso: ${macroproceso.toUpperCase()}`,
    `Enfoque del análisis: ${domainDescription}`,
    `Origen: ${sourceLabel}`,
    `Rango de fechas: ${dateRange || "(no informado)"}`,
    customInstructions ? `Instrucciones del negocio:\n${customInstructions}` : `Instrucciones del negocio: (ninguna)`,
    ``,
    `# Datos cuantitativos (YA calculados — NO recalcular ni inventar)`,
    "```json",
    JSON.stringify(stats, null, 2),
    "```",
    ``,
    `# Muestras cualitativas (subset representativo de conversaciones)`,
    `Úsalas para extraer patrones, casos destacados y evidencia textual del proceso de ${macroproceso}. Cita frases entre comillas`,
    `cuando sean reveladoras (objeciones, solicitudes, acuerdos, motivos, fricciones del cliente).`,
    "```json",
    JSON.stringify(samples, null, 2),
    "```",
    ``,
    `# Instrucciones`,
    `- **executive_summary.narrative**: 4-6 oraciones conectando hallazgos numéricos con patrones de las conversaciones en el contexto de ${macroproceso}.`,
    `- **executive_summary.headline_stats**: 3-4 cifras de mayor impacto extraídas de \`stats\`.`,
    `- **key_metrics**: 4-8 métricas distintas con contexto explicativo relevante a la operación de ${macroproceso}.`,
    `- **channel_analysis**: compara canales (voz vs WhatsApp) usando \`canal_x_sentimiento\`, duraciones y volúmenes.`,
    `- **critical_finding**: el hallazgo único que más mueve la aguja del negocio en ${macroproceso}. Concreto, con cifra.`,
    `- **advisor_analysis**: distribución de carga por asesor + observaciones de desempeño en ${macroproceso}.`,
    `- **positive_points**: qué funciona HOY en la gestión de ${macroproceso}, con evidencia textual de las samples.`,
    `- **improvement_opportunities**: 4-6 items con prioridad explícita y evidencia citada enfocada en optimizar ${macroproceso}.`,
    `- **highlighted_cases**: 2-4 conversaciones de \`samples\` que ilustran patrones clave de la operación.`,
    `- **recommendations**: 3-6 acciones concretas de impacto/esfuerzo para mejorar los resultados de ${macroproceso}.`,
    `- **roadmap_90_days**: tres fases secuenciadas (0-30, 30-60, 60-90 días) con foco operativo claro.`,
    ``,
    `# Reglas inviolables`,
    `1. NUNCA asumas Cobranza si el macroproceso no es 'cobranza'. Adapta el lenguaje a la naturaleza de ${macroproceso}.`,
    `2. NO inventes cifras. Solo usa las de \`stats\`. Cualquier número en tu output debe ser citado o derivable.`,
    `3. Si una categoría tiene n<3 en \`stats\`, llámalo "observación puntual" no "patrón".`,
    `4. Si \`stats.nulls\` muestra muchos vacíos, mencionarlo en advisor_analysis u opportunities.`,
    `5. Español neutro, tono ejecutivo, sin jerga técnica innecesaria. NO uses markdown.`,
    `6. Responde EXCLUSIVAMENTE con JSON válido conforme al schema.`,
    ``,
    `# Schema de salida (responde EXACTAMENTE con esta forma)`,
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const { rows, accountId, macroproceso = "ventas", dateRange, customInstructions, source } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Body must include non-empty `rows` array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("Missing OpenAI API Key");

    console.log(`[total-analyzer v2] account=${accountId} macroproceso=${macroproceso} rows=${rows.length} mode=${source?.mode ?? "master"}`);

    const stats = aggregate(rows);
    const samples = pickSamples(rows);
    const userPrompt = buildPrompt({
      dateRange: dateRange ?? "",
      macroproceso,
      customInstructions: customInstructions ?? "",
      source,
      stats,
      samples,
      schema: OUTPUT_SCHEMA,
    });

    const domainDescription = MACROPROCESO_DOMAINS[macroproceso] || `gestión de ${macroproceso} y customer experience`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              `Eres un consultor BI senior especializado en ${domainDescription}. Hablas español neutro y profesional.`,
              "Reglas inviolables:",
              `1. Adapta todo tu análisis a la naturaleza del proceso '${macroproceso.toUpperCase()}'. No asumas cobranza a menos que el macroproceso sea cobranza.`,
              "2. NO calcules ni inventes cifras. Todas las cifras vienen en `stats`. Cítalas tal cual.",
              "3. Para insights cualitativos (patrones, lecciones, casos) usa `samples`. Cita frases textuales cuando aporte.",
              "4. Si una categoría tiene pocos casos (<3), NO generalices; dilo como observación, no como conclusión.",
              "5. Responde EXCLUSIVAMENTE con JSON válido conforme al `schema` que recibes. Sin markdown, sin prosa externa.",
            ].join("\n"),
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text();
      console.error("OpenAI error:", aiResp.status, err);
      throw new Error(`OpenAI API error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices[0].message.content;
    const parsed = JSON.parse(raw);

    for (const k of OUTPUT_SCHEMA.required) {
      if (!(k in parsed)) throw new Error(`Respuesta IA incompleta: falta '${k}'`);
    }

    return new Response(
      JSON.stringify({
        meta: {
          accountId,
          macroproceso,
          dateRange,
          rowsAnalyzed: rows.length,
          generatedAt: new Date().toISOString(),
          source: source ?? { mode: "master" },
        },
        stats,
        analysis: parsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error in total-analyzer:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
