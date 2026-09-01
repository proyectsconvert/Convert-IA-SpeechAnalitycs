import { resolveCallAgentFromFile } from "./callAgent";

export interface AnaliticasExtOptions {
  optAsesorCall: string[];
  optCampañaCall: string[];
  optFechaCall: string[];
  optAsesorWa: string[];
  optCampañaWa: string[];
  optFechaWa: string[];
  hasCallExtAsesor: boolean;
  hasWaExtAsesor: boolean;
}

function uniqueCol(m: Map<string, Record<string, string>>, key: string | undefined) {
  if (!key) return [];
  const s = new Set<string>();
  m.forEach((row) => {
    const v = row[key];
    if (v && v !== "—") s.add(v);
  });
  return [...s].sort((a, b) => a.localeCompare(b));
}

export function buildAnaliticasExtOptions(input: {
  files: any[];
  mergedExtByFile: Map<string, Record<string, string>>;
  callExtKeys: { asesor?: string; campaña?: string; fecha?: string };
  waConversations: any[];
  waExtCellsByConv: Map<string, Record<string, string>>;
  waExtKeys: { asesor?: string; campaña?: string; fecha?: string };
  waAgentFallbackRecord: Record<string, string>;
}): AnaliticasExtOptions {
  const {
    files,
    mergedExtByFile,
    callExtKeys,
    waConversations,
    waExtCellsByConv,
    waExtKeys,
    waAgentFallbackRecord,
  } = input;

  const optCampañaCall = uniqueCol(mergedExtByFile, callExtKeys.campaña);
  const optFechaCall = uniqueCol(mergedExtByFile, callExtKeys.fecha);

  let optAsesorCall: string[];
  if (callExtKeys.asesor) {
    optAsesorCall = uniqueCol(mergedExtByFile, callExtKeys.asesor);
  } else {
    const s = new Set<string>();
    files.forEach((f) => {
      if (f.status !== "completed") return;
      const a = resolveCallAgentFromFile(f);
      if (a && a !== "—") s.add(a);
    });
    optAsesorCall = [...s].sort((a, b) => a.localeCompare(b));
  }

  const optCampañaWa = uniqueCol(waExtCellsByConv, waExtKeys.campaña);
  const optFechaWa = uniqueCol(waExtCellsByConv, waExtKeys.fecha);

  let optAsesorWa: string[];
  if (waExtKeys.asesor) {
    optAsesorWa = uniqueCol(waExtCellsByConv, waExtKeys.asesor);
  } else {
    const s = new Set<string>();
    waConversations.forEach((c) => {
      const a = String(c.first_agent_name || waAgentFallbackRecord[c.id] || "").trim();
      if (a) s.add(a);
    });
    optAsesorWa = [...s].sort((a, b) => a.localeCompare(b));
  }

  return {
    optAsesorCall,
    optCampañaCall,
    optFechaCall,
    optAsesorWa,
    optCampañaWa,
    optFechaWa,
    hasCallExtAsesor: !!callExtKeys.asesor,
    hasWaExtAsesor: !!waExtKeys.asesor,
  };
}
