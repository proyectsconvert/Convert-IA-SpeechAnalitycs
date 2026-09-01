import type { AnalizadorUnifiedRow, UnifiedChannel } from "@/components/analizador-total/types";
import {
  type ExtRuleRow,
  jsonToRecord,
  partitionExtractionRules,
  applyCallRule,
  applyWaOnlyRule,
  applyCallRuleWaMapping,
} from "@/lib/extractions/applyExtractionRules";
import { enrichAnalizadorRow } from "@/lib/analizador-total/unifiedCobranzaFields";

export interface RawDataPackage {
  extractionRules: any[];
  audioFiles: any[];
  waConversations: any[];
  waResults: any[];
}

export function processRawDataIntoUnifiedRows(raw: RawDataPackage): AnalizadorUnifiedRow[] {
  const { extractionRules, audioFiles, waConversations, waResults } = raw;

  const allRules = (extractionRules ?? []) as ExtRuleRow[];
  const { callRules, callRulesWithWaSync, waOnlyRules } = partitionExtractionRules(allRules);

  // ── CALLS ──
  const merged: AnalizadorUnifiedRow[] = audioFiles.map((af) => {
    const analysis = af.analyses?.[0];
    const metadata = af.metadata as Record<string, unknown> | null;
    const transcriptionFull = af.transcriptions?.[0]?.full_text ?? "";
    const summaryText = analysis?.summary ?? "";

    const row: AnalizadorUnifiedRow & Record<string, unknown> = {
      channel: "call" as UnifiedChannel,
      id: af.id,
      file_name: af.file_name,
      created_at: metadata?.start_time ? new Date(String(metadata.start_time)) : new Date(af.created_at),
      duration: af.duration_seconds || 0,
      status: "analizado - completado",
      sentiment: analysis?.overall_sentiment || "neutral",
      score: (() => {
        const res = jsonToRecord(analysis?.results);
        const sg = Number(res.score_general);
        if (Number.isFinite(sg) && sg > 0) return sg;
        return analysis?.sentiment_score || 0;
      })(),
      summary: summaryText,
      results: jsonToRecord(analysis?.results),
      tags: analysis?.tags ?? [],
      agent:
        (typeof metadata?.agent === "string" && metadata.agent ? String(metadata.agent).replace(/@.*$/, "").trim() : undefined) ||
        (typeof metadata?.agent_name === "string" ? metadata.agent_name : undefined) ||
        (typeof metadata?.user_name === "string" ? metadata.user_name : undefined) ||
        (af.file_name?.includes("-") ? af.file_name.split("-")[0].trim() : "Desconocido"),
      campaign: (typeof metadata?.campaign === "string" ? metadata.campaign : undefined) || (af.metadata?.campaign as string) || "SFTP Import",
      __conversation: transcriptionFull,
    };

    callRules.forEach((rule) => {
      const val = applyCallRule(rule, af.file_name, transcriptionFull, summaryText);
      if (val != null) row[`ext_${rule.name}`] = val;
    });

    // --- PRIORIDAD: Usar FECHA (EXT) para el eje de tiempo del Dashboard ---
    const extractedDateKey = Object.keys(row).find(k => k.toUpperCase().includes("FECHA (EXT)"));
    if (extractedDateKey && row[extractedDateKey]) {
      const d = new Date(String(row[extractedDateKey]));
      if (!isNaN(d.getTime())) {
        row.created_at = d;
      }
    }

    return enrichAnalizadorRow(row);
  });

  // ── WHATSAPP ──
  const waByConv = new Map<string, any>();
  (waResults ?? []).forEach((r) => {
    const prev = waByConv.get(r.conversation_id);
    const rTime = new Date(r.analyzed_at || r.created_at || 0).getTime();
    const pTime = prev ? new Date(prev.analyzed_at || prev.created_at || 0).getTime() : 0;
    if (!prev || rTime >= pTime) waByConv.set(r.conversation_id, r);
  });

  const mapWaSentiment = (conv: any, res: any | undefined) => {
    const resObj = jsonToRecord(res?.results);
    const raw = conv.sentiment || resObj.sentimiento_cliente || "";
    const s = String(raw).toLowerCase();
    if (s.includes("positiv")) return "positive";
    if (s.includes("negativ")) return "negative";
    return "neutral";
  };

  const waMerged: AnalizadorUnifiedRow[] = waConversations.map((conv) => {
    const res = waByConv.get(conv.id);
    const results = jsonToRecord(res?.results);
    const sentiment = mapWaSentiment(conv, res);
    const scoreRaw = res?.score_general ?? conv.score_general ?? 0;
    const scoreNum = Number(scoreRaw) || 0;
    // score_general viene en 0-100 del análisis; mantenerlo tal cual para ranking
    const score = scoreNum;

    const summary =
      (typeof results.resumen_ejecutivo === "string" ? results.resumen_ejecutivo : "") ||
      (typeof results.resumen === "string" ? results.resumen : "") ||
      conv.initial_msg_text ||
      "";

    let duration = 0;
    if (conv.duracion_conversacion != null) {
      const d = Number(conv.duracion_conversacion);
      duration = d < 600 ? d * 60 : d;
    } else {
      duration = (Number(conv.total_messages) || 0) * 30;
    }

    const row: AnalizadorUnifiedRow & Record<string, unknown> = {
      channel: "whatsapp" as UnifiedChannel,
      id: `wa-${conv.id}`,
      waConversationId: conv.id,
      file_name: String(conv.contact_name || conv.ticket || conv.phone_number || conv.external_id || "WhatsApp"),
      created_at: new Date(conv.start_date || conv.created_at),
      duration,
      status: "analizado - completado",
      sentiment,
      score,
      summary,
      results,
      tags: Array.isArray(results.tags) ? (results.tags as string[]) : [],
      agent: conv.first_agent_name || "Desconocido",
      campaign: conv.campaign ?? undefined,
      total_messages: conv.total_messages ?? undefined,
      __conversation: "", // Se carga on-demand en el panel de detalle
    };

    const agentFallback = row.agent as string;

    waOnlyRules.forEach((rule) => {
      const val = applyWaOnlyRule(rule, conv, results, agentFallback);
      if (val != null) row[`ext_${rule.name}`] = val;
    });

    callRulesWithWaSync.forEach((rule) => {
      const val = applyCallRuleWaMapping(rule, conv, results, agentFallback);
      if (val != null) row[`ext_${rule.name}`] = val;
    });

    return enrichAnalizadorRow(row);
  });

  return [...merged, ...waMerged];
}
