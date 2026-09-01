import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COLUMN_CATEGORY_LABEL,
  MASTER_COLUMNS,
  type ColumnCategory,
  type MasterColumnSpec,
} from "@/lib/analizador-total/reporteIaSchema";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Filas activas (modo A: filtradas; modo B: del archivo). Para calcular presencia y % nulls. */
  rows: Record<string, unknown>[] | null;
}

function nullPctOf(rows: Record<string, unknown>[], col: string): number | null {
  if (!rows.length) return null;
  let nulls = 0;
  for (const r of rows) {
    const v = r[col];
    if (v == null || v === "" || v === "(vacío)") nulls++;
  }
  return Math.round((nulls / rows.length) * 1000) / 10;
}

function pctTone(pct: number | null): string {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct <= 5) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (pct <= 30) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-destructive/10 text-destructive";
}

const CATEGORY_ORDER: ColumnCategory[] = ["id_meta", "metric_quant", "categorical", "raw_text", "ai_preprocessed"];

export function ColumnsConsideredDrawer({ open, onOpenChange, rows }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Columnas consideradas (26)</SheetTitle>
          <SheetDescription>
            Estas son las columnas que el Reporte IA puede usar para generar el informe ejecutivo.
            Las marcadas como pre-procesadas alimentan directamente la narrativa.
          </SheetDescription>
        </SheetHeader>
        {open && <DrawerBody rows={rows} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ rows }: { rows: Record<string, unknown>[] | null }) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    cols: MASTER_COLUMNS.filter((c) => c.category === cat),
  }));
  return (
    <ScrollArea className="mt-6 h-[calc(100vh-160px)] pr-4">
      <div className="space-y-6">
        {grouped.map(({ cat, cols }) => (
          <div key={cat}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {COLUMN_CATEGORY_LABEL[cat]}
              </h3>
              <span className="text-xs text-muted-foreground">{cols.length} columnas</span>
            </div>
            <div className="space-y-2">
              {cols.map((c) => (
                <ColumnRow key={c.name} spec={c} rows={rows} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ColumnRow({ spec, rows }: { spec: MasterColumnSpec; rows: Record<string, unknown>[] | null }) {
  const present = rows ? rows.length > 0 && rows.some((r) => spec.name in r) : null;
  const nullPct = present && rows ? nullPctOf(rows, spec.name) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold text-foreground">{spec.name}</code>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {spec.dtype}
            </Badge>
            {spec.critical && (
              <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 text-[10px]">
                crítica
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{spec.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {present === null ? (
            <Badge variant="outline" className="text-[10px]">—</Badge>
          ) : present ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> presente
            </Badge>
          ) : (
            <Badge className="bg-destructive/10 text-destructive text-[10px] gap-1">
              <AlertCircle className="h-3 w-3" /> faltante
            </Badge>
          )}
          {nullPct != null && (
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", pctTone(nullPct))}>
              {nullPct}% vacíos
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
