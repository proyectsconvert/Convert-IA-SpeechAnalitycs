import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTranscripcionesList(
  accountId: string | undefined,
  page: number,
  pageSize: number,
  searchTerm: string,
  sentimentFilter: string,
  sortOrder: string
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["transcriptions-list", accountId, page, pageSize, searchTerm, sentimentFilter, sortOrder],
    queryFn: async () => {
      if (!accountId) return { data: [], count: 0 };

      let query = supabase
        .from("transcriptions")
        .select("*, audio_files!inner(*)", { count: "exact" })
        .eq("account_id", accountId);

      if (searchTerm) {
        // PostgREST has issues with OR filters across joined tables.
        // We'll fetch matching audio IDs first to construct a simpler OR query.
        const { data: matchedAudios } = await supabase
          .from("audio_files")
          .select("id")
          .eq("account_id", accountId)
          .ilike("file_name", `%${searchTerm}%`);
        
        const audioIds = (matchedAudios || []).map(a => a.id);
        
        if (audioIds.length > 0) {
          // Construct the OR filter with audio IDs
          query = query.or(`full_text.ilike.%${searchTerm}%,audio_file_id.in.(${audioIds.map(id => `"${id}"`).join(',')})`);
        } else {
          // Just search in full_text if no audio files match
          query = query.ilike("full_text", `%${searchTerm}%`);
        }
      }

      // El filtro de sentimiento es complicado porque está en otra tabla (analyses)
      if (sentimentFilter !== "all") {
          const { data: analysisIds } = await supabase
            .from("analyses")
            .select("audio_file_id")
            .eq("account_id", accountId)
            .eq("overall_sentiment", sentimentFilter);
          
          const ids = (analysisIds || []).map(a => a.audio_file_id);
          query = query.in("audio_file_id", ids);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const orderField = sortOrder === "name_asc" || sortOrder === "name_desc" ? "audio_files.file_name" : "created_at";
      const ascending = sortOrder === "oldest" || sortOrder === "name_asc";

      let finalQuery = query.order(orderField as any, { ascending });
      
      const { data, error, count } = await finalQuery.range(from, to);

      if (error) throw error;


      // Pre-fetch next page
      if (count && page * pageSize < count) {
          queryClient.prefetchQuery({
              queryKey: ["transcriptions-list", accountId, page + 1, pageSize, searchTerm, sentimentFilter, sortOrder],
              queryFn: async () => {
                  const { data: nextData } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
                  return { data: nextData || [], count };
              }
          });
      }

      return { data: data || [], count: count || 0 };
    },
    enabled: !!accountId,
  });
}
