import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Download,
  MessageCircle,
  Phone,
  Search,
  Settings2,
  Table as TableIcon,
  TrendingDown,
  TrendingUp,
  Minus,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadAnalizadorCsv, downloadAnalizadorXlsx } from "@/lib/analizador-total/exportRows";
import { useAnalizadorColumnVisibility } from "@/hooks/useAnalizadorColumnVisibility";
import { toast } from "@/components/ui/sonner";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { getMacroprocesoConfig, classifyOperationResult } from "@/lib/analizador-total/macroprocesoConfigs";

const PAGE_SIZE = 50;

interface Props {
  accountId: string | undefined;
  filteredData: AnalizadorUnifiedRow[];
  stats: { callCount: number; whatsappCount: number; positivePct?: number; avgScore?: number; total?: number };
  sortConfig: { key: string; direction: "asc" | "desc" } | null;
  setSortConfig: React.Dispatch<React.SetStateAction<{ key: string; direction: "asc" | "desc" } | null>>;
  onRowClick: (row: AnalizadorUnifiedRow) => void;
  macroproceso?: string;
}

export function DatosMaestrosTab({
  accountId,
  filteredData,
  stats,
  sortConfig,
  setSortConfig,
  onRowClick,
  macroproceso = "ventas",
}: Props) {
  const [page, setPage] = useState(1);

  const mpConfig = useMemo(() => getMacroprocesoConfig(macroproceso), [macroproceso]);

  const extKeys = useMemo(() => {
    const s = new Set<string>();
    filteredData.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (k.startsWith("ext_")) s.add(k);
      });
    });
    return Array.from(s).sort();
  }, [filteredData]);

  const { toggle, isVisible, allColumnKeys } = useAnalizadorColumnVisibility(accountId, extKeys);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, page, totalPages]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    if (page > tp) setPage(tp);
  }, [filteredData.length, page]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const exportFilenameBase = `analizador_${macroproceso}_${format(new Date(), "yyyyMMdd_HHmm")}`;

  const colLabel = (key: string) => {
    if (key.startsWith("ext_")) return key.replace(/^ext_/, "");
    const map: Record<string, string> = {
      canal: "Canal",
      archivo: "Archivo / Agente",
      fecha: "Fecha",
      duracion: "Duración",
      sentimiento: "Sentimiento",
      score: "Score",
      resultado_operacion: mpConfig.resultColumnLabel,
      motivo_principal: "Intención / Motivo",
      insights: "Insights / Resumen",
      atribucion_responsabilidad: "Atribución resp.",
    };
    return map[key] || key;
  };

  const visibleKeys = allColumnKeys.filter((k) => {
    if (k.startsWith("ext_") && !extKeys.includes(k)) return false;
    return isVisible(k);
  });

  const sentimentBorder = (s: string) => {
    if (s === "positive") return "border-l-emerald-500";
    if (s === "negative") return "border-l-red-500";
    return "border-l-slate-300";
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === "asc" ? { key, direction: "desc" } : null;
      }
      return { key, direction: "asc" };
    });
  };

  return (
    <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden h-full min-h-[calc(100vh-260px)]">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-primary" /> Datos Maestros
                </h3>
                <Badge variant="outline" className="text-[11px] font-medium bg-muted/40">
                  {mpConfig.emoji} {mpConfig.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredData.length} registros analizados
                {filteredData.length > PAGE_SIZE ? ` · Página ${safePage} de ${totalPages}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground/90 mt-1 max-w-2xl leading-snug">
                Interacciones analizadas con IA clasificadas dinámicamente para el macroproceso <span className="font-semibold text-foreground">{mpConfig.label}</span>.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-medium gap-1">
                <Phone className="w-3 h-3" /> {stats.callCount} llamadas
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-medium gap-1">
                <MessageCircle className="w-3 h-3" /> {stats.whatsappCount} WhatsApp
              </Badge>
              {stats.positivePct != null && (
                <Badge variant="outline" className="text-[10px] font-medium gap-1 text-emerald-600 border-emerald-200">
                  <TrendingUp className="w-3 h-3" /> {stats.positivePct}% positivo
                </Badge>
              )}
              {stats.avgScore != null && (
                <Badge variant="outline" className="text-[10px] font-medium">
                  Score: {stats.avgScore}%
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto rounded-lg">
                <DropdownMenuLabel className="text-xs font-semibold">Visibilidad de Columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allColumnKeys.map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={isVisible(key)}
                    onCheckedChange={() => toggle(key)}
                    className="text-xs"
                  >
                    {colLabel(key)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-lg">
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => {
                    downloadAnalizadorCsv(filteredData, `${exportFilenameBase}.csv`, extKeys);
                    toast.success("CSV exportado exitosamente");
                  }}
                >
                  Descargar CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => {
                    downloadAnalizadorXlsx(filteredData, `${exportFilenameBase}.xlsx`, extKeys);
                    toast.success("Excel exportado exitosamente");
                  }}
                >
                  Descargar Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-muted/40 sticky top-0 z-10 border-b border-border backdrop-blur-sm">
            <tr>
              {visibleKeys.map((key) => {
                const isSortable = ["fecha", "score", "duracion", "sentimiento"].includes(key);
                const isSorted = sortConfig?.key === key;
                return (
                  <th
                    key={key}
                    className={cn(
                      "px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap select-none",
                      isSortable && "cursor-pointer hover:text-foreground",
                    )}
                    onClick={() => isSortable && handleSort(key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{colLabel(key)}</span>
                      {isSorted && (
                        <span className="text-primary font-bold">
                          {sortConfig?.direction === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={visibleKeys.length || 1} className="px-4 py-12 text-center text-muted-foreground">
                  No se encontraron registros con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              pageSlice.map((row) => {
                const opResult = classifyOperationResult(row as any, macroproceso);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer border-l-[3px]",
                      sentimentBorder(row.sentiment),
                    )}
                    onClick={() => onRowClick(row)}
                  >
                    {visibleKeys.includes("canal") && (
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold",
                            row.channel === "whatsapp"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                          )}
                        >
                          {row.channel === "whatsapp" ? (
                            <MessageCircle className="w-3 h-3" />
                          ) : (
                            <Phone className="w-3 h-3" />
                          )}
                          {row.channel === "whatsapp" ? "WA" : "Voz"}
                        </div>
                      </td>
                    )}
                    {visibleKeys.includes("archivo") && (
                      <td className="px-4 py-3">
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate max-w-[220px]">
                            {row.file_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {row.channel === "whatsapp" && row.campaign ? `${row.campaign} · ` : ""}
                            {row.agent || "Sin asesor"}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleKeys.includes("fecha") && (
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(row.created_at, "dd MMM yyyy", { locale: es })}
                        <span className="block text-[10px] text-muted-foreground/70">
                          {format(row.created_at, "HH:mm")}
                        </span>
                      </td>
                    )}
                    {visibleKeys.includes("duracion") && (
                      <td className="px-4 py-3 font-mono text-muted-foreground text-[11px]">
                        {row.channel === "whatsapp" ? (
                          <span>
                            {row.total_messages != null ? `${row.total_messages} msgs` : "—"}
                          </span>
                        ) : (
                          formatTime(row.duration)
                        )}
                      </td>
                    )}
                    {visibleKeys.includes("sentimiento") && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {row.sentiment === "positive" ? (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          ) : row.sentiment === "negative" ? (
                            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                          ) : (
                            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "font-medium capitalize text-[11px]",
                              row.sentiment === "positive"
                               ? "text-emerald-600"
                                : row.sentiment === "negative"
                                  ? "text-red-600"
                                  : "text-muted-foreground",
                            )}
                          >
                            {row.sentiment === "positive" ? "Positivo" : row.sentiment === "negative" ? "Negativo" : "Neutral"}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleKeys.includes("score") && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[40px]">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.score > 0.7 ? "bg-emerald-500" : row.score > 0.4 ? "bg-amber-500" : "bg-red-500",
                              )}
                              style={{ width: `${Math.min(100, (row.score <= 1.5 ? row.score : row.score / 100) * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-medium tabular-nums">
                            {(row.score <= 1.5 ? row.score * 100 : row.score).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleKeys.includes("resultado_operacion") && (
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary truncate max-w-full" title={opResult}>
                          {opResult}
                        </span>
                      </td>
                    )}
                    {visibleKeys.includes("motivo_principal") && (
                      <td className="px-4 py-3 max-w-[150px] truncate text-[11px]" title={row.motivo_principal || ""}>
                        {row.motivo_principal ?? "—"}
                      </td>
                    )}
                    {visibleKeys.includes("insights") && (
                      <td className="px-4 py-3">
                        <p className="text-muted-foreground line-clamp-1 max-w-[220px] text-[11px]" title={row.summary || ""}>
                          {row.summary || "—"}
                        </p>
                      </td>
                    )}
                    {visibleKeys.includes("atribucion_responsabilidad") && (
                      <td className="px-4 py-3 max-w-[120px] truncate text-[11px]" title={row.atribucion_responsabilidad}>
                        {row.atribucion_responsabilidad ?? "—"}
                      </td>
                    )}
                    {extKeys
                      .filter((k) => visibleKeys.includes(k))
                      .map((ek) => (
                        <td key={ek} className="px-4 py-3 max-w-[140px] truncate text-[11px]" title={String((row as unknown as Record<string, unknown>)[ek] ?? "")}>
                          {String((row as unknown as Record<string, unknown>)[ek] ?? "—")}
                        </td>
                      ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredData.length > PAGE_SIZE && (
        <div className="border-t border-border p-3 flex justify-center items-center gap-3 bg-muted/30">
          <Button variant="outline" size="sm" className="h-7 rounded-md text-xs" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{safePage} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 rounded-md text-xs" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
