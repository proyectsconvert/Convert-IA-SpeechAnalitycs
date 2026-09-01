import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type ExtRuleRow,
  type WaConversationRow,
  jsonToRecord,
  partitionExtractionRules,
  computeWhatsappExtractionCells,
} from "@/lib/extractions/applyExtractionRules";
import { buildMergedExtByFileId } from "./callExtMerge";
import { resolveCallExtKeys } from "./filterDatasets";

export function useAnaliticasDatasets(accountId: string | undefined, options?: { since?: Date }) {
  const sinceIso = options?.since ? options.since.toISOString() : null;
  const windowKey = sinceIso ? `since:${sinceIso}` : "full";
  const { data: files = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["audio-files", accountId, windowKey],
    queryFn: async () => {
      if (!accountId) return [];
      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("audio_files")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (sinceIso) q = q.gte("created_at", sinceIso);
        const { data } = await q;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      return allData;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const fileIdsSig = useMemo(() => [...files.map((f: { id: string }) => f.id)].sort().join(","), [files]);

  const { data: extractionBundle, isLoading: loadingExt } = useQuery({
    queryKey: ["analiticas-call-extractions", accountId, fileIdsSig],
    queryFn: async () => {
      if (!accountId) return { ruleRows: [] as ExtRuleRow[], dbMap: new Map<string, Record<string, string>>() };
      const { data: rulesRaw } = await supabase
        .from("extraction_rules")
        .select("id, name, source, extraction_type, config")
        .eq("account_id", accountId);
      const ruleRows = (rulesRaw || []).filter((r: any) => {
        const cfg = r.config;
        if (cfg && typeof cfg === "object" && !Array.isArray(cfg) && (cfg as any).targetChannel === "whatsapp") return false;
        return true;
      }) as ExtRuleRow[];

      const dbMap = new Map<string, Record<string, string>>();
      const ruleMap = new Map(ruleRows.map((r) => [r.id, r.name]));
      const ids = fileIdsSig ? fileIdsSig.split(",").filter(Boolean) : [];
      const BATCH = 120;
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        if (!chunk.length) continue;
        const { data: extractions } = await supabase
          .from("call_extractions")
          .select("audio_file_id, rule_id, extracted_value")
          .in("audio_file_id", chunk);
        (extractions || []).forEach((ex: { audio_file_id: string; rule_id: string; extracted_value: string }) => {
          const ruleName = ruleMap.get(ex.rule_id);
          if (!ruleName) return;
          const key = `${ruleName}_EX`;
          const prev = dbMap.get(ex.audio_file_id) || {};
          prev[key] = ex.extracted_value || "";
          dbMap.set(ex.audio_file_id, prev);
        });
      }
      return { ruleRows, dbMap };
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const { data: analysesList = [], isLoading: loadingAnalyses } = useQuery({
    queryKey: ["analiticas-analyses", accountId, windowKey],
    queryFn: async () => {
      if (!accountId) return [];
      let q = supabase.from("analyses").select("*").eq("account_id", accountId);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const { data: transcriptionTextByAudio = {}, isLoading: loadingTx } = useQuery({
    queryKey: ["analiticas-transcriptions-text", accountId, windowKey],
    queryFn: async () => {
      const acc: Record<string, string> = {};
      if (!accountId) return acc;
      const loadRange = async (from: number, to: number): Promise<any[]> => {
        let q = supabase
          .from("transcriptions")
          .select("audio_file_id, full_text")
          .eq("account_id", accountId)
          .range(from, to);
        if (sinceIso) q = q.gte("created_at", sinceIso);
        const { data, error } = await q;
        if (!error) return data || [];
        const size = to - from + 1;
        const msg = (error?.message || "").toLowerCase();
        const isTimeout = error?.code === "57014" || msg.includes("timeout") || msg.includes("statement") || msg.includes("canceling");
        if (isTimeout && size > 50) {
          const mid = from + Math.floor(size / 2) - 1;
          const [a, b] = await Promise.all([loadRange(from, mid), loadRange(mid + 1, to)]);
          return [...a, ...b];
        }
        throw error;
      };
      const PAGE = 300;
      let from = 0;
      while (true) {
        const rows = await loadRange(from, from + PAGE - 1);
        rows.forEach((t: any) => {
          if (t.audio_file_id && t.full_text) acc[t.audio_file_id] = t.full_text;
        });
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return acc;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const { data: waConversations = [], isLoading: loadingWa } = useQuery({
    queryKey: ["analiticas-wa-conversations", accountId, windowKey],
    queryFn: async () => {
      if (!accountId) return [];
      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("whatsapp_conversations")
          .select("id, created_at, start_date, end_date, contact_name, ticket, phone_number, external_id, duracion_conversacion, total_messages, sentiment, score_general, initial_msg_text, first_agent_name, campaign, status")
          .eq("account_id", accountId)
          .order("start_date", { ascending: false })
          .range(from, from + PAGE - 1);
        if (sinceIso) q = q.gte("start_date", sinceIso);
        const { data, error } = await q;
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      return allData;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const { data: waExtractionRulesRaw = [] } = useQuery({
    queryKey: ["wa-list-extraction-rules", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_rules")
        .select("id, name, source, extraction_type, config")
        .eq("account_id", accountId!);
      if (error) throw error;
      return (data || []) as ExtRuleRow[];
    },
    enabled: !!accountId,
    staleTime: 120_000,
  });

  const { waOnlyRules, callRulesWithWaSync } = useMemo(
    () => partitionExtractionRules(waExtractionRulesRaw),
    [waExtractionRulesRaw],
  );

  const waExtColumnIds = useMemo(() => {
    const names = new Set<string>();
    waOnlyRules.forEach((r) => names.add(`${r.name}_EX`));
    callRulesWithWaSync.forEach((r) => names.add(`${r.name}_EX`));
    return [...names];
  }, [waOnlyRules, callRulesWithWaSync]);

  const { data: waAnalysisRows = [], isLoading: loadingWaRes } = useQuery({
    queryKey: ["wa-list-analysis-results", accountId, windowKey],
    queryFn: async () => {
      let all: Record<string, unknown>[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let q = supabase
          .from("whatsapp_analysis_results")
          .select("*")
          .eq("account_id", accountId!)
          .eq("analysis_status", "completed")
          .range(from, from + PAGE - 1);
        if (sinceIso) q = q.gte("created_at", sinceIso);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data || [];
        all = all.concat(rows as Record<string, unknown>[]);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    enabled: !!accountId,
    staleTime: 60_000,
    // refetchInterval solo tiene sentido para la ventana reciente
    refetchInterval: sinceIso ? 60_000 : false,
  });

  const waByConvId = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    waAnalysisRows.forEach((r) => {
      const convId = r.conversation_id as string;
      const prev = m.get(convId);
      const rTime = new Date((r.analyzed_at as string) || (r.created_at as string) || 0).getTime();
      const pTime = prev
        ? new Date((prev.analyzed_at as string) || (prev.created_at as string) || 0).getTime()
        : 0;
      if (!prev || rTime >= pTime) m.set(convId, r);
    });
    return m;
  }, [waAnalysisRows]);

  const convIdsNeedingAgentSig = useMemo(
    () =>
      waConversations
        .filter((c: any) => !c.first_agent_name)
        .map((c: any) => c.id)
        .sort()
        .join(","),
    [waConversations],
  );

  const { data: waAgentFallbackRecord = {} } = useQuery({
    queryKey: ["wa-agent-fallbacks", accountId, convIdsNeedingAgentSig],
    queryFn: async () => {
      const ids = convIdsNeedingAgentSig ? convIdsNeedingAgentSig.split(",").filter(Boolean) : [];
      const rec: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data: agentMsgs } = await supabase
          .from("whatsapp_messages")
          .select("conversation_id, agent_name")
          .in("conversation_id", chunk)
          .eq("sender_type", "Agente")
          .not("agent_name", "is", null)
          .order("timestamp", { ascending: true });
        (agentMsgs || []).forEach((m: { conversation_id: string; agent_name: string | null }) => {
          if (m.agent_name && !rec[m.conversation_id]) rec[m.conversation_id] = m.agent_name;
        });
      }
      return rec;
    },
    enabled: !!accountId && !!convIdsNeedingAgentSig,
    staleTime: 120_000,
  });

  const waExtCellsByConv = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    if (!waConversations.length) return m;
    for (const conv of waConversations) {
      const res = waByConvId.get(conv.id);
      const results = jsonToRecord((res?.results as Parameters<typeof jsonToRecord>[0]) ?? null);
      const agentFallback =
        conv.first_agent_name || waAgentFallbackRecord[conv.id] || "Desconocido";
      const cells = computeWhatsappExtractionCells(
        conv as WaConversationRow,
        results,
        agentFallback,
        waOnlyRules,
        callRulesWithWaSync,
      );
      m.set(conv.id, cells);
    }
    return m;
  }, [waConversations, waByConvId, waAgentFallbackRecord, waOnlyRules, callRulesWithWaSync]);

  const analysisByFileId = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    analysesList.forEach((a: { audio_file_id: string }) => m.set(a.audio_file_id, a as Record<string, unknown>));
    return m;
  }, [analysesList]);

  const mergedExtByFile = useMemo(() => {
    if (!extractionBundle || !files.length) return new Map<string, Record<string, string>>();
    return buildMergedExtByFileId(
      files,
      extractionBundle.ruleRows,
      extractionBundle.dbMap,
      analysisByFileId,
      transcriptionTextByAudio,
    );
  }, [files, extractionBundle, analysisByFileId, transcriptionTextByAudio]);

  const callExtColumnIds = useMemo(
    () => (extractionBundle?.ruleRows || []).map((r) => `${r.name}_EX`),
    [extractionBundle],
  );

  const callExtKeys = useMemo(() => resolveCallExtKeys(callExtColumnIds), [callExtColumnIds]);

  const waExtKeys = useMemo(() => resolveCallExtKeys(waExtColumnIds), [waExtColumnIds]);

  const isLoading =
    loadingFiles ||
    loadingExt ||
    loadingAnalyses ||
    loadingTx ||
    loadingWa ||
    loadingWaRes;

  return {
    isLoading,
    files,
    analysesList,
    analysesByFileId: analysisByFileId,
    mergedExtByFile,
    callExtKeys,
    callExtColumnIds,
    waConversations,
    waAnalysisRows,
    waByConvId,
    waExtCellsByConv,
    waExtKeys,
    waExtColumnIds,
    waAgentFallbackRecord,
  };
}
