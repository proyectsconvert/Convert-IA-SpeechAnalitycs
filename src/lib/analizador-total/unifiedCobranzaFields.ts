import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { resolveExtColumnKey } from "@/lib/extractions/extColumnResolve";

type RowExt = AnalizadorUnifiedRow & Record<string, unknown>;

/**
 * Extrae pares clave/valor desde resúmenes en formato markdown:
 *   `- **clave:** valor - **clave:** valor`
 */
function parseMarkdownSummary(summary: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!summary) return out;
  const re = /\*\*\s*([^*:]+?)\s*:?\s*\*\*\s*:?\s*([\s\S]*?)(?=(?:\s*[-•]\s*\*\*)|\*\*[^*]+?\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary)) !== null) {
    const k = m[1]
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_ ]/gi, "")
      .replace(/\s+/g, "_");
    const v = m[2]
      .replace(/^[\s:.\-–]+/, "")
      .replace(/[\s\-–.]+$/, "")
      .trim();
    if (k && v && !(k in out)) out[k] = v;
  }
  return out;
}

/**
 * Une `results` con JSON en `summary` o en `analysis`, y además los pares
 * clave/valor parseados del resumen markdown.
 */
export function getMergedAnalysisRecord(row: RowExt): Record<string, unknown> {
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
  } else if (summary.includes("**")) {
    const parsed = parseMarkdownSummary(summary);
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in base)) base[k] = v;
    }
  }

  const an = base.analysis;
  if (typeof an === "string") {
    const t = an.trim();
    if (t.startsWith("{")) {
      try {
        Object.assign(base, JSON.parse(t) as Record<string, unknown>);
      } catch {
        /* */
      }
    }
  }

  return base;
}

