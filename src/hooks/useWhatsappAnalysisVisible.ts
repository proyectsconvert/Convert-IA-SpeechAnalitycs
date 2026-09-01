import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsappAnalysisVisible(
  accountId: string | undefined,
  visibleIds: string[]
) {
  return useQuery({
    queryKey: ["wa-visible-analysis", accountId, visibleIds],
    queryFn: async () => {
      if (!accountId || visibleIds.length === 0) return {};

      const { data, error } = await supabase
        .from("whatsapp_analysis_results")
        .select("conversation_id, analyzed_at, created_at, score_general, results, analysis_status")
        .in("conversation_id", visibleIds)
        .eq("account_id", accountId);

      if (error) throw error;

      const m: Record<string, any> = {};
      (data || []).forEach((r) => {
        const convId = r.conversation_id as string;
        const prev = m[convId];
        const rTime = new Date((r.analyzed_at as string) || (r.created_at as string) || 0).getTime();
        const pTime = prev
          ? new Date((prev.analyzed_at as string) || (prev.created_at as string) || 0).getTime()
          : 0;
        if (!prev || rTime >= pTime) m[convId] = r;
      });
      return m;
    },
    enabled: !!accountId && visibleIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as Record<string, any> | undefined;
      if (!data) return 30000;
      const hasInProcess = Object.values(data).some(r => r.analysis_status === 'processing');
      return hasInProcess ? 5000 : 30000;
    }
  });
}
