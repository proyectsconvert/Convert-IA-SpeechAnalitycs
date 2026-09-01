import * as XLSX from "xlsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { resolveExtColumnKey } from "@/lib/extractions/extColumnResolve";
import { normalizeWhatsappAnalysisForInsights } from "@/lib/analysis/normalizeWhatsappAnalysis";
import { enrichAnalizadorRow } from "@/lib/analizador-total/unifiedCobranzaFields";
import { supabase } from "@/integrations/supabase/client";

import { formatCleanSummary } from "@/lib/utils/formatSummary";

type FlattenSource = AnalizadorUnifiedRow & Record<string, unknown>;

function joinPipe(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" | ");
  return "";
}

/** score en fila: 0–1 o ya en 0–100 según origen */
function score01(row: FlattenSource): number {
  const n = Number(row.score) || 0;
  // Calls may store 0-1, WA now stores 0-100
  return n > 1.5 ? n / 100 : n;
}

function scorePct(row: FlattenSource): number {
  const n = Number(row.score) || 0;
  return Math.round(n <= 1.5 ? n * 100 : n);
}

function resultsOf(row: FlattenSource): Record<string, unknown> {
  const r = row.results;
  return r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : {};
}

/**
 * Voz: `analyses.results` ya trae analysis / positive / …
 * WhatsApp: el JSON del modelo mezcla campos nuevos y legacy (resumen, motivo_contacto, hallazgos_criticos, next_steps…).
 * Reutilizamos la misma normalización que el panel de insights.
 */
function resultsForExportColumns(row: FlattenSource): Record<string, unknown> {
  const raw = resultsOf(row);
  if (row.channel === "whatsapp") {
    const { results } = normalizeWhatsappAnalysisForInsights(
      { score_general: null, prompt_name: null, results: raw },
      null,
    );
    return results;
  }
  return raw;
}

function analysisPromptText(res: Record<string, unknown>): string {
  const a = res.analysis ?? res.analysis_prompt_aligned;
  return typeof a === "string" ? a : "";
}

function pickExtFechaKey(extIds: string[]): string | undefined {
  const r = resolveExtColumnKey(extIds, "fecha_ext");
  if (r) return r;
  return extIds.find((id) => {
    const short = id.replace(/^ext_/i, "").toLowerCase();
    return short === "fecha" || short.startsWith("fecha_") || short.includes("fecha_ext");
  });
}

function collectExtColumnIds(rows: FlattenSource[]): string[] {
  const set = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (k.startsWith("ext_")) set.add(k);
    });
  });
  return Array.from(set);
}

/** Columnas fijas del exporte maestro (orden solicitado). */
export const MASTER_EXPORT_HEADERS = [
  "canal",
  "archivo",
  "fecha",
  "duracion_segundos",
  "duracion_Minutos",
  "duracion_Horas",
  "mensajes",
  "sentimiento",
  "score_0_1",
  "score_pct",
  "conversación",
  "resumen de la llamada y/o de la conversacion",
  "Análisis según Prompt",
  "Puntos Positivos",
  "Puntos Negativos",
  "Oportunidades",
  "Insights",
  "Conclusiones",
  "Recomendaciones",
  "Atribución responsabilidad",
  "Promesa de pago",
  "Estado pago (detalle)",
  "Motivo principal",
  "ext_Nombre Asesor",
  "ext_Nombre Campaña",
  "ext_fecha",
] as const;

