import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QualityEvaluation, QualityEvaluationItem } from "@/components/analizador-total/quality/types";

export function useQualityEvaluations(accountId: string | undefined) {
  return useQuery({
    queryKey: ["quality-evaluations", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return [] as QualityEvaluation[];
      const all: QualityEvaluation[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("quality_evaluations")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as QualityEvaluation[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });
}

export function useEvaluationDetail(evaluationId: string | null) {
  return useQuery({
    queryKey: ["quality-evaluation-detail", evaluationId],
    enabled: !!evaluationId,
    queryFn: async () => {
      if (!evaluationId) return null;
      const { data, error } = await supabase
        .from("quality_evaluation_items")
        .select("*")
        .eq("evaluation_id", evaluationId);
      if (error) throw error;
      return (data ?? []) as QualityEvaluationItem[];
    },
  });
}

export function useEvaluationsForSource(opts: { audioFileId?: string | null; whatsappConversationId?: string | null }) {
  const key = opts.audioFileId || opts.whatsappConversationId || null;
  return useQuery({
    queryKey: ["quality-evaluation-by-source", key],
    enabled: !!key,
    queryFn: async () => {
      if (!key) return null;
      const q = supabase.from("quality_evaluations").select("*").order("created_at", { ascending: false }).limit(1);
      const { data, error } = opts.audioFileId
        ? await q.eq("audio_file_id", opts.audioFileId)
        : await q.eq("whatsapp_conversation_id", opts.whatsappConversationId!);
      if (error) throw error;
      return ((data ?? []) as QualityEvaluation[])[0] || null;
    },
  });
}

export function useEvaluateInteractions(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { forceAll?: boolean; matrixVersionId?: string }) => {
      if (!accountId) throw new Error("No account");

      // 1. Obtener la versión seleccionada o por defecto
      let versionId = opts?.matrixVersionId;
      if (!versionId) {
        const { data: defaultVersion } = await supabase
          .from("quality_matrix_versions")
          .select("id")
          .eq("account_id", accountId)
          .eq("is_default", true)
          .maybeSingle();

        if (defaultVersion) {
          versionId = defaultVersion.id;
        } else {
          const { data: activeVersion } = await supabase
            .from("quality_matrix_versions")
            .select("id")
            .eq("account_id", accountId)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeVersion) versionId = activeVersion.id;
        }
      }

      if (!versionId) {
        throw new Error("No hay una matriz de calidad activa en esta cuenta. Por favor crea o activa una matriz primero en la pestaña 'Editor de Matriz'.");
      }

      // 2. Buscar audios/llamadas completadas con transcripción
      const { data: audioFiles, error: aErr } = await supabase
        .from("audio_files")
        .select("id, file_name, metadata, transcriptions(full_text)")
        .eq("account_id", accountId)
        .eq("status", "completed");

      if (aErr) throw aErr;

      // 3. Buscar WhatsApps con transcripción
      const { data: waConvs, error: wErr } = await supabase
        .from("whatsapp_conversations")
        .select("id, agente_principal, transcript_summary")
        .eq("account_id", accountId);

      if (wErr) throw wErr;

      // 4. Buscar evaluaciones ya existentes
      const { data: existingEvals } = await supabase
        .from("quality_evaluations")
        .select("audio_file_id, whatsapp_conversation_id")
        .eq("account_id", accountId);

      const evaluatedAudioIds = new Set((existingEvals ?? []).map((e) => e.audio_file_id).filter(Boolean));
      const evaluatedWaIds = new Set((existingEvals ?? []).map((e) => e.whatsapp_conversation_id).filter(Boolean));

      const pendingCalls = (audioFiles ?? []).filter((a) => {
        const trans = a.transcriptions;
        const text = Array.isArray(trans) ? trans[0]?.full_text : (trans as any)?.full_text;
        if (!text || text.length < 20) return false;
        if (opts?.forceAll) return true;
        return !evaluatedAudioIds.has(a.id);
      });

      const pendingWa = (waConvs ?? []).filter((w) => {
        if (!w.transcript_summary || w.transcript_summary.length < 20) return false;
        if (opts?.forceAll) return true;
        return !evaluatedWaIds.has(w.id);
      });

      const totalToEval = pendingCalls.length + pendingWa.length;
      if (totalToEval === 0) {
        return { evaluated: 0, message: "Todas las llamadas y conversaciones ya cuentan con evaluación de calidad." };
      }

      let count = 0;
      // Evaluar llamadas
      for (const call of pendingCalls) {
        const trans = call.transcriptions;
        const transcriptText = Array.isArray(trans) ? trans[0]?.full_text : (trans as any)?.full_text;
        if (!transcriptText) continue;

        const agentName = (call.metadata as any)?.agent || (call.metadata as any)?.agent_name || null;
        try {
          await supabase.functions.invoke("evaluate-quality", {
            body: {
              account_id: accountId,
              source_type: "call",
              audio_file_id: call.id,
              agent_name: agentName,
              conversation_text: transcriptText,
              quality_matrix_id: versionId,
            },
          });
          count++;
        } catch (e: any) {
          console.warn("Error evaluando llamada:", call.id, e);
        }
      }

      // Evaluar WhatsApps
      for (const wa of pendingWa) {
        if (!wa.transcript_summary) continue;
        try {
          await supabase.functions.invoke("evaluate-quality", {
            body: {
              account_id: accountId,
              source_type: "whatsapp",
              whatsapp_conversation_id: wa.id,
              agent_name: wa.agente_principal || null,
              conversation_text: wa.transcript_summary,
              quality_matrix_id: versionId,
            },
          });
          count++;
        } catch (e: any) {
          console.warn("Error evaluando whatsapp:", wa.id, e);
        }
      }

      return { evaluated: count, message: `Se evaluaron ${count} interacción(es) exitosamente contra la matriz activa.` };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-evaluations", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-evaluation-by-source"] });
    },
  });
}
