import { Phone, MessageCircle, ArrowRight, Activity } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/ui/status-badge";

interface ActivityRow {
  id: string;
  channel: "call" | "whatsapp";
  name: string;
  status: string;
  detail: string;
  date: string;
  sortDate: number;
}

interface RecentActivityWidgetProps {
  activities: ActivityRow[];
}

export function RecentActivityWidget({ activities }: RecentActivityWidgetProps) {
  const navigate = useNavigate();

  const statusLabel: Record<string, string> = {
    uploaded: "Cargado",
    pending: "Pendiente",
    queued: "En Cola",
    transcribing: "Transcribiendo",
    transcribed: "Transcrito",
    analyzing: "Analizando",
    completed: "Completado",
    error: "Error",
    reprocessing: "Reprocesando",
    cancelled: "Cancelado",
    analizado: "Analizado",
    no_analizado: "Pendiente",
    en_proceso: "Procesando",
  };

  const statusVariant = (s: string) => {
    if (s === "completed" || s === "analizado") return "completed" as const;
    if (s === "error") return "error" as const;
    if (["transcribing", "analyzing", "reprocessing", "en_proceso"].includes(s))
      return "processing" as const;
    return "pending" as const;
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-2xs">
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Actividad Reciente en Vivo</h3>
          <p className="text-xs text-muted-foreground">Últimas interacciones procesadas en la plataforma</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/biblioteca")}
            className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
          >
            Grabaciones <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigate("/analytics-whatsapp")}
            className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
          >
            Conversaciones <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80 bg-secondary/20">
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Canal
              </th>
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Archivo / Contacto
              </th>
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Estado
              </th>
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Detalle
              </th>
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Fecha
              </th>
            </tr>
          </thead>
          <tbody>
            {!activities || activities.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
                      <Activity className="w-6 h-6 text-accent" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Aún no hay actividad reciente</p>
                    <p className="text-xs text-muted-foreground max-w-sm mt-0.5">
                      Sube archivos de audio o conecta chats para visualizar el flujo en tiempo real.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              activities.map((r) => (
                <tr
                  key={`${r.channel}-${r.id}`}
                  className="border-b border-border/60 last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer"
                  onClick={() => {
                    if (r.channel === "call" && r.status === "completed") {
                      navigate(`/transcripciones?audio=${r.id}`);
                    }
                    if (r.channel === "whatsapp") {
                      navigate(`/analytics-whatsapp?conversation=${r.id}`);
                    }
                  }}
                >
                  <td className="px-5 py-3">
                    {r.channel === "call" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-500">
                        <Phone className="w-3.5 h-3.5" /> Voz
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                        <MessageCircle className="w-3.5 h-3.5" /> WA
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-foreground truncate max-w-[220px]">
                    {r.name}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge variant={statusVariant(r.status)}>
                      {statusLabel[r.status] || r.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                    {r.detail}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {r.date ? format(new Date(r.date), "dd MMM yyyy HH:mm") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
