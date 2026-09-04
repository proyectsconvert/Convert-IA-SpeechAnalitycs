import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";

export type AtribucionResponsabilidad = "Cliente" | "Asesor" | "No aplica";

type RowExt = AnalizadorUnifiedRow & Record<string, unknown>;

function getMergedRecord(row: RowExt): Record<string, unknown> {
  const base =
    row.results && typeof row.results === "object" && !Array.isArray(row.results)
      ? ({ ...(row.results as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const summary = String(row.summary ?? "").trim();
  if (summary.startsWith("{")) {
    try {
      Object.assign(base, JSON.parse(summary) as Record<string, unknown>);
    } catch {
      /* no es JSON */
    }
  }

  const an = base.analysis;
  if (typeof an === "string" && an.trim().startsWith("{")) {
    try {
      Object.assign(base, JSON.parse(an.trim()) as Record<string, unknown>);
    } catch {
      /* no es JSON */
    }
  }

  return base;
}

function pickExplicitResponsabilidad(row: RowExt, merged: Record<string, unknown>): string | null {
  // 1. Direct property in row if already explicitly assigned and valid
  const directAtrib = row.atribucion_responsabilidad;
  if (directAtrib && typeof directAtrib === "string" && directAtrib.trim() !== "") {
    const d = directAtrib.trim().toLowerCase();
    if (!/^(otros|otro|sin informaci[oó]n|sin clasificar|operaci[oó]n|sin contacto)$/i.test(d)) {
      return directAtrib.trim();
    }
  }

  // 2. Look in merged analysis results
  for (const k of Object.keys(merged)) {
    const kl = k.toLowerCase();
    if (
      (kl.includes("responsabilidad") ||
        kl.includes("atribuci") ||
        kl.includes("culpabilidad") ||
        kl === "responsable_error") &&
      merged[k] != null &&
      String(merged[k]).trim() !== ""
    ) {
      const v = String(merged[k]).trim();
      if (!/^(otros|otro|sin informaci[oó]n|sin clasificar)$/i.test(v)) {
        return v;
      }
    }
  }

  // 3. Look in ext_ columns
  const extIds = Object.keys(row).filter((k) => k.startsWith("ext_"));
  for (const k of extIds) {
    if (/responsabilidad|atribuci/i.test(k) && row[k] != null && String(row[k]).trim() !== "") {
      const v = String(row[k]).trim();
      if (!/^(otros|otro|sin informaci[oó]n|sin clasificar)$/i.test(v)) {
        return v;
      }
    }
  }

  return null;
}

function normalizeExplicitValue(val: string): AtribucionResponsabilidad | null {
  const v = val.toLowerCase().trim();
  if (/no aplica|n\/a|ningun[oa]?|sin error|no hubo error/i.test(v)) {
    return "No aplica";
  }
  if (/asesor|agente|ejecutivo|operador|empresa/i.test(v)) {
    return "Asesor";
  }
  if (/cliente|usuario|titular/i.test(v)) {
    return "Cliente";
  }
  return null;
}

/**
 * Resuelve la atribución de responsabilidad de la interacción:
 * - Si hubo un error del asesor (protocolo, mala atención, corte, información errónea) -> "Asesor"
 * - Si hubo una falla o conducta negativa del cliente (cuelgue abrupto, agresividad, rechazo, no titular) -> "Cliente"
 * - Si no hubo error o no aplica (llamada exitosa, buzón, normal sin incidentes) -> "No aplica"
 */
export function resolveAtribucionResponsabilidad(row: RowExt): AtribucionResponsabilidad {
  const merged = getMergedRecord(row);

  // 1. Chequear si ya existe un valor explícito en los metadatos o reglas de extracción
  const explicit = pickExplicitResponsabilidad(row, merged);
  if (explicit) {
    const normalized = normalizeExplicitValue(explicit);
    if (normalized) return normalized;
  }

  // 2. Detección de casos sin interacción efectiva o buzón -> "No aplica"
  const summaryText = String(row.summary || merged.resumen || merged.resumen_ejecutivo || "").trim();
  const summaryLower = summaryText.toLowerCase();
  const isNoContact =
    /buz[oó]n de voz|llamada muda|no contesta|sin contacto efectivo|audio vac[ií]o|sin interacci[oó]n/i.test(
      summaryLower
    ) || (row.duration != null && row.duration < 5 && row.channel === "call");

  // 3. Extraer puntos negativos y hallazgos críticos
  const rawNegatives: string[] = [];
  if (Array.isArray(merged.negative)) rawNegatives.push(...merged.negative.map(String));
  else if (typeof merged.negative === "string" && merged.negative.trim()) rawNegatives.push(merged.negative);
  if (Array.isArray(merged.puntos_negativos)) rawNegatives.push(...merged.puntos_negativos.map(String));
  if (Array.isArray(merged.hallazgos_criticos)) rawNegatives.push(...merged.hallazgos_criticos.map(String));

  // Filtrar textos triviales que no constituyen un error real
  const validNegatives = rawNegatives
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        !/^(ningun[oa]?|n\/a|na|no aplica|sin observaciones|sin hallazgos|no se detect(an|aron)|no presenta puntos negativos|nada que destacar|correcto|todo en orden|sin incidentes)$/i.test(
          s
        )
    );

  const feedbackAgente = String(merged.feedback_agente || "").trim();
  const opportunities = Array.isArray(merged.opportunities)
    ? merged.opportunities.join(" ")
    : typeof merged.opportunities === "string"
      ? merged.opportunities
      : "";
  const analysisText = String(merged.analysis || merged.analysis_prompt_aligned || "").trim();
  const sentiment = String(row.sentiment || merged.sentimiento_cliente || "").toLowerCase();
  const scoreRaw = Number(row.score) || 0;
  const scorePct = scoreRaw <= 1.5 ? scoreRaw * 100 : scoreRaw;
  const protocolFailed = merged.cumplimiento_protocolo === false;

  const hasNegativeFindings = validNegatives.length > 0;
  const isNegativeSentiment = sentiment.includes("negat");
  const isLowScore = scorePct > 0 && scorePct < 65;

  // Si fue buzón o no hubo contacto, o si no hay errores ni puntos negativos ni señales adversas
  if (isNoContact) {
    return "No aplica";
  }

  if (!hasNegativeFindings && !isNegativeSentiment && !isLowScore && !protocolFailed) {
    return "No aplica";
  }

  // 4. Analizar texto para ponderar errores del Asesor vs errores del Cliente
  const corpus = [
    ...validNegatives,
    feedbackAgente,
    opportunities,
    analysisText,
    summaryText,
  ]
    .join("\n")
    .toLowerCase();

  let asesorScore = 0;
  let clienteScore = 0;

  if (protocolFailed) asesorScore += 4;

  // Patrones específicos de error atribuible al Asesor
  const asesorPatterns: RegExp[] = [
    /\b(error|falla|omisi[oó]n|incumplimiento|descuido|falta) (del?|por parte del?) (asesor|agente|ejecutivo|operador)\b/i,
    /\b(asesor|agente|ejecutivo|operador) (no cumple|no cumpli[oó]|incumpli[oó]|no valida|no valid[oó]|no saluda|no se presenta|no indaga|no ofrece|no tipifica|omite|comete un error|se equivoca|interrumpe|inadecuado|grosero|descort[eé]s|falta de empat[ií]a|desinter[eé]s)\b/i,
    /\b(falta de saludo|no se present[oó]|tiempo de espera excesivo|mala gesti[oó]n|gesti[oó]n deficiente|falla en tipificaci[oó]n|informaci[oó]n err[oó]nea proporcionada|no brind[oó] informaci[oó]n|omite informaci[oó]n)\b/i,
    /\b(el agente debi[oó]|el asesor debi[oó]|debi[oó] haber ofrecido|debi[oó] validar|desconexi[oó]n por el agente|cuelga la llamada el asesor)\b/i,
    /\b(cuelga al cliente|asesor corta|agente cuelga)\b/i,
  ];

  // Patrones específicos de error o actitud atribuible al Cliente
  const clientePatterns: RegExp[] = [
    /\b(error|falla|culpa) (del?|por parte del?) (cliente|usuario|titular)\b/i,
    /\b(cliente|usuario|titular) (cuelga|cort[oó]|corta la llamada|abandona|se niega|se neg[oó]|rechaza|no coopera|no proporciona|proporciona datos err[oó]neos|grosero|agresivo|insulta|ofende|intransigente|desiste|molesto sin motivo)\b/i,
    /\b(cliente no desea|cliente no permite|cliente cuelga sin motivo|cliente corta comunicaci[oó]n|n[uú]mero equivocado|contacto equivocado|no es el titular|desconoce la deuda|deuda no reconocida)\b/i,
    /\b(cliente corta|cliente cuelga|cuelgue del cliente)\b/i,
  ];

  for (const pat of asesorPatterns) {
    const matches = corpus.match(new RegExp(pat, "gi"));
    if (matches) asesorScore += matches.length * 2;
  }

  for (const pat of clientePatterns) {
    const matches = corpus.match(new RegExp(pat, "gi"));
    if (matches) clienteScore += matches.length * 2;
  }

  // Ponderar por las listas de puntos negativos directamente
  for (const neg of validNegatives) {
    const nl = neg.toLowerCase();
    const hasAsesor = /\b(asesor|agente|ejecutivo|operador)\b/.test(nl);
    const hasCliente = /\b(cliente|usuario|titular)\b/.test(nl);
    if (hasAsesor && !hasCliente) asesorScore += 3;
    if (hasCliente && !hasAsesor) clienteScore += 3;
  }

  if (asesorScore > clienteScore && asesorScore > 0) {
    return "Asesor";
  }
  if (clienteScore > asesorScore && clienteScore > 0) {
    return "Cliente";
  }
  if (asesorScore > 0 && asesorScore === clienteScore) {
    return protocolFailed || feedbackAgente.length > 20 ? "Asesor" : "Cliente";
  }

  // Fallbacks contextuales cuando hay sentimiento negativo o puntos negativos sin mención explícita del rol:
  if (hasNegativeFindings || isNegativeSentiment || isLowScore) {
    if (/\b(cuelga|cort[oó]|agresiv|insult|rechaz|desconoce|equivocado|no le interesa)\b/.test(corpus)) {
      return "Cliente";
    }
    if (/\b(protocolo|saludo|empat[ií]a|tipificaci[oó]n|espera|informaci[oó]n err|gesti[oó]n deficiente)\b/.test(corpus)) {
      return "Asesor";
    }
  }

  // Si no se identifica un error claro atribuible a ninguna de las dos partes
  return "No aplica";
}
