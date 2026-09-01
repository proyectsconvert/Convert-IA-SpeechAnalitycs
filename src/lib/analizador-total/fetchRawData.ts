import { supabase } from "@/integrations/supabase/client";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { processRawDataIntoUnifiedRows } from "./processRawData";

const sb = supabase as any;

/**
 * Paginación robusta:
 *  - Cuenta primero y planifica páginas
 *  - Reintenta con tamaños decrecientes ante timeouts/500 del servidor
 *  - Limita la concurrencia para evitar saturación
 */
async function fetchAllPaginated(
  table: string,
  accountId: string,
  select: string,
  filters?: { column: string; value: any }[],
  options?: { initialPageSize?: number; concurrency?: number; sinceIso?: string; sinceColumn?: string },
): Promise<any[]> {
  const INITIAL_PAGE = options?.initialPageSize ?? 500;
  const CONCURRENCY = options?.concurrency ?? 3;
  const MIN_PAGE = 50;
  const sinceIso = options?.sinceIso;
  const sinceColumn = options?.sinceColumn ?? "created_at";

  // Conteo total
  let countQuery = sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  filters?.forEach((f) => { countQuery = countQuery.eq(f.column, f.value); });
  if (sinceIso) countQuery = countQuery.gte(sinceColumn, sinceIso);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;
  const total = count || 0;
  if (total === 0) return [];

  // Carga un rango con reintento partiendo a la mitad en caso de timeout/500
  async function loadRange(from: number, to: number): Promise<any[]> {
    const size = to - from + 1;
    let q = sb
      .from(table)
      .select(select)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .range(from, to);
    filters?.forEach((f) => { q = q.eq(f.column, f.value); });
    if (sinceIso) q = q.gte(sinceColumn, sinceIso);
    const { data, error } = await q;
    if (!error) return data || [];

    const msg = (error?.message || "").toLowerCase();
    const isTimeout =
      error?.code === "57014" ||
      msg.includes("timeout") ||
      msg.includes("statement") ||
      msg.includes("canceling") ||
      msg.includes("500");

    if (isTimeout && size > MIN_PAGE) {
      const mid = from + Math.floor(size / 2) - 1;
      console.warn(`[AnalizadorTotal] Reintentando ${table} ${from}-${to} dividido (timeout)`);
      const [a, b] = await Promise.all([loadRange(from, mid), loadRange(mid + 1, to)]);
      return [...a, ...b];
    }
    throw error;
  }

  const ranges: Array<[number, number]> = [];
  for (let from = 0; from < total; from += INITIAL_PAGE) {
    const to = Math.min(from + INITIAL_PAGE - 1, total - 1);
    ranges.push([from, to]);
  }

  const all: any[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const chunk = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(([f, t]) => loadRange(f, t)));
    for (const r of results) all.push(...r);
  }
  return all;
}

export async function fetchAnalizadorTotalRawData(
  accountId: string,
  options?: { since?: Date },
): Promise<AnalizadorUnifiedRow[]> {
  const sinceIso = options?.since ? options.since.toISOString() : undefined;
  const scope = sinceIso ? `desde ${sinceIso}` : "todo el histórico";
  console.log(`[AnalizadorTotal] Iniciando carga (${scope}) para cuenta: ${accountId}`);
  const startTime = performance.now();

  const AUDIO_COLS =
    "id, file_name, created_at, duration_seconds, metadata, status";

  const [extractionRules, audioFilesRaw, analysesRaw, transcriptionRows, waConversationsRaw, waResults] = await Promise.all([
    supabase
      .from("extraction_rules")
      .select("id, name, source, extraction_type, config")
      .eq("account_id", accountId)
      .then((res) => res.data || []),

    fetchAllPaginated(
      "audio_files",
      accountId,
      AUDIO_COLS,
      [{ column: "status", value: "completed" }],
      { initialPageSize: 1000, concurrency: 4, sinceIso },
    ),

    fetchAllPaginated("analyses", accountId, "*", undefined, { sinceIso }),

    fetchAllPaginated(
      "transcriptions",
      accountId,
      "audio_file_id, full_text",
      undefined,
      { initialPageSize: 300, concurrency: 2, sinceIso },
    ),

    fetchAllPaginated(
      "whatsapp_conversations",
      accountId,
      "id, created_at, start_date, end_date, contact_name, ticket, phone_number, external_id, duracion_conversacion, total_messages, sentiment, score_general, initial_msg_text, first_agent_name, campaign, status",
      [{ column: "status", value: "analizado" }],
      { sinceIso, sinceColumn: "start_date" },
    ),

    fetchAllPaginated(
      "whatsapp_analysis_results",
      accountId,
      "conversation_id, created_at, analyzed_at, results, score_general, analysis_status",
      [{ column: "analysis_status", value: "completed" }],
      { sinceIso },
    ),
  ]);

  const analysesByAudio = new Map<string, any[]>();
  for (const a of analysesRaw || []) {
    if (!a?.audio_file_id) continue;
    const arr = analysesByAudio.get(a.audio_file_id) || [];
    arr.push(a);
    analysesByAudio.set(a.audio_file_id, arr);
  }

  const txByAudio = new Map<string, string>();
  for (const t of transcriptionRows || []) {
    if (t?.audio_file_id && t.full_text) txByAudio.set(t.audio_file_id, t.full_text);
  }

  const audioFiles = (audioFilesRaw || [])
    .map((af: any) => ({
      ...af,
      analyses: analysesByAudio.get(af.id) || [],
      transcriptions: txByAudio.has(af.id) ? [{ full_text: txByAudio.get(af.id) }] : [],
    }))
    .filter((af: any) => af.analyses.length > 0);

  const endTime = performance.now();
  console.log(
    `[AnalizadorTotal] Carga (${scope}) en ${((endTime - startTime) / 1000).toFixed(2)}s. Llamadas=${audioFiles.length}, WA=${waConversationsRaw.length}`,
  );

  return processRawDataIntoUnifiedRows({
    extractionRules,
    audioFiles,
    waConversations: waConversationsRaw,
    waResults: waResults || [],
  });
}

