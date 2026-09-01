import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBibliotecaFiles(
  accountId: string | undefined,
  page: number,
  pageSize: number,
  searchQuery: string,
  statusTab: string,
  filters?: {
    analysisDateFrom?: string;
    analysisDateTo?: string;
    sentiment?: string;
    scoreMin?: string;
    scoreMax?: string;
    agent?: string;
    campaign?: string;
  }
) {
  const queryClient = useQueryClient();

  // Filtros que requieren join INNER con analyses
  const requiresAnalysisInner =
    (filters?.sentiment && filters.sentiment !== "all") ||
    !!filters?.scoreMin ||
    !!filters?.scoreMax ||
    !!filters?.analysisDateFrom ||
    !!filters?.analysisDateTo;

  return useQuery({
    queryKey: ["audio-files", accountId, page, pageSize, searchQuery, statusTab, filters],
    queryFn: async () => {
      if (!accountId) return { data: [], count: 0 };

      const joinSpec = requiresAnalysisInner
        ? "*, analyses!inner(overall_sentiment, sentiment_score, results, created_at)"
        : "*, analyses!left(overall_sentiment, sentiment_score, results, created_at)";

      let supabaseQuery = supabase
        .from("audio_files")
        .select(joinSpec, { count: "exact" })
        .eq("account_id", accountId);

      if (statusTab !== "all") {
        supabaseQuery = supabaseQuery.eq("status", statusTab as any);
      }

      if (searchQuery) {
        supabaseQuery = supabaseQuery.ilike("file_name", `%${searchQuery}%`);
      }

      if (filters?.sentiment && filters.sentiment !== "all") {
        supabaseQuery = supabaseQuery.eq("analyses.overall_sentiment", filters.sentiment);
      }

      if (filters?.scoreMin) {
        const min = Number(filters.scoreMin) / 100;
        if (!isNaN(min)) supabaseQuery = supabaseQuery.gte("analyses.sentiment_score", min);
      }
      if (filters?.scoreMax) {
        const max = Number(filters.scoreMax) / 100;
        if (!isNaN(max)) supabaseQuery = supabaseQuery.lte("analyses.sentiment_score", max);
      }

      if (filters?.analysisDateFrom) {
        supabaseQuery = supabaseQuery.gte("analyses.created_at", filters.analysisDateFrom);
      }
      if (filters?.analysisDateTo) {
        supabaseQuery = supabaseQuery.lte("analyses.created_at", filters.analysisDateTo + "T23:59:59");
      }

      // Asesor / Campaña ya NO se filtran en servidor: se aplican client-side
      // sobre `mergedExtByFile` porque la fuente real es SFTP/extracciones, no metadata.

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabaseQuery
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (count && page * pageSize < count) {
        queryClient.prefetchQuery({
          queryKey: ["audio-files", accountId, page + 1, pageSize, searchQuery, statusTab, filters],
          queryFn: async () => {
            const { data: nextData } = await supabase
              .from("audio_files")
              .select("*")
              .eq("account_id", accountId)
              .order("created_at", { ascending: false })
              .range(page * pageSize, (page + 1) * pageSize - 1);
            return { data: nextData || [], count };
          },
        });
      }

      return { data: data || [], count: count || 0 };
    },
    enabled: !!accountId,
  });
}
