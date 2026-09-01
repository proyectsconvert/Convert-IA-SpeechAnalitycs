import { CheckCircle2, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ExecutiveSummaryWidgetProps {
  completedCalls: number;
  completedWa: number;
  pendingTotal: number;
  errorCount: number;
}

export function ExecutiveSummaryWidget({
  completedCalls,
  completedWa,
  pendingTotal,
  errorCount,
}: ExecutiveSummaryWidgetProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-primary rounded-2xl p-5 text-primary-foreground h-full flex flex-col justify-between shadow-md">
      <div>
        <h3 className="text-sm font-bold opacity-90">Resumen de Operación</h3>
        <p className="text-xs opacity-70">Estado de procesamiento general</p>
      </div>

      <div className="grid grid-cols-2 gap-3 my-auto py-3">
        <div className="p-2.5 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15">
          <p className="text-[11px] opacity-80 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Llamadas OK
          </p>
          <p className="text-2xl font-bold mt-1">{completedCalls}</p>
        </div>

        <div className="p-2.5 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15">
          <p className="text-[11px] opacity-80 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> WhatsApp OK
          </p>
          <p className="text-2xl font-bold mt-1">{completedWa}</p>
        </div>

        <div className="p-2.5 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15">
          <p className="text-[11px] opacity-80 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-300" /> Pendientes
          </p>
          <p className="text-2xl font-bold mt-1">{pendingTotal}</p>
        </div>

        <div className="p-2.5 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15">
          <p className="text-[11px] opacity-80 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-300" /> Errores
          </p>
          <p className="text-2xl font-bold mt-1">{errorCount}</p>
        </div>
      </div>

      <div className="pt-2 border-t border-primary-foreground/20 flex items-center justify-between text-xs">
        <button
          onClick={() => navigate("/biblioteca")}
          className="hover:underline flex items-center gap-1 opacity-90 hover:opacity-100 font-medium"
        >
          Ir a Grabaciones <ArrowRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => navigate("/analytics-whatsapp")}
          className="hover:underline flex items-center gap-1 opacity-90 hover:opacity-100 font-medium"
        >
          Ir a Chats <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
