import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Database } from "@/integrations/supabase/types";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { rowsToMasterExportRecords } from "@/lib/analizador-total/exportRows";
import {
  type TotalAnalyzerV2Response,
  type ReportV3Payload,
  isReportV3,
} from "@/lib/analizador-total/reporteIaSchema";
import { recordsToAnalyzerRows, type ParsedXlsx } from "@/lib/analizador-total/parseXlsxClient";
import { exportReporteEjecutivoPptx } from "@/lib/analizador-total/exportReporteEjecutivoPptx";
import { exportReporteEjecutivoPdf } from "@/lib/analizador-total/exportReporteEjecutivoPdf";
import { exportEditablePresentationPptx } from "@/lib/analizador-total/exportPresentationPptx";
import { exportEditablePresentationPdf } from "@/lib/analizador-total/exportPresentationPdf";
import {
  buildPresentationFromResponse,
  isEditablePresentation,
  type EditablePresentation,
} from "@/lib/analizador-total/presentationModel";
import { getMacroprocesoConfig } from "@/lib/analizador-total/macroprocesoConfigs";
import { DataSourceSelector, type ReporteIaSourceMode } from "./DataSourceSelector";
import { MasterDataSourcePanel, type ActiveFilterChip } from "./MasterDataSourcePanel";
import { UploadDataSourcePanel } from "./UploadDataSourcePanel";
import { ColumnsConsideredDrawer } from "./ColumnsConsideredDrawer";
import { ReporteEjecutivoView } from "./ReporteEjecutivoView";
import { SlideEditor } from "./SlideEditor";
import { SharePresentationDialog } from "./SharePresentationDialog";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  History,
  Trash2,
  ChevronDown,
  FileText,
  Presentation as PresentationIcon,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UsageWidget } from "@/components/UsageWidget";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { useIsSuperadmin } from "@/hooks/useIsSuperadmin";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PresentationRow = Database["public"]["Tables"]["presentations"]["Row"];

interface Props {
  accountId: string | undefined;
  /** Dataset filtrado del store de Datos Maestros. */
  filteredRows: AnalizadorUnifiedRow[];
  totalRowsBeforeFilter: number;
  /** Filtros activos para mostrar como chips y enviar al backend. */
  activeFilterChips: ActiveFilterChip[];
  activeFiltersForBackend: Record<string, unknown>;
  /** Para texto en el chip "Datos Maestros · X". */
  dateRangeLabel: string;
  /** Navegar al tab de Datos Maestros. */
  onGoToMasterData: () => void;
  /** Presentación a precargar (cuando el usuario abrió un reporte guardado). */
  initialPresentation?: PresentationRow | null;
  /** Refrescar lista de presentaciones tras guardar. */
  onSaved?: () => void;
  macroproceso?: string;
}

const LOADING_MESSAGES = [
  "Agregando datos…",
  "Leyendo conversaciones…",
  "Extrayendo patrones…",
  "Redactando el informe ejecutivo…",
];