/** Prioriza Nombre Asesor (ext) cuando la regla de extracción existe en la fila. */
export function pickAgentDisplayName(row: RowExt): string {
  const extIds = Object.keys(row).filter((k) => k.startsWith("ext_"));
  const key = resolveExtColumnKey(extIds, "nombre_asesor");
  if (key) {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return String(row.agent || "Desconocido");
}

function pickResponsabilidad(row: RowExt): string {
  const merged = getMergedAnalysisRecord(row);
  for (const k of Object.keys(merged)) {
    const kl = k.toLowerCase();
    if (
      (kl.includes("responsabilidad") || kl.includes("atribuci")) &&
      merged[k] != null &&
      String(merged[k]).trim() !== ""
    ) {
      return String(merged[k]).trim();
    }
  }
  const extIds = Object.keys(row).filter((k) => k.startsWith("ext_"));
  for (const k of extIds) {
    if (/responsabilidad|atribuci/i.test(k) && row[k] != null && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return "Otros";
}

function pickMotivo(row: RowExt): string {
  const merged = getMergedAnalysisRecord(row);
  const direct =
    merged.motivo_no_pago ??
    merged.motivo_contacto ??
    (merged as Record<string, unknown>).Motivo ??
    merged.motivo;
  if (direct != null) {
    const v = String(direct).trim();
    if (v && !/^(no informa|n\/a|na|sin informaci[oó]n|ninguno|none|-+)$/i.test(v)) return v;
  }
  if (merged.submotivo != null && String(merged.submotivo).trim() !== "") {
    const m = merged.motivo_contacto ?? merged.motivo;
    if (m != null && String(m).trim() !== "") return `${String(m).trim()} · ${String(merged.submotivo).trim()}`;
    return String(merged.submotivo).trim();
  }
  const extIds = Object.keys(row).filter((k) => k.startsWith("ext_"));
  for (const k of extIds) {
    if (/motivo/i.test(k) && row[k] != null && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return "Otros";
}

/** Etiquetas fijas del tablero y export (orden para gráficos).
 *  Categorías homologadas:
 *   - "Promesa exitosa" → "Promesa de pago (Sí)"
 *   - "Solicita prórroga / Negociación" → "Agenda / Reagendamiento"
 *   - "Rechazo de pago" → "Negativa de pago (No)"
 *   - "Cliente cuelga" / "Llamada muda" / "Buzón de voz" → "Buzón / Cuelga / No contesta"
 */
export const PROMESA_CATEGORIAS = [
  "Promesa de pago (Sí)",
  "Pago parcial / Condicionado",
  "Agenda / Reagendamiento",
  "Ya realizó el pago",
  "Pendiente de confirmación",
  "Problema de servicio / Falla técnica",
  "Validación / Confirmación de servicio",
  "Instalación / Activación",
  "Interacción insuficiente",
  "Ocupado",
  "Negativa de pago (No)",
  "Falta de liquidez / Desempleo",
  "Quiere cancelar",
  "Desconoce deuda / Fraude",
  "No es cliente / Equivocado",
  "Cliente al día",
  "Queja / Reclamo",
  "Buzón / Cuelga / No contesta",
  "No clasificado",
  "Otros",
] as const;

export type PromesaCategoria = (typeof PROMESA_CATEGORIAS)[number];

/** Mapa de homologación: alias antiguos → categoría canónica. */
const PROMESA_ALIAS: Record<string, PromesaCategoria> = {
  "Promesa exitosa": "Promesa de pago (Sí)",
  "Solicita prórroga / Negociación": "Agenda / Reagendamiento",
  "Rechazo de pago": "Negativa de pago (No)",
  "Cliente cuelga": "Buzón / Cuelga / No contesta",
  "Llamada muda": "Buzón / Cuelga / No contesta",
  "Buzón de voz": "Buzón / Cuelga / No contesta",
};

export function canonicalizePromesa(value: string): PromesaCategoria {
  const v = String(value || "").trim();
  if (!v) return "No clasificado";
  if (PROMESA_ALIAS[v]) return PROMESA_ALIAS[v];
  if ((PROMESA_CATEGORIAS as readonly string[]).includes(v)) return v as PromesaCategoria;
  return "Otros";
}


function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compactText(...parts: unknown[]): string {
  return parts.map((p) => norm(p)).filter(Boolean).join(" | ");
}

function isGenericValue(value: string): boolean {
  const v = norm(value).replace(/["“”]/g, "").trim();
  return (
    !v ||
    /^(otros?|no informa|n\/a|na|sin informacion|ninguno|none|-+|no confirma|sin confirmar|por confirmar|desconocido|cliente)$/.test(v)
  );
}

function shouldForceDerivedOutcome(p: string): boolean {
  return [
    "Ya realizó el pago",
    "Problema de servicio / Falla técnica",
    "No es cliente / Equivocado",
    "Validación / Confirmación de servicio",
    "Instalación / Activación",
    "Interacción insuficiente",
    "Cliente al día",
    "Llamada muda",
    "Buzón de voz",
    "Buzón / Cuelga / No contesta",
  ].includes(p);
}

/** Suma palabras pronunciadas por el cliente en la transcripción etiquetada. */
function clienteWordCount(conv: string): number {
  if (!conv) return 0;
  let count = 0;
  const lines = conv.split(/\r?\n/);
  for (const line of lines) {
    const m = /\[?\s*(cliente|client|customer|usuario)\s*\]?\s*[:\-]\s*(.+)/i.exec(line);
    if (m) count += m[2].trim().split(/\s+/).filter(Boolean).length;
  }
  return count;
}

/**
 * Clasificación específica para WhatsApp.
 * Usa los campos típicos del schema de análisis WA: `motivo_contacto`,
 * `submotivo`, `intencion_compra`, `venta_concretada`, `motivo_venta_perdida`,
 * además del resumen. Devuelve `null` si no aplica una categoría clara
 * para que la lógica general pueda intentar respaldarse en summary/conv.
 */
function classifyWhatsappRow(
  row: RowExt,
  merged: Record<string, unknown>,
  summaryN: string,
): string | null {

  const motivoContacto = norm(merged.motivo_contacto);
  const submotivo = norm(merged.submotivo);
  const intencion = norm(merged.intencion_compra);
  const ventaConcretada = norm(merged.venta_concretada);
  const motivoVentaPerdida = norm(merged.motivo_venta_perdida);
  const estadoPago = norm(merged.estado_pago);
  const motivoNP = norm(merged.motivo_no_pago);
  const evidencia = norm(merged.evidencia);
  const medio = norm(merged.medio_pago);
  const cobro = norm(merged.cobro_correcto);
  const totalMsg = Number(row.total_messages ?? 0);

  const blob = compactText(motivoContacto, submotivo, intencion, motivoVentaPerdida, estadoPago, motivoNP, evidencia, summaryN);

  // 0) Interacción mínima (sin contenido real del cliente)
  if (totalMsg > 0 && totalMsg <= 2 && !blob) {
    return "Interacción insuficiente";
  }

  // 1) Falla / problema técnico de servicio (prioridad alta)
  if (
    /(no (me )?funciona|sin servicio|sin internet|sin se[ñn]al|falla (tecnica|del|en)|problema (tecnico|del servicio|con el servicio|con el internet)|servicio (caido|suspendido|interrumpido|cortado)|no navega|no conecta|se desconecta|intermitente|muy lento|internet lento|tecnico no (ha )?(ido|asistido|llegado)|reporte de falla|reportar falla|soporte tecnico)/.test(
      blob,
    )
  ) {
    return "Problema de servicio / Falla técnica";
  }

  // 2) Instalación / Activación
  if (/(instalaci[oó]n|activaci[oó]n|activar (el )?servicio|orden de instalaci[oó]n|visita t[eé]cnica)/.test(blob)) {
    return "Instalación / Activación";
  }

  // 3) Cancelación / baja
  if (/(quiere cancelar|solicita (la )?cancelaci[oó]n|dar de baja|darse de baja|baja del servicio|cancelar (el )?servicio|cancelaci[oó]n)/.test(blob)) {
    return "Quiere cancelar";
  }

  // 4) Validación / Confirmación de funcionamiento o datos (no cobranza)
  if (
    /(confirmaci[oó]n de (que el )?(funcionamiento|servicio)|confirmar (el )?funcionamiento|seguimiento (del|al) servicio|envio de folio|folio de validaci[oó]n|datos fiscales|validaci[oó]n de datos|bienvenida|canal oficial|no cobranza)/.test(
      blob,
    )
  ) {
    return "Validación / Confirmación de servicio";
  }

  // 5) Queja / reclamo
  if (/(queja|reclamo|inconforme|mala atenci[oó]n|mal servicio|molestia)/.test(blob)) {
    return "Queja / Reclamo";
  }

  // 6) Desconoce / fraude
  if (/(desconoce (la )?deuda|no reconoce (la )?deuda|fraude|estafa|robo de identidad|nunca contrat[eo]|no es mi deuda)/.test(blob)) {
    return "Desconoce deuda / Fraude";
  }

  // 7) No es cliente / equivocado
  if (/(numero equivocado|n[uú]mero equivocado|persona equivocada|no (la|lo|le) conozco|no soy (el|la) titular|no es (el )?cliente|contacto equivocado)/.test(blob)) {
    return "No es cliente / Equivocado";
  }

  // 8) Cliente al día / sin mora
  if (/(al d[ií]a|al corriente|sin mora|ya esta al d[ií]a|cuenta al d[ií]a)/.test(blob)) {
    return "Cliente al día";
  }

  // 9) Ya realizó el pago (cliente confirma pago previo)
  if (
    /(ya (lo |la |le )?pag(o|ue|u[eé])|pago (realizado|hecho|efectuado|previo)|ya esta pagado|ya quedo pagado|se refleja (el )?pago|envi[eé] (el )?comprobante|mand[eé] (el )?comprobante|comprobante (ya )?enviado|gracias por su pago|recibimos su pago)/.test(
      blob,
    )
  ) {
    return "Ya realizó el pago";
  }

  // 10) Promesa exitosa (cobro/venta cerrada o boleta enviada)
  if (
    /^(si|sí|true|exitos|concretad|cerrad)/.test(ventaConcretada) ||
    /^(si|sí|true|positivo|exitoso)$/.test(cobro) ||
    /(boleta de pago enviada|comprobante enviado|cobro exitoso|cobro finalizado|env[ií]o de (la )?boleta|se env[ií]a (la )?boleta|finaliza el contacto con boleta)/.test(blob)
  ) {
    return "Promesa exitosa";
  }

  // 11) Promesa firme: intención de pagar con medio o fecha
  const promesaFecha = /(hoy|manana|esta (semana|tarde|noche)|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)|en la (manana|tarde|noche)|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+de\s+[a-z]+|esta semana|proxima semana)/;
  const medioPago = /(oxxo|transferencia|spei|deposito|dep[oó]sito|tarjeta|efectivo|cup[oó]n|paynet|7\s*eleven|farmacia|bancomer|banamex|santander|hsbc|banco azteca)/;
  if (
    (medioPago.test(intencion) || medioPago.test(blob) || promesaFecha.test(intencion) || promesaFecha.test(estadoPago) || promesaFecha.test(blob)) &&
    /(pagar|pago|cubrir|abonar|liquidar|generar (el )?pago|realizar (el )?pago|hacer (el )?pago|saldar)/.test(`${intencion} ${blob}`) &&
    !/no (va a |puede |quiere |podra )pagar/.test(blob)
  ) {
    return "Promesa de pago (Sí)";
  }

  // 12) Pago parcial / condicionado
  if (/(pago parcial|abonar (una )?parte|abono parcial|pagara una parte|saldo parcial|condicionad)/.test(blob)) {
    return "Pago parcial / Condicionado";
  }

  // 13) Agenda / Reagendamiento (reagenda contacto o se comunican luego)
  if (/(reagend|agendad[oa]|volver a contactar|me comunico (luego|despues|m[aá]s tarde)|me escribe (luego|despues|en|el)|le marco (luego|m[aá]s tarde))/.test(blob)) {
    return "Agenda / Reagendamiento";
  }

  // 14) Solicita prórroga / negociación (pide más plazo)
  if (/(plazo|prorroga|pr[oó]rroga|m[aá]s tiempo|dame chance|denme chance|negociaci[oó]n|extension de pago|extensi[oó]n)/.test(blob)) {
    return "Solicita prórroga / Negociación";
  }

  // 15) Falta de liquidez / desempleo
  if (
    /(desempleo|desempleado|sin trabajo|sin empleo|falta de liquidez|problemas? econ[oó]micos?|sin dinero|no tengo dinero|no me alcanza|no cuento con dinero|no puedo pagar (por ahora|en este momento|ahorita))/.test(
      blob,
    )
  ) {
    return "Falta de liquidez / Desempleo";
  }

  // 16) Rechazo / negativa explícita (debe estar respaldada por evidencia o motivo)
  const negativaEvidencia = compactText(evidencia, motivoNP, motivoVentaPerdida, summaryN);
  if (/(no va a pagar|no quiere pagar|no puede pagar|se niega a pagar|sin intencion de pagar|rechaza (el )?pago|rechazo de pago|no le interesa pagar)/.test(negativaEvidencia)) {
    if (/(mensualidad|el mes|recibo|servicio)/.test(negativaEvidencia)) return "Rechazo de pago";
    return "Negativa de pago (No)";
  }

  // 17) Pendiente de confirmación (cliente no confirma sin negarse)
  if (
    /(no confirma|pendiente de confirmaci[oó]n|sin confirmar|por confirmar|queda en confirmar|no ha confirmado)/.test(
      `${estadoPago} ${intencion} ${blob}`,
    )
  ) {
    return "Pendiente de confirmación";
  }

  // 18) Cobranza genérica sin más señales: dejar que el cliente confirme.
  if (/cobranza|adeudo|saldo pendiente|recordatorio de pago|aviso de adeudo|fecha de pago/.test(blob)) {
    return "Pendiente de confirmación";
  }

  return null;
}


/**
 * Clasifica la promesa de pago priorizando campos estructurados del resumen
 * (cobro_correcto, estado_pago, evidencia, motivo_no_pago, medio_pago) y,
 * como respaldo, evidencia textual de resumen + transcripción.
 */
export function classifyPromesaDePago(row: RowExt): PromesaCategoria {
  return canonicalizePromesa(_classifyPromesaRaw(row));
}

function _classifyPromesaRaw(row: RowExt): string {
  const merged = getMergedAnalysisRecord(row);
  const summary = String(row.summary ?? "");
  const summaryN = norm(summary);
  const conv = String((row as RowExt).__conversation ?? "");
  const convN = norm(conv);
  const isWhatsapp = String((row as RowExt).channel ?? "") === "whatsapp";

  // ── WhatsApp: clasificación específica usando campos del schema de WA ──
  if (isWhatsapp) {
    const waCat = classifyWhatsappRow(row, merged, summaryN);
    if (waCat) return waCat;
  }



  // ── Señales estructuradas ──────────────────────────────────────────────
  const cobro = norm(
    (merged as Record<string, unknown>).cobro_correcto ??
      (merged as Record<string, unknown>).cobro ??
      (merged as Record<string, unknown>).exito_cobro ??
      (merged as Record<string, unknown>).exito,
  );
  const estado = norm(
    (merged as Record<string, unknown>).estado_pago ??
      (merged as Record<string, unknown>).estadoPago ??
      (merged as Record<string, unknown>).estado,
  );
  const motivoNP = norm(
    (merged as Record<string, unknown>).motivo_no_pago ??
      (merged as Record<string, unknown>).motivoNoPago,
  );
  const evidencia = norm(
    (merged as Record<string, unknown>).evidencia ??
      (merged as Record<string, unknown>).evidence,
  );
  const medio = norm(
    (merged as Record<string, unknown>).medio_pago ??
      (merged as Record<string, unknown>).medioPago,
  );
  const promesaCampo = norm(
    (merged as Record<string, unknown>).promesa_pago ??
      (merged as Record<string, unknown>).promesa_de_pago ??
      (merged as Record<string, unknown>).promesa,
  );

  const allText = compactText(evidencia, estado, motivoNP, medio, summaryN, convN);
  const evidenceText = compactText(evidencia, motivoNP, summaryN, convN);

  // 1) Pago YA realizado (cubre "ya la pagué", "lo pagué", "pagué el día", etc.)
  if (
    /(\bya (la |lo |le |los |las )?pag(o|ue|u[eé])\b|\bya pag[oóu]\b|\b(la |lo |el )?pagu[eé] (el |la |los |las |hace |ayer|anoche|el d[ií]a|antier)|\b(la |lo |el |este |ese )?pag[oó] (por la|por el|ayer|hoy|anoche|antier|el d[ií]a|en la|en el|hace|temprano|tarde|noche)\b|pago realizado|pago hecho|pago efectuad|cancel[eo] (la )?deuda|pago previo|pagado|ya esta pagado|ya quedo pagado|pago hace|mand[eé] (el )?comprobante|envi[eé] (el )?comprobante|ya envi[eé] (el )?comprobante|se refleja (el )?pago|gracias por su pago)/.test(
      allText,
    )
  ) {
    return "Ya realizó el pago";
  }

  // 1b) Problema de servicio / falla técnica (cliente reporta servicio caído)
  if (
    /(servicio no funciona|no (me )?funciona (el )?(servicio|internet)|sin servicio|problema (con|del|de) (el )?(servicio|internet)|falla (en|del|tecnica|con)|sin internet|no tengo internet|sin se[ñn]al|no hay se[ñn]al|problema tecnico|falla tecnica|intermitente|muy lento|internet lento|no me llega (el )?servicio|servicio suspendido|servicio interrumpido|esta cortado|esta suspendido|no navega|no conecta|se desconecta|modem|router|antena|tecnico no (ha )?ido|no han instalado)/.test(
      allText,
    )
  ) {
    return "Problema de servicio / Falla técnica";
  }

  // 1c) Contacto equivocado / tercero no conoce al titular. Debe ir antes de “No confirma”.
  if (
    /(no (la|lo|le) conozco|no conozco (a )?(la|el )?(señora|senora|señorita|senorita|señor|senor|titular|persona)|no vive aqui|no trabaja aqui|numero equivocado|n[uú]mero equivocado|persona equivocada|no corresponde (al|el) titular|contacto equivocado|tel[eé]fono equivocado|no es (el )?cliente|no es titular|tercero no conoce|familiar no (lo|la) conoce|equivocado)/.test(
      allText,
    )
  ) {
    return "No es cliente / Equivocado";
  }

  // 1d) Llamadas operativas no relacionadas con promesa de pago.
  if (
    /(confirmar que todo se encuentre bien|validar datos generales|confirmarle el servicio|validaci[oó]n de datos|confirmaci[oó]n de servicio|cuenta con whatsapp|domicilio|codigo postal|c[oó]digo postal|referencias?|folio de su servicio|bienvenida|canal oficial de whatsapp)/.test(
      allText,
    )
  ) {
    return "Validación / Confirmación de servicio";
  }

  if (/(instalaci[oó]n|activar el servicio|activaci[oó]n|t[eé]cnico|t[eé]cnicos|visita t[eé]cnica|orden de instalaci[oó]n)/.test(allText)) {
    return "Instalación / Activación";
  }

  // 2) Promesa exitosa (se envía boleta / se cierra el cobro)
  if (
    /(boleta de pago|comprobante de pago|env[ií]o de boleta|se envia boleta|env[ií]a la boleta|se le env[ií]a el comprobante|cobro exitoso|finaliz[oa] el contacto con boleta)/.test(
      allText,
    )
  ) {
    return "Promesa exitosa";
  }

  // 3) Promesa explícita por campo
  if (/^(si|sí|yes|true|positivo|confirmado|comprometid|exitos)/.test(promesaCampo)) {
    return "Promesa exitosa";
  }

  // 3b) Promesa explícita en transcripción/evidencia, con fecha o medio.
  if (
    /(lo voy a (hacer|realizar|pagar)|voy a pagar|realizo (el )?pago|lo realizo hoy|pagare|pagar[eé]|queda registrada su promesa|promesa de pago para|confirmaria que pagara|confirm[oó] que pagara)/.test(
      allText,
    ) &&
    /(transferencia|bancaria|efectivo|deposito|dep[oó]sito|cup[oó]n|hoy|mañana|manana|lunes|martes|miercoles|mi[eé]rcoles|jueves|viernes|sabado|s[aá]bado|domingo|\d{1,2}\s+de\s+[a-z]+)/.test(
      allText,
    )
  ) {
    return "Promesa de pago (Sí)";
  }

  // 4) Llamada muda
  if (
    /(llamada muda|no se escucha al cliente|no se escucha nada|sin audio del cliente|cliente no se escucha|silencio total|no se oye al cliente)/.test(
      allText,
    )
  ) {
    return "Llamada muda";
  }

  // 5) Buzón de voz
  if (/(buz[oó]n de voz|contestador autom[aá]tico|deje su mensaje|grabadora|mensaje de voz autom)/.test(allText)) {
    return "Buzón de voz";
  }

  // 6) Cliente cuelga (cuelga sin motivo / al inicio)
  if (/(contenido insuficiente|informaci[oó]n insuficiente|transcripci[oó]n insuficiente|no hay suficiente contenido)/.test(allText)) {
    return "Interacción insuficiente";
  }
  if (
    /(cliente cuelga|colg[oó] sin (motivo|hablar|dar)|cuelga la llamada|cort[oó] la llamada sin|me colg[oó]|colgaron sin)/.test(
      allText,
    )
  ) {
    return "Cliente cuelga";
  }

  // 7) Ocupado
  if (
    /(ocupad[oa]|no tiene tiempo|estoy ocupad|llame m[aá]s tarde porque|ahora no puedo (atender|hablar)|en este momento no puedo)/.test(
      allText,
    )
  ) {
    return "Ocupado";
  }

  // 8) Agenda / Reagendamiento (cliente acepta agendar un día específico)
  if (
    /(agendad[oa]|queda agendad|agendar (la )?llamada|agendar contacto|reagend|volver a (llamar|marcar) (el|en) |llamar el (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|seleccionar d[ií]a|otro d[ií]a|otra semana|proxima semana|la pr[oó]xima semana)/.test(
      allText,
    )
  ) {
    return "Agenda / Reagendamiento";
  }

  // 9) Prórroga / negociación (cliente pide tiempo sin agendar fecha)
  if (
    /(llamame|llamame en|en (una|dos|tres|media) ?(hora|horas|rato|min)|m[aá]s tarde|en la tarde|m[aá]s plazo|me devuelve la llamada|dame chance|plazo|prorroga|negociaci[oó]n|llamar en otro momento)/.test(
      allText,
    )
  ) {
    return "Solicita prórroga / Negociación";
  }

  // 10) Pago parcial
  if (/(pago parcial|promesa parcial|pagara una parte|abonar|abono parcial)/.test(allText)) {
    return "Pago parcial / Condicionado";
  }

  // 11) Promesa firme por estado_pago + (cobro_correcto Sí o medio_pago)
  const promesaFecha = /(hoy|manana|esta (semana|tarde|noche)|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)|en la (manana|tarde|noche)|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+de\s+[a-z]+)/;
  const cobroSi = /^(si|sí|yes|true|positivo|exitoso)$/.test(cobro);
  if (cobroSi && (promesaFecha.test(estado) || promesaFecha.test(evidencia))) {
    return "Promesa de pago (Sí)";
  }
  if (promesaFecha.test(estado) && medio) {
    return "Promesa de pago (Sí)";
  }
  if (cobroSi && medio) {
    return "Promesa de pago (Sí)";
  }

  // 12) Quiere cancelar (baja del servicio)
  if (
    /(quiere cancelar|desea cancelar|dar de baja|darse de baja|cancelar (el )?servicio|cancelar (la )?cuenta|cancelar (la )?matricula|baja del servicio|cancelaci[oó]n)/.test(
      allText,
    )
  ) {
    return "Quiere cancelar";
  }

  // 13) Desconoce / fraude
  if (
    /(desconoce (la )?deuda|no reconoce (la )?deuda|robo de identidad|estafa|fraude|no es mi deuda|nunca contrat[eo])/.test(
      allText,
    )
  ) {
    return "Desconoce deuda / Fraude";
  }

  // 14) No es cliente / equivocado (respaldo tardío)
  if (/(tercero|familiar (no )?(lo|la) conoce|no (lo|la) conoce)/.test(allText)) return "No es cliente / Equivocado";

  // 15) Cliente al día
  if (/(al d[ií]a|al corriente|sin mora|cuenta al d[ií]a|pagos al d[ií]a)/.test(allText)) {
    return "Cliente al día";
  }

  // 16) Falta de liquidez / desempleo
  if (
    /(desempleo|desempleado|sin empleo|sin trabajo|falta de liquidez|problemas economicos|problema economico|situacion dificil|sin dinero|no tiene dinero|no tengo dinero|no puede pagar|no puedo pagar|por ahora no puedo (realizarlo|pagar)|no cuento con dinero|no me alcanza)/.test(
      allText,
    )
  ) {
    return "Falta de liquidez / Desempleo";
  }

  // 17) Rechazo de pago (no tiene dinero / no puede pagar la mensualidad)
  if (
    /(no puede pagar la mensualidad|rechaza el pago|rechazo de pago|no va a pagar la mensualidad|no quiere pagar la mensualidad)/.test(
      allText,
    )
  ) {
    return "Rechazo de pago";
  }

  // 18a) Pendiente de confirmación (estado_pago = "No confirma" sin negativa real)
  if (
    /\bno confirma\b|pendiente de confirmaci[oó]n|sin confirmar|por confirmar|queda en confirmar/.test(
      `${estado} ${summaryN}`,
    ) &&
    !/no quiere pagar|no puede pagar|se niega a pagar/.test(`${evidencia} ${motivoNP}`)
  ) {
    return "Pendiente de confirmación";
  }

  // 18) Negativa explícita — requiere que la evidencia/motivo lo respalden
  if (/(no quiere pagar|no puede pagar|no va a pagar|se niega a pagar|sin intencion de pagar)/.test(evidenceText)) {
    return "Negativa de pago (No)";
  }

  // 19) Queja
  if (/(queja|reclamo|inconforme|mal servicio|molestia)/.test(allText)) {
    return "Queja / Reclamo";
  }

  // 20) Buzón / cuelga / no contesta (cliente no participó en la transcripción)
  const clienteWords = clienteWordCount(conv);
  if (
    /(no contesta|no respondi[oó]|llam[ao] sin respuesta|sin interacci[oó]n|sin respuesta del cliente|no hubo contacto)/.test(
      allText,
    )
  ) {
    return "Buzón / Cuelga / No contesta";
  }
  if (conv && clienteWords === 0) return "Buzón de voz";
  if (conv && clienteWords > 0 && clienteWords < 6) return "Cliente cuelga";

  // 21) Fallback con transcripción
  if (convN) {
    if (/(ya pague|ya pago|pague ayer|pague el|pague hace|pagado|lo pague)/.test(convN)) {
      return "Ya realizó el pago";
    }
    if (/(llamame|reagendame|en una hora|mas tarde|otra hora|otro dia|otra semana)/.test(convN)) {
      return "Solicita prórroga / Negociación";
    }
    if (/(no reconoce|desconoce la deuda|no es mi deuda|nunca contrat)/.test(convN)) {
      return "Desconoce deuda / Fraude";
    }
    if (/(cuelgue|cuelga|me colg)/.test(convN)) {
      return "Cliente cuelga";
    }
  }

  if (cobro && /^(no|false|negativo)$/.test(cobro)) return "No clasificado";

  if (!summary || summary.length < 8) return "No clasificado";
  return "Otros";
}

/**
 * Devuelve la atribución de responsabilidad. Si no viene del análisis, se
 * deriva de la promesa clasificada para nunca dejar el campo vacío.
 */
function deriveAtribucionFromPromesa(p: string): string {
  switch (p) {
    case "Promesa exitosa":
    case "Promesa de pago (Sí)":
    case "Pago parcial / Condicionado":
    case "Ya realizó el pago":
    case "Cliente al día":
      return "Cliente";
    case "Agenda / Reagendamiento":
    case "Solicita prórroga / Negociación":
    case "Ocupado":
      return "Cliente";
    case "Rechazo de pago":
    case "Negativa de pago (No)":
    case "Quiere cancelar":
    case "Falta de liquidez / Desempleo":
      return "Cliente";
    case "Desconoce deuda / Fraude":
    case "No es cliente / Equivocado":
      return "Empresa";
    case "Queja / Reclamo":
      return "Empresa";
    case "Cliente cuelga":
      return "Cliente";
    case "Pendiente de confirmación":
      return "Cliente";
    case "Problema de servicio / Falla técnica":
      return "Empresa";
    case "Validación / Confirmación de servicio":
    case "Instalación / Activación":
      return "Operación";
    case "Interacción insuficiente":
      return "Sin contacto";
    case "Llamada muda":
    case "Buzón de voz":
    case "Buzón / Cuelga / No contesta":
      return "Sin contacto";
    default:
      return "Otros";
  }
}

/** Estado de pago derivado de la promesa cuando no viene del análisis. */
function deriveEstadoFromPromesa(p: string): string {
  switch (p) {
    case "Promesa exitosa":
      return "Cobro finalizado";
    case "Promesa de pago (Sí)":
      return "Promesa de pago";
    case "Pago parcial / Condicionado":
      return "Pago parcial acordado";
    case "Ya realizó el pago":
      return "Pago ya realizado";
    case "Cliente al día":
      return "Sin mora";
    case "Agenda / Reagendamiento":
      return "Reagendar contacto";
    case "Solicita prórroga / Negociación":
      return "Negociación pendiente";
    case "Ocupado":
      return "Cliente ocupado";
    case "Rechazo de pago":
    case "Negativa de pago (No)":
      return "Sin acuerdo de pago";
    case "Falta de liquidez / Desempleo":
      return "Sin capacidad de pago";
    case "Quiere cancelar":
      return "Solicita baja";
    case "Desconoce deuda / Fraude":
      return "Deuda no reconocida";
    case "No es cliente / Equivocado":
      return "Contacto incorrecto";
    case "Queja / Reclamo":
      return "Queja registrada";
    case "Cliente cuelga":
      return "Llamada cortada";
    case "Llamada muda":
      return "Sin audio del cliente";
    case "Buzón de voz":
      return "Buzón";
    case "Buzón / Cuelga / No contesta":
      return "No contactado";
    case "Pendiente de confirmación":
      return "Pendiente de confirmación";
    case "Problema de servicio / Falla técnica":
      return "Falla técnica reportada";
    case "Validación / Confirmación de servicio":
      return "Validación de servicio";
    case "Instalación / Activación":
      return "Instalación / activación";
    case "Interacción insuficiente":
      return "Interacción insuficiente";
    default:
      return "Sin información";
  }
}

/** Motivo derivado de la promesa cuando no viene del análisis. */
function deriveMotivoFromPromesa(p: string): string {
  switch (p) {
    case "Promesa exitosa":
    case "Promesa de pago (Sí)":
      return "Compromiso de pago";
    case "Pago parcial / Condicionado":
      return "Pago parcial";
    case "Ya realizó el pago":
      return "Pago previo realizado";
    case "Cliente al día":
      return "Cuenta al día";
    case "Agenda / Reagendamiento":
      return "Reagendamiento";
    case "Solicita prórroga / Negociación":
      return "Negociación / prórroga";
    case "Ocupado":
      return "Cliente ocupado";
    case "Rechazo de pago":
      return "Rechazo de pago";
    case "Negativa de pago (No)":
      return "Negativa de pago";
    case "Falta de liquidez / Desempleo":
      return "Falta de liquidez";
    case "Quiere cancelar":
      return "Solicitud de cancelación";
    case "Desconoce deuda / Fraude":
      return "Desconoce deuda / Fraude";
    case "No es cliente / Equivocado":
      return "Contacto equivocado";
    case "Queja / Reclamo":
      return "Queja / reclamo";
    case "Cliente cuelga":
      return "Cliente cuelga sin motivo";
    case "Llamada muda":
      return "Llamada muda";
    case "Buzón de voz":
      return "Buzón de voz";
    case "Buzón / Cuelga / No contesta":
      return "Sin contacto efectivo";
    case "Pendiente de confirmación":
      return "Pendiente de confirmación";
    case "Problema de servicio / Falla técnica":
      return "Problema técnico de servicio";
    case "Validación / Confirmación de servicio":
      return "Validación de datos / servicio";
    case "Instalación / Activación":
      return "Instalación / activación de servicio";
    case "Interacción insuficiente":
      return "Contenido insuficiente para tipificar";
    default:
      return "Otros";
  }
}

function pickEstadoPagoDetalle(row: RowExt): string {
  const merged = getMergedAnalysisRecord(row);
  const ep =
    (merged as Record<string, unknown>).estado_pago ??
    (merged as Record<string, unknown>).estadoPago;
  if (ep != null && String(ep).trim() !== "") return String(ep).trim();
  return "";
}

/** Rellena agente (ext), atribución, motivo, promesa y estado para dashboard / export. */
export function enrichAnalizadorRow<T extends RowExt>(row: T): T {
  row.agent = pickAgentDisplayName(row);
  const promesa = classifyPromesaDePago(row);
  row.promesa_de_pago = promesa;

  const atrib = pickResponsabilidad(row);
  row.atribucion_responsabilidad = !isGenericValue(atrib) ? atrib : deriveAtribucionFromPromesa(promesa);

  const motivo = pickMotivo(row);
  row.motivo_principal = !shouldForceDerivedOutcome(promesa) && !isGenericValue(motivo) ? motivo : deriveMotivoFromPromesa(promesa);

  const estado = pickEstadoPagoDetalle(row);
  row.estado_pago_detalle = !shouldForceDerivedOutcome(promesa) && !isGenericValue(estado) ? estado : deriveEstadoFromPromesa(promesa);
  return row;
}
