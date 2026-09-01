import { extValuesEqual, resolveExtColumnKey } from "@/lib/extractions/extColumnResolve";
import type { AnaliticasFiltersState } from "./types";
import { resolveCallAgentFromFile } from "./callAgent";
import { waAnalysisTimeMs, waCargaTimeMs } from "./waDates";

function inDateRange(d: Date | null, from?: Date, to?: Date): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  if (from) {
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    if (d < f) return false;
  }
  if (to) {
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    if (d > t) return false;
  }
  return true;
}

export function filterAudioFiles(
  files: any[],
  analysesByFileId: Map<string, Record<string, unknown>>,
  mergedExtByFile: Map<string, Record<string, string>>,
  filters: AnaliticasFiltersState,
  extKeys: { asesor?: string; campaña?: string; fecha?: string },
): any[] {
  const { dateRange, dateBasisCalls, sentiment, extAsesor, extCampaña, extFecha } = filters;
  return files.filter((f) => {
    const an = analysesByFileId.get(f.id);
    let dateOk = true;
    if (dateRange?.from || dateRange?.to) {
      const metadata = f.metadata as Record<string, any> | null;
      // Priorizar fecha real del SFTP
      const callDate = metadata?.start_time ? new Date(metadata.start_time) : (f.created_at ? new Date(f.created_at) : null);
      
      if (dateBasisCalls === "upload") {
        dateOk = inDateRange(callDate, dateRange.from, dateRange.to);
      } else {
        if (f.status !== "completed") {
           dateOk = false;
        } else {
           const an = analysesByFileId.get(f.id);
           // Si es SFTP usar fecha real, si no, fecha de análisis
           const analysisDate = metadata?.start_time ? new Date(metadata.start_time) : (an?.created_at ? new Date(an.created_at as string) : null);
           dateOk = inDateRange(analysisDate, dateRange.from, dateRange.to);
        }
      }
    }
    if (!dateOk) return false;

    if (sentiment !== "all") {
      if (f.status !== "completed") return false;
      const sen = String(an?.overall_sentiment || "").trim().toLowerCase();
      if (sen !== sentiment.trim().toLowerCase()) return false;
    }

    if (extAsesor !== "all") {
      if (extKeys.asesor) {
        const cell = mergedExtByFile.get(f.id)?.[extKeys.asesor] ?? "—";
        if (!extValuesEqual(cell, extAsesor)) return false;
      } else {
        if (!extValuesEqual(resolveCallAgentFromFile(f), extAsesor)) return false;
      }
    }
    if (extCampaña !== "all" && extKeys.campaña) {
      const cell = mergedExtByFile.get(f.id)?.[extKeys.campaña] ?? "—";
      if (!extValuesEqual(cell, extCampaña)) return false;
    }
    if (extFecha !== "all" && extKeys.fecha) {
      const cell = mergedExtByFile.get(f.id)?.[extKeys.fecha] ?? "—";
      if (!extValuesEqual(cell, extFecha)) return false;
    }
    return true;
  });
}

export function filterWhatsappConversations(
  conversations: any[],
  waByConvId: Map<string, Record<string, unknown>>,
  waExtCellsByConv: Map<string, Record<string, string>>,
  waAgentFallback: Record<string, string> | undefined,
  filters: AnaliticasFiltersState,
  extKeys: { asesor?: string; campaña?: string; fecha?: string },
): any[] {
  const { dateRange, dateBasisWa, sentiment, extAsesor, extCampaña, extFecha } = filters;
  return conversations.filter((c) => {
    let dateOk = true;
    if (dateRange?.from || dateRange?.to) {
      const t =
        dateBasisWa === "carga"
          ? waCargaTimeMs(c)
          : waAnalysisTimeMs(c, waByConvId);
      if (t == null) dateOk = false;
      else dateOk = inDateRange(new Date(t), dateRange.from, dateRange.to);
    }
    if (!dateOk) return false;

    if (sentiment !== "all") {
      if (c.status !== "analizado") return false;
      const sen = String(c.sentiment || "").trim().toLowerCase();
      if (sen !== sentiment.trim().toLowerCase()) return false;
    }

    if (extAsesor !== "all") {
      if (extKeys.asesor) {
        const cell = waExtCellsByConv.get(c.id)?.[extKeys.asesor] ?? "—";
        if (!extValuesEqual(cell, extAsesor)) return false;
      } else {
        const agent = String(c.first_agent_name || waAgentFallback?.[c.id] || "Desconocido");
        if (!extValuesEqual(agent, extAsesor)) return false;
      }
    }
    if (extCampaña !== "all" && extKeys.campaña) {
      const cell = waExtCellsByConv.get(c.id)?.[extKeys.campaña] ?? "—";
      if (!extValuesEqual(cell, extCampaña)) return false;
    }
    if (extFecha !== "all" && extKeys.fecha) {
      const cell = waExtCellsByConv.get(c.id)?.[extKeys.fecha] ?? "—";
      if (!extValuesEqual(cell, extFecha)) return false;
    }
    return true;
  });
}

export function resolveCallExtKeys(extColumnIds: string[]) {
  return {
    asesor: resolveExtColumnKey(extColumnIds, "nombre_asesor"),
    campaña: resolveExtColumnKey(extColumnIds, "nombre_campaña"),
    fecha: resolveExtColumnKey(extColumnIds, "fecha_ext"),
  };
}

export function waTagsFromResultRow(r: Record<string, unknown> | undefined): string[] {
  if (!r) return [];
  const results = r.results;
  if (results && typeof results === "object" && !Array.isArray(results)) {
    const tags = (results as Record<string, unknown>).tags;
    if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === "string");
  }
  return [];
}

export function mapWaSentimentToKey(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("positiv")) return "positive";
  if (s.includes("negativ")) return "negative";
  return "neutral";
}
