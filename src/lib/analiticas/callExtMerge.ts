import { applyCallRule, type ExtRuleRow } from "@/lib/extractions/applyExtractionRules";

export function buildMergedExtByFileId(
  files: Array<{ id: string; file_name: string; status: string }>,
  ruleRows: ExtRuleRow[],
  dbMap: Map<string, Record<string, string>> | Record<string, Record<string, string>> | undefined | null,
  analysisByFileId: Map<string, Record<string, unknown>> | Record<string, Record<string, unknown>> | undefined | null,
  transcriptionTextByAudio: Record<string, string> | undefined | null,
): Map<string, Record<string, string>> {
  const m = new Map<string, Record<string, string>>();
  for (const f of (files as any[])) {
    const row: Record<string, string> = {};
    const dbRow = (dbMap instanceof Map ? dbMap.get(f.id) : (dbMap as Record<string, Record<string, string>>)?.[f.id]) || {};
    const analysis = analysisByFileId instanceof Map ? analysisByFileId.get(f.id) : (analysisByFileId as Record<string, Record<string, unknown>>)?.[f.id];
    const fullText = transcriptionTextByAudio?.[f.id] || "";
    const summary = (analysis?.summary as string) || "";
    const metadata = f.metadata as Record<string, any> | null;

    for (const rule of ruleRows) {
      const col = `${rule.name}_EX`;
      const ruleUpper = rule.name.toUpperCase();
      let val: string | undefined = dbRow[col];

      // --- PRIORIDAD SFTP: Si es una regla core y tenemos metadata, usarla ---
      if (metadata && typeof metadata === "object") {
        if (ruleUpper.includes("ASESOR") && metadata.agent) val = metadata.agent;
        if (ruleUpper.includes("CAMPAÑA") && metadata.campaign) val = metadata.campaign;
        if (ruleUpper.includes("FECHA") && metadata.start_time) {
          const rawDate = String(metadata.start_time);
          val = rawDate.includes(" ") ? rawDate.split(" ")[0] : (rawDate.includes("T") ? rawDate.split("T")[0] : rawDate);
        }
      }

      if ((!val || val === "") && f.status === "completed") {
        const c = applyCallRule(rule, f.file_name, fullText, summary);
        if (c != null && c !== "") val = c;
      }
      row[col] = val && val !== "" ? val : "—";
    }
    m.set(f.id, row);
  }
  return m;
}