export function ReporteIaContainer({
  accountId,
  filteredRows,
  totalRowsBeforeFilter,
  activeFilterChips,
  activeFiltersForBackend,
  dateRangeLabel,
  onGoToMasterData,
  initialPresentation,
  onSaved,
  macroproceso = "ventas",
}: Props) {
  const mpConfig = useMemo(() => getMacroprocesoConfig(macroproceso), [macroproceso]);
  const { canCreatePresentation, presentationsUsed, maxPresentations } = useAccountLimits();
  const isSuperadmin = useIsSuperadmin();
  const [mode, setMode] = useState<ReporteIaSourceMode>("master");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [response, setResponse] = useState<TotalAnalyzerV2Response | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [customContext, setCustomContext] = useState("");

  const [parsed, setParsed] = useState<ParsedXlsx | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);

  // Vista activa: reporte estructurado vs editor de presentación WYSIWYG
  const [view, setView] = useState<"report" | "presentation">("report");
  const [editable, setEditable] = useState<EditablePresentation | null>(null);
  const [isSavingPres, setIsSavingPres] = useState(false);
  const [isExportingPresPptx, setIsExportingPresPptx] = useState(false);
  const [isExportingPresPdf, setIsExportingPresPdf] = useState(false);
  const [currentPresentationId, setCurrentPresentationId] = useState<string | null>(
    initialPresentation?.id ?? null,
  );
  const [shareOpen, setShareOpen] = useState(false);

  /** Snapshot de los filtros usados al generar; permite detectar "stale". */
  const generatedFiltersRef = useRef<string | null>(null);
  /** DOM ref del reporte para captura PDF. */
  const reportRef = useRef<HTMLDivElement>(null);

  // Saved reports list
  const [savedReports, setSavedReports] = useState<PresentationRow[]>([]);
  const fetchSaved = useMemo(
    () => async () => {
      if (!accountId) return;
      const { data } = await supabase
        .from("presentations")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);
      setSavedReports((data ?? []) as PresentationRow[]);
    },
    [accountId],
  );
  useEffect(() => {
    void fetchSaved();
  }, [fetchSaved]);

  // Hidratar reporte desde una presentación guardada (modo apertura desde biblioteca)
  useEffect(() => {
    if (!initialPresentation) return;
    setCurrentPresentationId(initialPresentation.id);
    const raw = initialPresentation.slides_data;
    if (isEditablePresentation(raw)) {
      setEditable(raw);
      if (raw.sourceResponse) setResponse(raw.sourceResponse);
      setView("presentation");
    } else if (isReportV3(raw)) {
      setResponse(raw.data);
      setView("report");
    }
  }, [initialPresentation]);

  // Mensaje rotatorio durante carga
  useEffect(() => {
    if (!isAnalyzing) return;
    const t = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, [isAnalyzing]);

  const isStale = useMemo(() => {
    if (!response || mode !== "master") return false;
    return generatedFiltersRef.current !== JSON.stringify(activeFiltersForBackend);
  }, [response, mode, activeFiltersForBackend]);

  const drawerRows = useMemo<Record<string, unknown>[] | null>(() => {
    if (mode === "master") {
      if (filteredRows.length === 0) return null;
      return rowsToMasterExportRecords(filteredRows);
    }
    return parsed?.rows ?? null;
  }, [mode, filteredRows, parsed]);

  const handleParsed = (file: File, p: ParsedXlsx) => {
    setParsed(p);
    setFileMeta({ name: file.name, size: file.size });
  };
  const handleClearUpload = () => {
    setParsed(null);
    setFileMeta(null);
  };

  const handleLoadSaved = (p: PresentationRow) => {
    const raw = p.slides_data;
    if (isEditablePresentation(raw)) {
      setEditable(raw);
      if (raw.sourceResponse) setResponse(raw.sourceResponse);
      setView("presentation");
      setCurrentPresentationId(p.id);
      toast.success(`Presentación cargada: ${p.title}`);
    } else if (isReportV3(raw)) {
      setResponse(raw.data);
      setEditable(null);
      setView("report");
      setCurrentPresentationId(p.id);
      toast.success(`Reporte cargado: ${p.title}`);
    } else {
      toast.error("Este reporte está en un formato anterior y no puede mostrarse.");
    }
  };

  const handleShareSaved = (p: PresentationRow) => {
    setCurrentPresentationId(p.id);
    setShareOpen(true);
  };

  const handleDeleteSaved = async (id: string) => {
    if (!isSuperadmin) {
      toast.error("Solo Superadmin puede eliminar reportes. El consumo registrado se mantiene.");
      return;
    }
    if (!confirm("¿Eliminar este reporte guardado? El consumo registrado no se descuenta.")) return;
    const { error: delErr } = await supabase.from("presentations").delete().eq("id", id);
    if (delErr) {
      toast.error("No se pudo eliminar el reporte");
      return;
    }
    toast.success("Reporte eliminado (consumo histórico intacto)");
    void fetchSaved();
    onSaved?.();
  };

  const handleGenerate = async () => {
    setError(null);
    if (!accountId) {
      toast.error("Selecciona una cuenta primero");
      return;
    }

    // Check presentation limit
    try {
      const { data: limitOk } = await supabase.rpc("check_account_limits", {
        p_account_id: accountId,
        p_check_type: "presentations",
      });
      if (limitOk === false) {
        toast.error("Límite de presentaciones alcanzado este mes. Solicita ampliación al administrador.");
        return;
      }
    } catch (e) {
      console.warn("Could not verify presentation limit:", e);
    }

    let payloadRows: Record<string, unknown>[];
    let sourceField: Record<string, unknown>;

    if (mode === "master") {
      if (filteredRows.length === 0) {
        toast.error("No hay filas filtradas para analizar");
        return;
      }
      payloadRows = rowsToMasterExportRecords(filteredRows);
      sourceField = {
        mode: "master",
        activeFilters: activeFiltersForBackend,
        totalRowsBeforeFilter,
      };
    } else {
      if (!parsed || !parsed.validation.ok) {
        toast.error("Faltan columnas críticas en el archivo");
        return;
      }
      payloadRows = recordsToAnalyzerRows(parsed.rows);
      sourceField = {
        mode: "upload",
        fileName: fileMeta?.name,
        fileSize: fileMeta?.size,
      };
    }

    if (payloadRows.length > 500) {
      const ok = window.confirm(
        `Vas a analizar ${payloadRows.length} interacciones. Puede tardar varios segundos. ¿Continuar?`,
      );
      if (!ok) return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("total-analyzer", {
        body: {
          accountId,
          macroproceso,
          dateRange: dateRangeLabel,
          customInstructions: customContext.trim() || undefined,
          rows: payloadRows,
          source: sourceField,
        },
      });

      if (fnError) throw fnError;
      if (data && typeof data === "object" && "error" in (data as object)) {
        throw new Error(String((data as { error: unknown }).error));
      }

      const v2 = data as TotalAnalyzerV2Response;
      if (!v2?.analysis || !v2?.stats || !v2?.meta) {
        throw new Error("La respuesta del analizador no tiene el formato esperado.");
      }

      setResponse(v2);
      generatedFiltersRef.current = JSON.stringify(activeFiltersForBackend);

      // Persistir como v3 en presentations
      const payload: ReportV3Payload = { schemaVersion: 3, data: v2 };
      const title =
        mode === "upload"
          ? `Reporte Ejecutivo · ${fileMeta?.name ?? "archivo"}`
          : `Reporte Ejecutivo · ${format(new Date(), "PPp")}`;
      const { data: insData, error: insErr } = await supabase
        .from("presentations")
        .insert({
          account_id: accountId,
          title,
          search_criteria: {
            mode,
            dateRangeLabel,
            activeFiltersForBackend,
            rowsAnalyzed: v2.meta.rowsAnalyzed,
            customContext: customContext.trim() || null,
          } as unknown as Json,
          slides_data: payload as unknown as Json,
        })
        .select("id")
        .single();
      if (insErr) console.warn("No se pudo persistir el reporte:", insErr.message);
      else {
        if (insData?.id) setCurrentPresentationId(insData.id);
        try {
          await supabase.rpc("increment_usage" as any, {
            p_account_id: accountId,
            p_presentations: 1,
          } as any);
        } catch (err) {
          console.warn("Could not increment presentations usage:", err);
        }
      }
      onSaved?.();
      void fetchSaved();
      toast.success("Reporte ejecutivo generado y guardado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar el reporte";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPptx = async () => {
    if (!response) return;
    setIsExporting(true);
    try {
      const fileName = `reporte-ejecutivo-${format(new Date(), "yyyyMMdd-HHmm")}.pptx`;
      await exportReporteEjecutivoPptx(response, fileName);
      toast.success("PPTX descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!response || !reportRef.current) return;
    setIsExportingPdf(true);
    try {
      const fileName = `reporte-ejecutivo-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
      await exportReporteEjecutivoPdf(reportRef.current, fileName);
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ----------------------------- Presentación editable -----------------------------

  const handleSwitchToPresentation = () => {
    if (!editable && response) {
      const title =
        mode === "upload"
          ? `Presentación · ${fileMeta?.name ?? "archivo"}`
          : `Presentación · ${format(new Date(), "PPp")}`;
      setEditable(buildPresentationFromResponse(response, title));
    }
    setView("presentation");
  };

  const handleSavePresentation = async () => {
    if (!editable || !accountId) return;
    if (!canCreatePresentation) {
      toast.error(
        `Has alcanzado el límite mensual de presentaciones (${presentationsUsed}/${maxPresentations}). Se renovará el primer día del próximo mes.`,
      );
      return;
    }
    setIsSavingPres(true);
    try {
      const { data: insData, error: insErr } = await supabase
        .from("presentations")
        .insert({
          account_id: accountId,
          title: editable.title || `Presentación · ${format(new Date(), "PPp")}`,
          search_criteria: {
            kind: "editable_presentation",
            mode,
            dateRangeLabel,
            activeFiltersForBackend,
            customContext: customContext.trim() || null,
          } as unknown as Json,
          slides_data: editable as unknown as Json,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      if (insData?.id) setCurrentPresentationId(insData.id);
      try {
        await supabase.rpc("increment_usage" as any, {
          p_account_id: accountId,
          p_presentations: 1,
        } as any);
      } catch (err) {
        console.warn("Could not increment presentations usage:", err);
      }
      toast.success("Presentación guardada");
      onSaved?.();
      void fetchSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la presentación");
    } finally {
      setIsSavingPres(false);
    }
  };

  const handleExportPresPptx = async () => {
    if (!editable) return;
    setIsExportingPresPptx(true);
    try {
      const fileName = `presentacion-${format(new Date(), "yyyyMMdd-HHmm")}.pptx`;
      await exportEditablePresentationPptx(editable, fileName);
      toast.success("PPTX descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar PPTX");
    } finally {
      setIsExportingPresPptx(false);
    }
  };

  const handleExportPresPdf = async () => {
    if (!editable) return;
    setIsExportingPresPdf(true);
    try {
      const fileName = `presentacion-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
      await exportEditablePresentationPdf(editable, fileName);
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar PDF");
    } finally {
      setIsExportingPresPdf(false);
    }
  };

  return (
    <div className="w-full px-3 py-4 sm:px-6 2xl:px-10">
      <div className="space-y-5">
        {/* Top bar: source selector + saved reports + status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DataSourceSelector value={mode} onChange={setMode} />
          <div className="flex items-center gap-2">
            {response && (
              <span className="hidden text-xs text-muted-foreground md:inline">
                Fuente:{" "}
                {response.meta.source.mode === "upload" ? "Excel subido" : "Datos Maestros"}
              </span>
            )}
            <UsageWidget />
            {currentPresentationId && (response || editable) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="h-3.5 w-3.5" />
                Compartir
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Reportes guardados
                  {savedReports.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] font-bold">
                      {savedReports.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[420px] max-h-[480px] overflow-y-auto">
                <DropdownMenuLabel>Reportes ejecutivos guardados</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedReports.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Aún no hay reportes guardados.
                  </div>
                )}
                {savedReports.map((r) => {
                  const raw = r.slides_data;
                  const isV4 = isEditablePresentation(raw);
                  const isV3 = isReportV3(raw);
                  const supported = isV3 || isV4;
                  return (
                    <div
                      key={r.id}
                      className="group flex items-start justify-between gap-2 px-2 py-1.5 hover:bg-muted/50"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadSaved(r)}
                        className="flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!supported}
                      >
                        <p className="line-clamp-1 text-sm font-medium text-foreground">
                          {r.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {r.created_at ? format(new Date(r.created_at), "PPp") : ""}
                          {isV4 && " · presentación editable"}
                          {!supported && " · formato anterior"}
                        </p>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleShareSaved(r)}
                          className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          aria-label="Compartir"
                          title="Crear o gestionar links de compartir"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        {isSuperadmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSaved(r.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Eliminar"
                            title="Solo Superadmin. El consumo no se descuenta."
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Panel de la fuente activa */}
        {mode === "master" ? (
          <MasterDataSourcePanel
            rowsCount={filteredRows.length}
            totalCount={totalRowsBeforeFilter}
            filterChips={activeFilterChips}
            isStale={isStale}
            isAnalyzing={isAnalyzing}
            onOpenColumnsDrawer={() => setDrawerOpen(true)}
            onGenerate={handleGenerate}
            onGoToMasterData={onGoToMasterData}
          />
        ) : (
          <UploadDataSourcePanel
            parsed={parsed}
            fileMeta={fileMeta}
            isAnalyzing={isAnalyzing}
            onParsed={handleParsed}
            onClear={handleClearUpload}
            onOpenColumnsDrawer={() => setDrawerOpen(true)}
            onGenerate={handleGenerate}
          />
        )}

        {/* Contexto del análisis (colapsable) */}
        <Card className="border border-border bg-card p-4 sm:p-5">
          <Collapsible open={contextOpen} onOpenChange={setContextOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Contexto del análisis (opcional)
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">
                    Indícale a la IA en qué enfocarse: objetivos del negocio, segmentos prioritarios, KPIs a destacar.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    contextOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <Label htmlFor="custom-context" className="sr-only">
                Contexto
              </Label>
              <Textarea
                id="custom-context"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder={mpConfig.reporteIa?.contextPlaceholder || "Ej: foco en objetivos operativos, priorizar asesores con oportunidad de mejora, evaluar efectividad en WhatsApp vs llamada…"}
                rows={3}
                maxLength={2000}
                className="resize-none text-sm"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>El contexto se enviará junto con los datos al motor de IA.</span>
                <span>{customContext.length} / 2000</span>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Estado: cargando */}
        {isAnalyzing && (
          <Card className="border border-border bg-card p-10 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{LOADING_MESSAGES[loadingMsgIdx]}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esto puede tardar entre 10 y 60 segundos.
            </p>
          </Card>
        )}

        {/* Estado: error */}
        {error && !isAnalyzing && (
          <Card className="border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="flex-1">
                <p className="font-semibold text-destructive">No se pudo generar el reporte</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={handleGenerate} className="mt-3 gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Estado: vacío */}
        {!response && !isAnalyzing && !error && (
          <Card className="border border-border bg-card p-10 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="text-base font-semibold text-foreground">
              Configura tu fuente de datos y genera el informe
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              El informe ejecutivo combina cifras agregadas y patrones extraídos de las conversaciones.
            </p>
          </Card>
        )}

        {/* Toggle Reporte / Presentación + contenido activo */}
        {(response || editable) && !isAnalyzing && (
          <>
            <div className="flex items-center justify-between gap-3">
              <Tabs
                value={view}
                onValueChange={(v) => {
                  if (v === "presentation") handleSwitchToPresentation();
                  else setView("report");
                }}
              >
                <TabsList>
                  <TabsTrigger value="report" className="gap-1.5" disabled={!response}>
                    <FileText className="h-3.5 w-3.5" /> Reporte
                  </TabsTrigger>
                  <TabsTrigger value="presentation" className="gap-1.5" disabled={!response && !editable}>
                    <PresentationIcon className="h-3.5 w-3.5" /> Presentación
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {view === "presentation" && editable && (
                <p className="hidden text-xs text-muted-foreground md:block">
                  {editable.slides.length} slide{editable.slides.length !== 1 ? "s" : ""} · canvas 1920×1080
                </p>
              )}
            </div>

            {view === "report" && response && (
              <ReporteEjecutivoView
                ref={reportRef}
                response={response}
                isStale={isStale}
                onRegenerate={handleGenerate}
                onExportPptx={handleExportPptx}
                onExportPdf={handleExportPdf}
                isExporting={isExporting}
                isExportingPdf={isExportingPdf}
              />
            )}

            {view === "presentation" && editable && (
              <SlideEditor
                presentation={editable}
                onChange={setEditable}
                onSave={handleSavePresentation}
                isSaving={isSavingPres}
                onExportPptx={handleExportPresPptx}
                onExportPdf={handleExportPresPdf}
                isExportingPptx={isExportingPresPptx}
                isExportingPdf={isExportingPresPdf}
                accountId={accountId}
              />
            )}
          </>
        )}
      </div>

      <ColumnsConsideredDrawer open={drawerOpen} onOpenChange={setDrawerOpen} rows={drawerRows} />

      <SharePresentationDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        presentationId={currentPresentationId}
        accountId={accountId}
        presentationTitle={
          editable?.title ??
          (response
            ? mode === "upload"
              ? `Reporte Ejecutivo · ${fileMeta?.name ?? "archivo"}`
              : `Reporte Ejecutivo · ${dateRangeLabel}`
            : undefined)
        }
      />
    </div>
  );
}
