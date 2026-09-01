import { format } from "date-fns";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/whatsapp/DateRangePicker";
import { useAnaliticasFilters } from "@/contexts/AnaliticasFiltersContext";

interface Opts {
  optAsesorCall: string[];
  optCampañaCall: string[];
  optFechaCall: string[];
  optAsesorWa: string[];
  optCampañaWa: string[];
  optFechaWa: string[];
  hasCallExtAsesor: boolean;
  hasWaExtAsesor: boolean;
}

export function AnaliticasFiltersPanel({ opts }: { opts: Opts }) {
  const f = useAnaliticasFilters();

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.dateRange?.from) {
    chips.push({
      key: "date",
      label: `Fecha: ${format(f.dateRange.from, "dd/MM")}${f.dateRange.to ? ` – ${format(f.dateRange.to, "dd/MM")}` : ""}`,
      clear: () => f.setDateRange(undefined),
    });
  }
  if (f.sentiment !== "all") chips.push({ key: "sent", label: `Sentimiento: ${f.sentiment}`, clear: () => f.setSentiment("all") });
  if (f.extAsesor !== "all") chips.push({ key: "a", label: `Asesor: ${f.extAsesor}`, clear: () => f.setExtAsesor("all") });
  if (f.extCampaña !== "all") chips.push({ key: "c", label: `Campaña: ${f.extCampaña}`, clear: () => f.setExtCampaña("all") });
  if (f.extFecha !== "all") chips.push({ key: "fe", label: `Fecha ext: ${f.extFecha}`, clear: () => f.setExtFecha("all") });

  const mergedAsesor = Array.from(new Set([...opts.optAsesorCall, ...opts.optAsesorWa])).sort((a, b) => a.localeCompare(b));
  const mergedCampaña = Array.from(new Set([...opts.optCampañaCall, ...opts.optCampañaWa])).sort((a, b) => a.localeCompare(b));
  const mergedFecha = Array.from(new Set([...opts.optFechaCall, ...opts.optFechaWa])).sort((a, b) => a.localeCompare(b));

  return (
    <>
      {f.showFilters && (
        <Card className="border shadow-sm">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Período</label>
              <DatePickerWithRange date={f.dateRange} setDate={f.setDateRange} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha llamadas</label>
              <Select value={f.dateBasisCalls} onValueChange={(v) => f.setDateBasisCalls(v as "analysis" | "upload")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Fecha de análisis</SelectItem>
                  <SelectItem value="upload">Fecha de carga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha WhatsApp</label>
              <Select value={f.dateBasisWa} onValueChange={(v) => f.setDateBasisWa(v as "carga" | "analysis")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carga">Fecha de cargue</SelectItem>
                  <SelectItem value="analysis">Fecha de análisis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Sentimiento</label>
              <Select value={f.sentiment} onValueChange={f.setSentiment}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="positive">Positivo</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Asesor (EXT / inferido)</label>
              <Select value={f.extAsesor} onValueChange={f.setExtAsesor}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mergedAsesor.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!opts.hasCallExtAsesor && !opts.hasWaExtAsesor && (
                <p className="text-[10px] text-muted-foreground">Sin columna EXT de asesor: se usa nombre en archivo / WA.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Campaña (EXT)</label>
              <Select value={f.extCampaña} onValueChange={f.setExtCampaña} disabled={mergedCampaña.length === 0}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mergedCampaña.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha (EXT)</label>
              <Select value={f.extFecha} onValueChange={f.setExtFecha} disabled={mergedFecha.length === 0}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mergedFecha.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {chips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {chips.map((c) => (
            <Badge
              key={c.key}
              variant="secondary"
              className="gap-1 text-xs cursor-pointer hover:bg-destructive/10"
              onClick={c.clear}
            >
              {c.label} <X className="w-3 h-3" />
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={f.clearAllFilters}>
            Limpiar todos
          </Button>
        </div>
      )}
    </>
  );
}
