import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import {
  Phone, Activity, MessageCircle, Clock, ArrowRight, CheckCircle2,
  BarChart3, Loader2,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const navigate = useNavigate();

  const { data: audioStats, isLoading: loadingAudio } = useQuery({
    queryKey: ["dashboard-audio-stats", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data: files } = await supabase
        .from("audio_files")
        .select("status, duration_seconds")
        .eq("account_id", accountId);
      if (!files) return { total: 0, completed: 0, error: 0, pending: 0, totalDuration: 0 };
      return {
        total: files.length,
        completed: files.filter((f) => f.status === "completed").length,
        error: files.filter((f) => f.status === "error").length,
        pending: files.filter((f) =>
          ["uploaded", "pending", "queued", "transcribing", "analyzing"].includes(f.status),
        ).length,
        totalDuration: files.reduce((s, f) => s + (f.duration_seconds || 0), 0),
      };
    },
    enabled: !!accountId,
  });

  const { data: waStats, isLoading: loadingWa } = useQuery({
    queryKey: ["dashboard-wa-stats", accountId],
    queryFn: async () => {
      if (!accountId) return { total: 0, analyzed: 0 };
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase
          .from("whatsapp_conversations")
          .select("status")
          .eq("account_id", accountId)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) { hasMore = false; break; }
        all = all.concat(data);
        hasMore = data.length === PAGE;
        from += PAGE;
      }
      return {
        total: all.length,
        analyzed: all.filter((c: any) => c.status === "analizado").length,
      };
    },
    enabled: !!accountId,
  });

  const { data: avgSentiment } = useQuery({
    queryKey: ["dashboard-sentiment-unified", accountId],
    queryFn: async () => {
      if (!accountId) return 0;
      const { data: callScores } = await supabase
        .from("analyses")
        .select("sentiment_score")
        .eq("account_id", accountId)
        .not("sentiment_score", "is", null);
      const { data: waResults } = await supabase
        .from("whatsapp_analysis_results")
        .select("score_general")
        .eq("account_id", accountId)
        .eq("analysis_status", "completed")
        .not("score_general", "is", null);
      const all = [
        ...(callScores || []).map((a) => Number(a.sentiment_score || 0)),
        ...(waResults || []).map((a) => Number(a.score_general || 0)),
      ];
      if (!all.length) return 0;
      return Math.round((all.reduce((s, v) => s + v, 0) / all.length) * 100);
    },
    enabled: !!accountId,
  });

  const { data: trendData } = useQuery({
    queryKey: ["dashboard-trend-unified", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
      const dayLabels = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

      const { data: analyses } = await supabase
        .from("analyses")
        .select("created_at")
        .eq("account_id", accountId);
      let waConvs: any[] = [];
      let wFrom = 0;
      let wMore = true;
      while (wMore) {
        const { data: wPage } = await supabase
          .from("whatsapp_conversations")
          .select("start_date")
          .eq("account_id", accountId)
          .range(wFrom, wFrom + 999);
        if (!wPage || wPage.length === 0) { wMore = false; break; }
        waConvs = waConvs.concat(wPage);
        wMore = wPage.length === 1000;
        wFrom += 1000;
      }

      return days.map((day) => {
        const ds = format(day, "yyyy-MM-dd");
        return {
          day: dayLabels[day.getDay()],
          llamadas: (analyses || []).filter((a) => a.created_at?.startsWith(ds)).length,
          whatsapp: (waConvs || []).filter((c: any) => c.start_date?.startsWith(ds)).length,
        };
      });
    },
    enabled: !!accountId,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["dashboard-recent-unified", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data: files } = await supabase
        .from("audio_files")
        .select("id, file_name, status, duration_seconds, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(5);
      const { data: waConvs } = await supabase
        .from("whatsapp_conversations")
        .select("id, external_id, contact_name, status, total_messages, start_date")
        .eq("account_id", accountId)
        .order("start_date", { ascending: false })
        .limit(5);

      type ActivityRow = {
        id: string;
        channel: "call" | "whatsapp";
        name: string;
        status: string;
        detail: string;
        date: string;
        sortDate: number;
      };

      const callRows: ActivityRow[] = (files || []).map((f) => ({
        id: f.id,
        channel: "call" as const,
        name: f.file_name,
        status: f.status,
        detail: formatDuration(f.duration_seconds || 0),
        date: f.created_at,
        sortDate: new Date(f.created_at).getTime(),
      }));

      const waRows: ActivityRow[] = (waConvs || []).map((c: any) => ({
        id: c.id,
        channel: "whatsapp" as const,
        name: c.contact_name || c.external_id || c.id,
        status: c.status || "no_analizado",
        detail: `${c.total_messages || 0} msgs`,
        date: c.start_date || "",
        sortDate: new Date(c.start_date || 0).getTime(),
      }));

      return [...callRows, ...waRows]
        .sort((a, b) => b.sortDate - a.sortDate)
        .slice(0, 7);
    },
    enabled: !!accountId,
  });

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isLoading = loadingAudio || loadingWa;

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse mt-3">Loading overview...</p>
      </div>
    );
  }

  const totalInteractions = (audioStats?.total || 0) + (waStats?.total || 0);
  const totalMinutes = Math.round((audioStats?.totalDuration || 0) / 60);
  const totalCompleted = (audioStats?.completed || 0) + (waStats?.analyzed || 0);
  const analysisRate = totalInteractions > 0
    ? Math.round((totalCompleted / totalInteractions) * 100)
    : 0;
  const chartData = trendData || [];

  const statusLabel: Record<string, string> = {
    uploaded: "Cargado", pending: "Pendiente", queued: "En Cola",
    transcribing: "Transcribiendo", transcribed: "Transcrito",
    analyzing: "Analizando", completed: "Completado",
    error: "Error", reprocessing: "Reprocesando", cancelled: "Cancelado",
    analizado: "Analizado", no_analizado: "Pendiente", en_proceso: "Procesando",
  };
  const statusVariant = (s: string) => {
    if (s === "completed" || s === "analizado") return "completed" as const;
    if (s === "error") return "error" as const;
    if (["transcribing", "analyzing", "reprocessing", "en_proceso"].includes(s)) return "processing" as const;
    return "pending" as const;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Panel General</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Resumen operativo en tiempo real para{" "}
            <span className="text-accent font-semibold">{currentAccount?.account.name || "Sin cuenta"}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total interacciones" value={totalInteractions.toLocaleString()} icon={BarChart3} />
        <StatCard title="Llamadas" value={(audioStats?.total || 0).toLocaleString()} icon={Phone} />
        <StatCard title="WhatsApp" value={(waStats?.total || 0).toLocaleString()} icon={MessageCircle} />
        <StatCard title="Sentimiento" value={`${avgSentiment || 0}`} subtitle="/100" icon={Activity} />
        <StatCard title="Minutos procesados" value={totalMinutes.toLocaleString()} subtitle="min" icon={Clock} />
        <StatCard title="Tasa análisis" value={`${analysisRate}%`} icon={CheckCircle2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Actividad por canal (7 días)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }} />
              <Area type="monotone" dataKey="llamadas" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth={2} name="Llamadas" />
              <Area type="monotone" dataKey="whatsapp" fill="hsl(var(--success)/0.15)" stroke="hsl(var(--success))" strokeWidth={2} name="WhatsApp" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-primary rounded-xl p-5 text-primary-foreground">
          <h2 className="text-base font-semibold mb-4">Resumen</h2>
          <div className="space-y-4">
            <div><p className="text-sm opacity-80">Llamadas completadas</p><p className="text-3xl font-bold">{audioStats?.completed || 0}</p></div>
            <div><p className="text-sm opacity-80">WhatsApp analizados</p><p className="text-3xl font-bold">{waStats?.analyzed || 0}</p></div>
            <div><p className="text-sm opacity-80">Pendientes</p><p className="text-3xl font-bold">{(audioStats?.pending || 0) + ((waStats?.total || 0) - (waStats?.analyzed || 0))}</p></div>
            <div><p className="text-sm opacity-80">Errores</p><p className="text-3xl font-bold">{audioStats?.error || 0}</p></div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-base font-semibold text-foreground">Actividad reciente</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/biblioteca")} className="text-xs text-accent font-medium flex items-center gap-1 hover:underline">Gestión de Grabaciones <ArrowRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => navigate("/analytics-whatsapp")} className="text-xs text-accent font-medium flex items-center gap-1 hover:underline">Gestión de Chats <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Canal</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nombre</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Detalle</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(!recentActivity?.length) ? (
                <tr>
                  <td colSpan={5} className="py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                        <Activity className="w-8 h-8 text-accent" />
                      </div>
                      <p className="text-base font-semibold text-foreground mb-1">Aún no hay actividad</p>
                      <p className="text-sm text-muted-foreground max-w-sm">Upload voice or WhatsApp interaction data to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : recentActivity.map((r) => (
                <tr
                  key={`${r.channel}-${r.id}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => {
                    if (r.channel === "call" && (r.status === "completed")) navigate(`/transcripciones?audio=${r.id}`);
                    if (r.channel === "whatsapp") navigate(`/analytics-whatsapp?conversation=${r.id}`);
                  }}
                >
                  <td className="px-5 py-3.5">
                    {r.channel === "call"
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600"><Phone className="w-3.5 h-3.5" /> Voz</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"><MessageCircle className="w-3.5 h-3.5" /> WA</span>}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-foreground truncate max-w-[200px]">{r.name}</td>
                  <td className="px-5 py-3.5"><StatusBadge variant={statusVariant(r.status)}>{statusLabel[r.status] || r.status}</StatusBadge></td>
                  <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{r.detail}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{r.date ? format(new Date(r.date), "dd MMM yyyy HH:mm") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
