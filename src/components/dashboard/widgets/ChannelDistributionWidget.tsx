import { Phone, MessageCircle } from "lucide-react";

interface ChannelDistributionWidgetProps {
  totalCalls: number;
  totalWhatsApp: number;
  callMinutes: number;
  waMessages: number;
}

export function ChannelDistributionWidget({
  totalCalls,
  totalWhatsApp,
  callMinutes,
  waMessages,
}: ChannelDistributionWidgetProps) {
  const total = totalCalls + totalWhatsApp;
  const callsPct = total > 0 ? Math.round((totalCalls / total) * 100) : 0;
  const waPct = total > 0 ? Math.round((totalWhatsApp / total) * 100) : 0;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 h-full flex flex-col justify-between shadow-2xs">
      <div>
        <h3 className="text-sm font-bold text-foreground">Comparativa por Canal</h3>
        <p className="text-xs text-muted-foreground">Distribución de volumen omnicanal</p>
      </div>

      <div className="space-y-4 my-auto py-2">
        {/* Canal Voz */}
        <div className="space-y-1.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-blue-600 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Canal Voz (Llamadas)
            </span>
            <span className="font-mono font-bold text-foreground">{callsPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${callsPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
            <span>{totalCalls} llamadas</span>
            <span>{callMinutes} min</span>
          </div>
        </div>

        {/* Canal WhatsApp */}
        <div className="space-y-1.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-600 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp (Chats)
            </span>
            <span className="font-mono font-bold text-foreground">{waPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${waPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
            <span>{totalWhatsApp} conversaciones</span>
            <span>{waMessages} mensajes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
