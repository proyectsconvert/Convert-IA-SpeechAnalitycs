import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { Gauge, Clock, MessageSquare, MessageCircle, Presentation, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRenewalDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
}

interface ResourceRow {
  key: string;
  label: string;
  used: number;
  total: number;
  unit: string;
  icon: typeof Clock;
  decimals?: number;
}

export function UsageWidget() {
  const {
    hoursUsed, maxHours,
    queriesUsed, maxQueries,
    whatsappUsed, maxWhatsapp,
    presentationsUsed, maxPresentations,
  } = useAccountLimits();

  const resources: ResourceRow[] = useMemo(() => [
    { key: "hours", label: "Transcripción", used: hoursUsed, total: maxHours, unit: "h", icon: Clock, decimals: 2 },
    { key: "wa", label: "WhatsApp", used: whatsappUsed, total: maxWhatsapp, unit: "conv.", icon: MessageCircle },
    { key: "chat", label: "Consultas IA", used: queriesUsed, total: maxQueries, unit: "", icon: MessageSquare },
    { key: "pres", label: "Presentaciones", used: presentationsUsed, total: maxPresentations, unit: "", icon: Presentation },
  ], [hoursUsed, maxHours, queriesUsed, maxQueries, whatsappUsed, maxWhatsapp, presentationsUsed, maxPresentations]);

  // Highest consumption percentage to determine button accent
  const maxPct = useMemo(
    () => Math.max(...resources.map(r => r.total > 0 ? Math.min((r.used / r.total) * 100, 100) : 0)),
    [resources],
  );
  const accent = maxPct >= 100 ? "destructive" : maxPct >= 80 ? "warn" : "ok";

  const renewalDate = formatRenewalDate();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 text-xs",
            accent === "destructive" && "border-destructive/40 text-destructive hover:text-destructive",
            accent === "warn" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
          )}
        >
          <Gauge className="w-3.5 h-3.5" /> Consumo del mes
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground">Consumo mensual</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <CalendarClock className="w-3 h-3" />
            Se renueva el {renewalDate}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {resources.map(r => {
            const pct = r.total > 0 ? Math.min((r.used / r.total) * 100, 100) : 0;
            const isFull = pct >= 100;
            const isHigh = pct >= 80;
            const remaining = Math.max(0, r.total - r.used);
            const usedFmt = r.decimals ? r.used.toFixed(r.decimals) : Math.round(r.used).toLocaleString("es");
            const totalFmt = r.decimals ? r.total.toFixed(r.decimals) : Math.round(r.total).toLocaleString("es");
            const remainingFmt = r.decimals ? remaining.toFixed(r.decimals) : Math.round(remaining).toLocaleString("es");

            return (
              <div key={r.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <r.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.label}
                  </span>
                  <span className={cn(
                    "tabular-nums font-medium",
                    isFull ? "text-destructive" : isHigh ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}>
                    {usedFmt} / {totalFmt} {r.unit}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    "h-1.5",
                    isFull && "[&>div]:bg-destructive",
                    !isFull && isHigh && "[&>div]:bg-amber-500",
                  )}
                />
                <p className="text-[10px] text-muted-foreground">
                  {isFull
                    ? "Límite alcanzado · acciones bloqueadas"
                    : `Disponible: ${remainingFmt} ${r.unit}`}
                </p>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Los contadores se reinician automáticamente el primer día de cada mes.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
