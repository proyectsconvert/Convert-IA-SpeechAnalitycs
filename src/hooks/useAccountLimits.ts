import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";

export function useAccountLimits() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  // Mes actual en hora local (evita desfases por toISOString en zonas detrás de UTC)
  const now = new Date();
  const y = now.getFullYear();
  const mIdx = now.getMonth();
  const periodStartStr = `${y}-${String(mIdx + 1).padStart(2, "0")}-01`;
  const monthStartIso = new Date(y, mIdx, 1, 0, 0, 0, 0).toISOString();
  const monthEndIso = new Date(y, mIdx + 1, 1, 0, 0, 0, 0).toISOString();

  const { data: limits } = useQuery({
    queryKey: ["account-limits-check", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data } = await supabase
        .from("account_limits")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

  const { data: usage } = useQuery({
    queryKey: ["account-usage-check", accountId, periodStartStr],
    queryFn: async () => {
      if (!accountId) return null;
      const { data, error } = await supabase
        .from("usage_tracking")
        .select("*")
        .eq("account_id", accountId)
        .eq("period_start", periodStartStr)
        .maybeSingle();
      if (error) {
        console.warn("[useAccountLimits] usage query error", error);
        return null;
      }
      return data as any;
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

  // Horas REALES del mes desde audio_files (mismo criterio que la página de Límites)
  const { data: realHoursMonth } = useQuery({
    queryKey: ["account-real-hours-month", accountId, periodStartStr],
    queryFn: async () => {
      if (!accountId) return 0;
      let totalSeconds = 0;
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("audio_files")
          .select("duration_seconds")
          .eq("account_id", accountId)
          .gte("created_at", monthStartIso)
          .lt("created_at", monthEndIso)
          .range(from, from + pageSize - 1);
        if (error) {
          console.warn("[useAccountLimits] audio_files query error", error);
          break;
        }
        if (!data || data.length === 0) break;
        totalSeconds += data.reduce(
          (s, r: any) => s + (Number(r.duration_seconds) || 0),
          0
        );
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return totalSeconds / 3600;
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

  // Conversaciones WhatsApp REALES del mes (mismo criterio que la página de Límites)
  const { data: realWhatsappMonth } = useQuery({
    queryKey: ["account-real-wa-month", accountId, periodStartStr],
    queryFn: async () => {
      if (!accountId) return 0;
      const { count, error } = await supabase
        .from("whatsapp_conversations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .gte("created_at", monthStartIso)
        .lt("created_at", monthEndIso);
      if (error) {
        console.warn("[useAccountLimits] wa count error", error);
        return 0;
      }
      return count ?? 0;
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

  const maxHours = Number(limits?.max_transcription_hours ?? 10) + Number(limits?.additional_hours ?? 0);
  const maxQueries = Number(limits?.max_chatbot_queries ?? 500);
  const maxWhatsapp = Number(limits?.max_whatsapp_conversations ?? 1000);
  const maxPresentations = Number(limits?.max_presentations ?? 50);

  // Preferir el valor calculado en vivo; usar usage_tracking como fallback
  const hoursUsed = Number(
    realHoursMonth ?? usage?.transcription_hours_used ?? 0
  );
  const whatsappUsed = Number(
    realWhatsappMonth ?? usage?.whatsapp_conversations_used ?? 0
  );
  const queriesUsed = Number(usage?.chatbot_queries_used ?? 0);
  const presentationsUsed = Number(usage?.presentations_created ?? 0);

  return {
    canUpload: hoursUsed < maxHours,
    canChat: queriesUsed < maxQueries,
    canUploadWhatsapp: whatsappUsed < maxWhatsapp,
    canCreatePresentation: presentationsUsed < maxPresentations,

    hoursUsed,
    maxHours,
    hoursRemaining: Math.max(0, maxHours - hoursUsed),

    queriesUsed,
    maxQueries,
    queriesRemaining: Math.max(0, maxQueries - queriesUsed),

    whatsappUsed,
    maxWhatsapp,
    whatsappRemaining: Math.max(0, maxWhatsapp - whatsappUsed),

    presentationsUsed,
    maxPresentations,
    presentationsRemaining: Math.max(0, maxPresentations - presentationsUsed),
  };
}