function buildMasterExportRow(
  row: FlattenSource,
  extKeyAsesor: string | undefined,
  extKeyCampaña: string | undefined,
  extKeyFecha: string | undefined,
): Record<string, string | number> {
  enrichAnalizadorRow(row);
  const sec = Math.round(Number(row.duration) || 0);
  const res = resultsForExportColumns(row);
  const resumenText =
    String(row.summary || "").trim() ||
    (row.channel === "whatsapp"
      ? String(
          resultsOf(row).summary ||
            resultsOf(row).resumen ||
            resultsOf(row).resumen_ejecutivo ||
            "",
        ).trim()
      : "");

  const out: Record<string, string | number> = {
    canal: row.channel === "whatsapp" ? "WhatsApp" : "Llamada",
    archivo: String(row.file_name || ""),
    fecha: format(new Date(row.created_at), "yyyy-MM-dd HH:mm", { locale: es }),
    duracion_segundos: sec,
    duracion_Minutos: Math.round((sec / 60) * 100) / 100,
    duracion_Horas: Math.round((sec / 3600) * 10000) / 10000,
    mensajes: row.channel === "whatsapp" ? (row.total_messages != null ? Number(row.total_messages) : "") : "",
    sentimiento: String(row.sentiment || ""),
    score_0_1: Math.round(score01(row) * 10000) / 10000,
    score_pct: scorePct(row),
    "conversación": String(row.__conversation || "").slice(0, 32000),
    "resumen de la llamada y/o de la conversacion": formatCleanSummary(resumenText),
    "Análisis según Prompt": analysisPromptText(res) || analysisPromptText(resultsOf(row)),
    "Puntos Positivos": joinPipe(res.positive),
    "Puntos Negativos": joinPipe(res.negative),
    Oportunidades: joinPipe(res.opportunities),
    Insights: typeof res.insights === "string" ? res.insights : String(res.insights ?? ""),
    Conclusiones: typeof res.conclusions === "string" ? res.conclusions : String(res.conclusions ?? ""),
    Recomendaciones:
      typeof res.recommendations === "string" ? res.recommendations : String(res.recommendations ?? ""),
    "Atribución responsabilidad": String(row.atribucion_responsabilidad ?? ""),
    "Promesa de pago": String(row.promesa_de_pago ?? ""),
    "Estado pago (detalle)": String(row.estado_pago_detalle ?? ""),
    "Motivo principal": String(row.motivo_principal ?? ""),
    "ext_Nombre Asesor": (function() {
      if (row.agent && row.agent !== "Desconocido") return String(row.agent).replace(/@.*$/, "").trim();
      const val = extKeyAsesor ? String(row[extKeyAsesor] ?? "") : "";
      return val.replace(/@.*$/, "").trim();
    })(),
    "ext_Nombre Campaña": (function() {
      if (row.campaign && row.campaign !== "SFTP Import") return String(row.campaign);
      return extKeyCampaña ? String(row[extKeyCampaña] ?? "") : "";
    })(),
    ext_fecha: (function() {
      if (!row.created_at) return "";
      const d = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      return format(d, "yyyy-MM-dd");
    })(),
  };

  return out;
}

export function rowsToMasterExportAoA(rows: AnalizadorUnifiedRow[]): {
  headers: string[];
  data: (string | number)[][];
} {
  if (rows.length === 0) return { headers: [], data: [] };
  const src = rows as FlattenSource[];
  const extIds = collectExtColumnIds(src);
  const extKeyAsesor = resolveExtColumnKey(extIds, "nombre_asesor");
  const extKeyCampaña = resolveExtColumnKey(extIds, "nombre_campaña");
  const extKeyFecha = pickExtFechaKey(extIds);

  const maps = src.map((r) => buildMasterExportRow(r, extKeyAsesor, extKeyCampaña, extKeyFecha));
  const headers = [...MASTER_EXPORT_HEADERS];
  const data = maps.map((m) => headers.map((h) => (m[h] !== undefined ? m[h] : "")));
  return { headers, data };
}

/** Mismas filas que el Excel maestro, como objetos (para JSON / IA). */
export function rowsToMasterExportRecords(rows: AnalizadorUnifiedRow[]): Record<string, string | number>[] {
  const { headers, data } = rowsToMasterExportAoA(rows);
  return data.map((row) => {
    const rec: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      rec[h] = row[i] ?? "";
    });
    return rec;
  });
}

