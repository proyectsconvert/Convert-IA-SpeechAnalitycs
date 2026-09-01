import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBibliotecaVisibleData(
  accountId: string | undefined,
  visibleIds: string[]
) {
  return useQuery({
    queryKey: ["biblioteca-visible-data", accountId, visibleIds],
    queryFn: async () => {
      if (!accountId || visibleIds.length === 0) {
        return { analyses: {}, transcriptions: {}, extractions: {} };
      }

      // 1. Fetch Analyses
      const { data: analyses } = await supabase
        .from("analyses")
        .select("*")
        .in("audio_file_id", visibleIds)
        .eq("account_id", accountId);

      const analysisMap: Record<string, any> = {};
      (analyses || []).forEach(a => analysisMap[a.audio_file_id] = a);

      // 2. Fetch Transcription status/text (briefly)
      const { data: transcriptions } = await supabase
        .from("transcriptions")
        .select("audio_file_id, full_text")
        .in("audio_file_id", visibleIds)
        .eq("account_id", accountId);
      
      const transMap: Record<string, string> = {};
      (transcriptions || []).forEach(t => transMap[t.audio_file_id] = t.full_text);

      // 3. Fetch Extractions
      const { data: extractions } = await supabase
        .from("call_extractions")
        .select("audio_file_id, rule_id, extracted_value")
        .in("audio_file_id", visibleIds);

      const extMap: Record<string, Record<string, string>> = {};
      (extractions || []).forEach(ex => {
        const prev = extMap[ex.audio_file_id] || {};
        prev[ex.rule_id] = ex.extracted_value;
        extMap[ex.audio_file_id] = prev;
      });

      return { analyses: analysisMap, transcriptions: transMap, extractions: extMap };
    },
    enabled: !!accountId && visibleIds.length > 0,
    refetchInterval: 5000, // Keep polling for visible items
  });
}
