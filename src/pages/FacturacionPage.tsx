import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { CreditCard, Clock, MessageSquare, Users, HardDrive, MessageCircle, Presentation, CalendarClock } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function FacturacionPage() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const account = currentAccount?.account;

  const { data: limits } = useQuery({
    queryKey: ["billing-limits", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data } = await supabase.from("account_limits").select("*").eq("account_id", accountId).maybeSingle();
      return data;
    },
    enabled: !!accountId,
  });

  const { data: usage } = useQuery({
    queryKey: ["billing-usage", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const periodStart = new Date();
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);

      const { data: usageRow } = await supabase.from("usage_tracking").select("*")
        .eq("account_id", accountId)
        .gte("period_start", periodStart.toISOString().split("T")[0])
        .maybeSingle();

      const { data: files } = await supabase.from("audio_files").select("file_size_bytes, duration_seconds").eq("account_id", accountId);
      const { count: userCount } = await supabase.from("user_accounts").select("*", { count: "exact", head: true }).eq("account_id", accountId);

      const totalBytes = files?.reduce((s, f) => s + (f.file_size_bytes || 0), 0) || 0;
      const totalSeconds = files?.reduce((s, f) => s + (f.duration_seconds || 0), 0) || 0;

      return {
        storageGb: +(totalBytes / (1024 * 1024 * 1024)).toFixed(2),
        totalSeconds,
        hoursUsed: +(usageRow?.transcription_hours_used || 0),
        queriesUsed: usageRow?.chatbot_queries_used || 0,
        whatsappUsed: usageRow?.whatsapp_conversations_used || 0,
        presentationsUsed: usageRow?.presentations_created || 0,
        filesProcessed: usageRow?.files_processed || 0,
        users: userCount || 0,
      };
    },
    enabled: !!accountId,
  });

  const maxHours = Number(limits?.max_transcription_hours || 10) + Number(limits?.additional_hours || 0);
  const maxQueries = limits?.max_chatbot_queries || 500;
  const maxWhatsapp = limits?.max_whatsapp_conversations || 1000;
  const maxPresentations = limits?.max_presentations || 50;
  const maxStorage = Number(limits?.max_storage_gb || account?.max_storage_gb || 10);
  const maxUsers = account?.max_users || 5;

  const hoursUsed = usage?.hoursUsed || 0;
  const totalSecs = usage?.totalSeconds || 0;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

  const renewalDate = (() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
  })();

  const resources = [
    { label: "Horas de Transcripción", used: hoursUsed, total: maxHours, unit: "h", icon: Clock },
    { label: "Conversaciones WhatsApp", used: usage?.whatsappUsed || 0, total: maxWhatsapp, unit: "conv.", icon: MessageCircle },
    { label: "Consultas de Chatbot", used: usage?.queriesUsed || 0, total: maxQueries, unit: "", icon: MessageSquare },
    { label: "Presentaciones", used: usage?.presentationsUsed || 0, total: maxPresentations, unit: "", icon: Presentation },
    { label: "Almacenamiento", used: usage?.storageGb || 0, total: maxStorage, unit: "GB", icon: HardDrive },
    { label: "Usuarios", used: usage?.users || 0, total: maxUsers, unit: "", icon: Users },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Facturación</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Plan Actual" value={account?.plan?.charAt(0).toUpperCase() + (account?.plan?.slice(1) || "")} icon={CreditCard} />
        <StatCard title="Tiempo Transcrito" value={timeStr} subtitle={`${(totalSecs / 3600).toFixed(2)} horas`} icon={Clock} />
        <StatCard title="Consultas IA" value={(usage?.queriesUsed || 0).toLocaleString()} subtitle={`de ${maxQueries.toLocaleString()}`} icon={MessageSquare} />
        <StatCard title="Archivos Procesados" value={(usage?.filesProcessed || 0).toLocaleString()} icon={CreditCard} />
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Consumo por Recurso</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="w-3.5 h-3.5" />
            Se renueva el {renewalDate}
          </div>
        </div>
        <div className="space-y-5">
          {resources.map((r) => {
            const pct = r.total > 0 ? Math.min((r.used / r.total) * 100, 100) : 0;
            const isOverLimit = pct >= 100;
            return (
              <div key={r.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-foreground font-medium flex items-center gap-2">
                    <r.icon className="w-4 h-4 text-muted-foreground" />
                    {r.label}
                    {isOverLimit && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Límite alcanzado</Badge>}
                  </span>
                  <span className="text-muted-foreground">
                    {typeof r.used === "number" && r.used % 1 !== 0 ? r.used.toFixed(2) : r.used.toLocaleString()} / {typeof r.total === "number" && r.total % 1 !== 0 ? r.total.toFixed(2) : r.total.toLocaleString()} {r.unit}
                  </span>
                </div>
                <Progress value={pct} className={`h-2.5 ${isOverLimit ? "[&>div]:bg-destructive" : ""}`} />
              </div>
            );
          })}
        </div>
      </div>

      {limits?.additional_hours && Number(limits.additional_hours) > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-2">Horas Adicionales</h2>
          <p className="text-sm text-muted-foreground">
            Tienes <span className="font-bold text-accent">{Number(limits.additional_hours)}</span> horas adicionales asignadas este período.
          </p>
        </div>
      )}
    </div>
  );
}
