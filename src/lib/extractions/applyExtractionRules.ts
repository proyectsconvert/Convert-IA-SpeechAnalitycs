import type { Database, Json } from "@/integrations/supabase/types";

export type WaConversationRow = Database["public"]["Tables"]["whatsapp_conversations"]["Row"];

export interface ExtRuleRow {
  id: string;
  name: string;
  source: string;
  extraction_type: string;
  config: Json;
}

export function jsonToRecord(j: Json | null | undefined): Record<string, unknown> {
  if (j && typeof j === "object" && !Array.isArray(j)) {
    return j as Record<string, unknown>;
  }
  return {};
}

export function isWaOnlyRule(r: ExtRuleRow): boolean {
  const cfg = r.config;
  return !!cfg && typeof cfg === "object" && !Array.isArray(cfg) && (cfg as Record<string, unknown>).targetChannel === "whatsapp";
}

export function getWaMapping(r: ExtRuleRow): Record<string, unknown> | null {
  const cfg = r.config;
  if (!cfg || typeof cfg !== "object") return null;
  const obj = (Array.isArray(cfg) ? null : cfg) as Record<string, unknown> | null;
  if (!obj) return null;
  const wm = obj.waMapping as Record<string, unknown> | undefined;
  return wm?.enabled ? wm : null;
}

export function cleanDateOnly(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cleanAgentName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/^(asesor|agente)[:\s]*/i, "");
}

export function applyCallRule(
  rule: ExtRuleRow,
  fileName: string,
  transcriptionFull: string,
  summaryText: string,
): string | undefined {
  if (isWaOnlyRule(rule)) return undefined;

  let sourceText = "";
  switch (rule.source) {
    case "filename":
      sourceText = fileName;
      break;
    case "transcription_cliente":
      sourceText = transcriptionFull
        .split("\n")
        .filter((l) => l.toLowerCase().includes("cliente:"))
        .join(" ")
        .toLowerCase();
      break;
    case "transcription_asesor":
      sourceText = transcriptionFull
        .split("\n")
        .filter((l) => l.toLowerCase().includes("asesor:"))
        .join(" ")
        .toLowerCase();
      break;
    case "summary":
      sourceText = (summaryText || "").toLowerCase();
      break;
    default:
      return undefined;
  }

  if (!sourceText) return undefined;

  try {
    const cfg = rule.config as Record<string, unknown>;

    if (rule.extraction_type === "split" && cfg) {
      const separator = typeof cfg.separator === "string" ? cfg.separator : "_";
      const index = typeof cfg.index === "number" ? cfg.index : 0;
      const parts = sourceText.split(separator);
      if (parts.length > index) {
        const val = parts[index].trim();
        return val || undefined;
      }
    } else if (rule.extraction_type === "keyword_mapping") {
      const mappingsArr = Array.isArray(rule.config)
        ? rule.config
        : Array.isArray((rule.config as Record<string, unknown>)?.mappings)
          ? ((rule.config as Record<string, unknown>).mappings as unknown[])
          : null;
      if (!mappingsArr) return undefined;
      for (const mapping of mappingsArr as { keywords?: string[]; output?: string }[]) {
        const keywords: string[] = mapping.keywords ?? [];
        const found = keywords.some((kw) => sourceText.includes(String(kw).toLowerCase()));
        if (found && mapping.output) return mapping.output;
      }
    }
  } catch {
    // skip broken rules
  }

  return undefined;
}

export function resolveWaSource(
  ws: string,
  conv: WaConversationRow,
  results: Record<string, unknown>,
  cfg: Record<string, unknown>,
  agentFallback?: string,
): string | undefined {
  if (ws === "wa_agent_first" || ws === "wa_agent_last") {
    return cleanAgentName(conv.first_agent_name) || agentFallback || undefined;
  }
  if (ws === "wa_date_first") return cleanDateOnly(conv.start_date ?? conv.created_at);
  if (ws === "wa_date_last") return cleanDateOnly(conv.end_date ?? conv.start_date ?? conv.created_at);
  if (ws === "wa_campaign") return conv.campaign ?? undefined;
  if (ws === "wa_contact_name") return conv.contact_name ?? undefined;
  if (ws === "wa_total_messages") return conv.total_messages != null ? String(conv.total_messages) : undefined;
  if (ws === "wa_analysis_field") {
    const fieldKey = typeof cfg.fieldKey === "string" ? cfg.fieldKey : "";
    const fieldVal = results[fieldKey];
    return fieldVal != null ? String(fieldVal) : undefined;
  }
  if (ws === "wa_static_value") {
    return typeof cfg.staticValue === "string" ? cfg.staticValue : undefined;
  }
  return undefined;
}

export function applyWaOnlyRule(
  rule: ExtRuleRow,
  conv: WaConversationRow,
  results: Record<string, unknown>,
  agentFallback: string,
): string | undefined {
  const cfg = rule.config as Record<string, unknown>;
  return resolveWaSource(cfg.waSource as string, conv, results, cfg, agentFallback);
}

export function applyCallRuleWaMapping(
  rule: ExtRuleRow,
  conv: WaConversationRow,
  results: Record<string, unknown>,
  agentFallback: string,
): string | undefined {
  const wm = getWaMapping(rule);
  if (!wm) return undefined;
  return resolveWaSource(wm.waSource as string, conv, results, wm, agentFallback);
}

export function partitionExtractionRules(allRules: ExtRuleRow[]) {
  const callRules = allRules.filter((r) => !isWaOnlyRule(r));
  const callRulesWithWaSync = callRules.filter((r) => getWaMapping(r) !== null);
  const syncedNames = new Set(callRulesWithWaSync.map((r) => r.name));
  const waOnlyRules = allRules.filter((r) => isWaOnlyRule(r) && !syncedNames.has(r.name));
  return { callRules, callRulesWithWaSync, waOnlyRules, syncedNames };
}

/** Valores de columnas `${rule.name}_EX` para una fila de WhatsApp (misma lógica que Unified Analytics). */
export function computeWhatsappExtractionCells(
  conv: WaConversationRow,
  results: Record<string, unknown>,
  agentFallback: string,
  waOnlyRules: ExtRuleRow[],
  callRulesWithWaSync: ExtRuleRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of waOnlyRules) {
    const val = applyWaOnlyRule(rule, conv, results, agentFallback);
    if (val != null) out[`${rule.name}_EX`] = val;
  }
  for (const rule of callRulesWithWaSync) {
    const val = applyCallRuleWaMapping(rule, conv, results, agentFallback);
    if (val != null) out[`${rule.name}_EX`] = val;
  }
  return out;
}
