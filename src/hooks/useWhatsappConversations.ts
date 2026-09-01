import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsappFilters {
  searchTerm: string;
  status: string;
  cargaDateFrom: string;
  cargaDateTo: string;
  analysisDateFrom?: string;
  analysisDateTo?: string;
  sentiment?: string;
  scoreMin?: string;
  scoreMax?: string;
  agent?: string;
  campaign?: string;
}

export function useWhatsappConversations(
  accountId: string | undefined,
  page: number,
  pageSize: number,
  filters: WhatsappFilters
) {
  const queryClient = useQueryClient();

  const queryKey = ["whatsapp-conversations", accountId, page, pageSize, filters];

  const buildQuery = (client: any, accountId: string, filters: WhatsappFilters) => {
    let q = client
      .from("whatsapp_conversations")
      .select("id, created_at, start_date, end_date, contact_name, ticket, phone_number, external_id, duracion_conversacion, total_messages, sentiment, score_general, initial_msg_text, first_agent_name, campaign, status", { count: "exact" })
      .eq("account_id", accountId);

    if (filters.status !== "all") {
      if (filters.status === "no_analizado") {
        q = q.in("status", ["no_analizado", "pendiente"]);
      } else {
        q = q.eq("status", filters.status);
      }
    }

    if (filters.searchTerm) {
      const term = `%${filters.searchTerm}%`;
      q = q.or(
        `contact_name.ilike.${term},phone_number.ilike.${term},campaign.ilike.${term},external_id.ilike.${term}`
      );
    }

    if (filters.cargaDateFrom) q = q.gte("start_date", filters.cargaDateFrom);
    if (filters.cargaDateTo) q = q.lte("start_date", filters.cargaDateTo);

    // Advanced filters
    if (filters.sentiment && filters.sentiment !== "all") {
      q = q.eq("sentiment", filters.sentiment);
    }
    if (filters.scoreMin) {
      q = q.gte("score_general", parseFloat(filters.scoreMin) / 100);
    }
    if (filters.scoreMax) {
      q = q.lte("score_general", parseFloat(filters.scoreMax) / 100);
    }
    if (filters.agent && filters.agent !== "all") {
      q = q.eq("first_agent_name", filters.agent);
    }
    if (filters.campaign && filters.campaign !== "all") {
      q = q.eq("campaign", filters.campaign);
    }

    return q;
  };

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!accountId) return { data: [], count: 0 };

      let supabaseQuery = buildQuery(supabase, accountId, filters);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabaseQuery
        .order("start_date", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!accountId,
  });

  // Pre-fetching
  if (query.data && page * pageSize < query.data.count) {
    const nextKey = ["whatsapp-conversations", accountId, page + 1, pageSize, filters];
    queryClient.prefetchQuery({
      queryKey: nextKey,
      queryFn: async () => {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        let supabaseQuery = buildQuery(supabase, accountId!, filters);

        const { data, error } = await supabaseQuery
          .order("start_date", { ascending: false })
          .range(from, to);

        if (error) throw error;
        return { data: data || [], count: query.data?.count || 0 };
      },
    });
  }

  return query;
}