/** Exporte plano heredado (todas las claves dinámicas); solo CSV legacy. */
function flattenRowLegacy(row: FlattenSource): Record<string, string | number> {
  const base: Record<string, string | number> = {
    canal: row.channel === "whatsapp" ? "WhatsApp" : "Llamada",
    id: String(row.id),
    archivo: String(row.file_name || ""),
    fecha: format(new Date(row.created_at), "yyyy-MM-dd HH:mm", { locale: es }),
    duracion_segundos: Math.round(Number(row.duration) || 0),
    mensajes: row.total_messages != null ? Number(row.total_messages) : "",
    sentimiento: String(row.sentiment || ""),
    score_0_1: Number(row.score) || 0,
    score_pct:
      Math.round(Number(row.score) <= 1.5 ? Number(row.score) * 100 : Number(row.score)) || 0,
    resumen: String(row.summary || "").slice(0, 5000),
    asesor: String(row.agent || ""),
    campaña: row.campaign != null ? String(row.campaign) : "",
    estado: String(row.status || ""),
  };

  Object.keys(row).forEach((k) => {
    if (k.startsWith("ext_")) {
      const label = k.replace(/^ext_/, "");
      base[`ext_${label}`] = String(row[k] ?? "");
    }
  });

  return base;
}

export function rowsToAoA(rows: AnalizadorUnifiedRow[]): { headers: string[]; data: (string | number)[][] } {
  if (rows.length === 0) return { headers: [], data: [] };
  const maps = rows.map((r) => flattenRowLegacy(r as FlattenSource));
  const headerSet = new Set<string>();
  maps.forEach((m) => Object.keys(m).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
  const data = maps.map((m) => headers.map((h) => (m[h] !== undefined ? m[h] : "")));
  return { headers, data };
}

/**
 * Pre-fetch WhatsApp conversations for rows missing __conversation.
 * Mutates rows in-place to avoid re-creating the full array.
 */
async function enrichWaConversations(rows: AnalizadorUnifiedRow[]): Promise<void> {
  const waRows = rows.filter(
    (r) => r.channel === "whatsapp" && !r.__conversation && r.waConversationId,
  );
  if (!waRows.length) return;

  // Batch in groups of 50 to avoid huge IN queries
  const batchSize = 50;
  for (let i = 0; i < waRows.length; i += batchSize) {
    const batch = waRows.slice(i, i + batchSize);
    const ids = batch.map((r) => r.waConversationId!);
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("conversation_id, timestamp, sender_type, agent_name, content, message_type")
      .in("conversation_id", ids)
      .order("timestamp", { ascending: true });

    if (!data?.length) continue;

    // Group messages by conversation_id
    const byConv = new Map<string, typeof data>();
    for (const msg of data) {
      const cid = msg.conversation_id;
      if (!byConv.has(cid)) byConv.set(cid, []);
      byConv.get(cid)!.push(msg);
    }

    for (const row of batch) {
      const msgs = byConv.get(row.waConversationId!);
      if (!msgs?.length) continue;
      const lines = msgs.map((msg: any) => {
        const d = new Date(msg.timestamp);
        const time = d.toLocaleTimeString("es-MX", { hour12: false });
        const dateStr = d.toLocaleDateString("es-MX");
        let role = "[AGENTE]";
        if (msg.sender_type === "Contacto") role = "[CLIENTE]";
        else if (msg.sender_type === "Bot") role = "[BOT]";
        const sender = msg.agent_name && msg.sender_type === "Agente" ? ` (${msg.agent_name})` : "";
        let content = msg.content || "";
        if (msg.message_type === "Audio") content = `[Audio transcrito]: ${content || "Contenido no disponible"}`;
        else if (msg.message_type === "Imagen") content = "[Imagen]";
        else if (msg.message_type === "Documento") content = `[Documento: ${content || "archivo"}]`;
        return `[${dateStr} ${time}] ${role}${sender}: ${content}`;
      });
      row.__conversation = lines.join("\n");
    }
  }
}

export async function downloadAnalizadorCsv(rows: AnalizadorUnifiedRow[], filename: string) {
  await enrichWaConversations(rows);
  const { headers, data } = rowsToMasterExportAoA(rows);
  if (!headers.length) return;
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(";") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(";"), ...data.map((row) => row.map(escape).join(";"))];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAnalizadorXlsx(rows: AnalizadorUnifiedRow[], filename: string) {
  await enrichWaConversations(rows);
  const { headers, data } = rowsToMasterExportAoA(rows);
  if (!headers.length) return;
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
