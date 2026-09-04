import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Upload, MoreVertical, FileAudio, Sparkles, Play, RefreshCw, Eye, Trash2, Search, XSquare, FileSpreadsheet, Loader2, Phone, Clock, CheckCircle2, AlertCircle, Activity, Settings2, Filter, X } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ExportFormatDialog, type ExportFormat } from "@/components/ExportFormatDialog";
import { UsageWidget } from "@/components/UsageWidget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAudioUploadModal } from "@/contexts/AudioUploadModalContext";
import { AudioProcessDialog } from "@/components/AudioProcessDialog";
import { useBibliotecaFiles } from "@/hooks/useBibliotecaFiles";
import { useBibliotecaVisibleData } from "@/hooks/useBibliotecaVisibleData";
import { applyCallRule, type ExtRuleRow } from "@/lib/extractions/applyExtractionRules";
import { resolveExtColumnKey, extValuesEqual } from "@/lib/extractions/extColumnResolve";
import { invokeProcessCall } from "@/lib/invokeProcessCall";

function bibliotecaColumnLabel(col: string) {
  if (col === "fecha_analisis") return "Fecha análisis";
  return col.replace("_EX", " (ext)");
}

function resolveCallAgentFromFile(f: { file_name: string; metadata?: unknown }) {
  const meta = f.metadata as Record<string, unknown> | null | undefined;
  return (
    (typeof meta?.agent_name === "string" ? meta.agent_name : undefined) ||
    (typeof meta?.user_name === "string" ? meta.user_name : undefined) ||
    (f.file_name?.includes("-") ? f.file_name.split("-")[0].trim() : "") ||
    "—"
  );
}

export default function BibliotecaPage() {
  const { currentAccount } = useAccount();
  const { profile } = useAuth();
  const accountId = currentAccount?.account_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { openUploadModal } = useAudioUploadModal();
  const [selected, setSelected] = useState<string[]>([]);
  const [processing, setProcessing] = useState<string[]>([]);
  const [promptDialog, setPromptDialog] = useState<{ open: boolean; fileIds: string[] }>({ open: false, fileIds: [] });
  const [selectedPromptId, setSelectedPromptId] = useState<string>("none");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; fileId: string; fileName: string; bulk?: boolean }>({ open: false, fileId: "", fileName: "" });
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [filterAnalysisDateFrom, setFilterAnalysisDateFrom] = useState("");
  const [filterAnalysisDateTo, setFilterAnalysisDateTo] = useState("");
  const [filterSentiment, setFilterSentiment] = useState<string>("all");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [filterExtAsesor, setFilterExtAsesor] = useState<string>("all");
  const [filterExtCampaña, setFilterExtCampaña] = useState<string>("all");
  const [filterExtFecha, setFilterExtFecha] = useState<string>("all");

  const { can } = usePermissions();
  const canDeleteSingle = can("library", "delete") || can("library.calls", "delete");
  const canBulkDelete = can("library", "bulk_delete") || can("library.calls", "bulk_delete");
  const canUpload = can("library", "upload") || can("library.calls", "upload");
  const canExport = can("library", "export") || can("library.calls", "export");
  const canReprocess = can("library", "reprocess") || can("library.calls", "reprocess");
  const canPlay = can("library", "play") || can("library.calls", "play");
  const canDelete = canDeleteSingle;

  const handleDelete = async (fileId: string) => {
    setDeleting(true);
    try {
      const file = files?.find((f) => f.id === fileId);
      if (file?.file_path) await supabase.storage.from("audio-files").remove([file.file_path]);
      const { data: transcriptions } = await supabase.from("transcriptions").select("id").eq("audio_file_id", fileId);
      if (transcriptions?.length) {
        for (const t of transcriptions) await supabase.from("transcription_segments").delete().eq("transcription_id", t.id);
        await supabase.from("transcriptions").delete().eq("audio_file_id", fileId);
      }
      await supabase.from("analyses").delete().eq("audio_file_id", fileId);
      await supabase.from("call_chat_messages").delete().eq("audio_file_id", fileId);
      await supabase.from("processing_jobs").delete().eq("audio_file_id", fileId);
      const { error } = await supabase.from("audio_files").delete().eq("id", fileId);
      if (error) throw error;
      setSelected((prev) => prev.filter((id) => id !== fileId));
    } catch (err: any) {
      toast.error("Error al eliminar: " + (err.message || "Error"));
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      let success = 0;
      for (const id of selected) {
        try { await handleDelete(id); success++; } catch {}
      }
      toast.success(`${success} archivo(s) eliminado(s)`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["audio-files", accountId] });
      queryClient.invalidateQueries({ queryKey: ["biblioteca-analyses", accountId] });
      queryClient.invalidateQueries({ queryKey: ["biblioteca-transcriptions-text", accountId] });
      queryClient.invalidateQueries({ queryKey: ["biblioteca-extractions", accountId] });
    } catch {
      toast.error("Error al eliminar archivos");
    } finally {
      setDeleting(false);
      setDeleteDialog({ open: false, fileId: "", fileName: "" });
    }
  };

  const handleSingleDelete = async () => {
    await handleDelete(deleteDialog.fileId);
    toast.success("Archivo eliminado");
    queryClient.invalidateQueries({ queryKey: ["audio-files", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-analyses", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-transcriptions-text", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-extractions", accountId] });
    setDeleting(false);
    setDeleteDialog({ open: false, fileId: "", fileName: "" });
  };

  const { data: filesData, isLoading } = useBibliotecaFiles(
    accountId,
    currentPage,
    pageSize,
    searchQuery,
    statusTab,
    {
      analysisDateFrom: filterAnalysisDateFrom,
      analysisDateTo: filterAnalysisDateTo,
      sentiment: filterSentiment,
      scoreMin: filterScoreMin,
      scoreMax: filterScoreMax,
      // agent/campaign se aplican client-side sobre mergedExtByFile (ver paginatedFiles)
    }
  );

  const files = filesData?.data || [];
  const totalCount = filesData?.count || 0;

  const visibleIds = useMemo(() => files.map(f => f.id), [files]);
  const { data: visibleData, isLoading: isLoadingVisible } = useBibliotecaVisibleData(accountId, visibleIds);

  const { data: prompts } = useQuery({
    queryKey: ["prompts-active", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase.from("prompts").select("id, name, category, status, description")
        .eq("account_id", accountId).in("status", ["active", "draft"]).order("name");
      return data || [];
    },
    enabled: !!accountId,
  });

  const fileIdsSig = useMemo(() => [...visibleIds].sort().join(","), [visibleIds]);

  const { data: extractionRulesRaw } = useQuery({
    queryKey: ["extraction-rules-list", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase
        .from("extraction_rules")
        .select("id, name, source, extraction_type, config")
        .eq("account_id", accountId);
      return (data || []).filter((r: any) => {
        const cfg = r.config;
        if (cfg && typeof cfg === "object" && !Array.isArray(cfg) && (cfg as any).targetChannel === "whatsapp") return false;
        return true;
      }) as ExtRuleRow[];
    },
    enabled: !!accountId,
  });

  const ruleRows = extractionRulesRaw || [];
  const analysisByFileId = (visibleData?.analyses as Record<string, any>) || {};
  const transcriptionTextByAudio = (visibleData?.transcriptions as Record<string, string>) || {};
  const extDbMap = (visibleData?.extractions as Record<string, Record<string, string>>) || {};

  const promptNameById = useMemo(() => new Map((prompts || []).map((p: { id: string; name: string }) => [p.id, p.name])), [prompts]);

  const mergedExtByFile = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    if (!files?.length || !ruleRows.length) return m;

    const ruleMap = new Map(ruleRows.map((r) => [r.id, r.name]));

    /** Resolve a value from SFTP JSON metadata for a given rule name */
    const resolveFromSftpMetadata = (meta: Record<string, unknown> | null, ruleName: string): string | undefined => {
      if (!meta || meta.source !== "sftp_ftp") return undefined;
      const upper = ruleName.toUpperCase();
      const jsonRaw = meta.json_raw as Record<string, unknown> | null;

      if (upper.includes("ASESOR") || upper.includes("AGENTE")) {
        // Agent from metadata or json_raw
        const v = meta.agent as string
          || (jsonRaw?.__last_step as any)?.agent
          || jsonRaw?.dispositionAgent as string
          || jsonRaw?.agentName as string;
        return v ? String(v).replace(/@.*$/, "").trim() : undefined;
      }
      if (upper.includes("CAMPAÑA") || upper.includes("CAMPANA") || upper.includes("CAMPAIGN")) {
        const v = meta.campaign as string || jsonRaw?.campaign as string || jsonRaw?.campaignName as string;
        return v ? String(v).replace(/@.*$/, "").trim() : undefined;
      }
      if (upper.includes("FECHA")) {
        const v = meta.start_time as string || jsonRaw?.timestamp as string || jsonRaw?.startTimestampReadable as string;
        if (v) {
          const d = new Date(v);
          if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          return String(v).slice(0, 10);
        }
        return undefined;
      }
      if (upper.includes("TELÉFONO") || upper.includes("TELEFONO") || upper.includes("PHONE")) {
        return meta.phone as string || undefined;
      }
      if (upper.includes("ESTADO") || upper.includes("TIPIFICACIÓN") || upper.includes("TIPIFICACION") || upper.includes("DISPOSITION")) {
        return meta.disposition as string || jsonRaw?.dispositionCode as string || undefined;
      }
      if (upper.includes("CLIENTE") || upper.includes("CONTACTO")) {
        const v = meta.contact_name as string || (jsonRaw?.interactionData as any)?.contactName as string || undefined;
        return v;
      }
      return undefined;
    };

    for (const f of files) {
      const row: Record<string, string> = {};
      const dbRow = extDbMap[f.id] || {};
      const analysis = analysisByFileId[f.id];
      const fullText = transcriptionTextByAudio[f.id] || "";
      const summary = (analysis?.summary as string) || "";
      const meta = (f.metadata && typeof f.metadata === "object" && !Array.isArray(f.metadata))
        ? f.metadata as Record<string, unknown>
        : null;

      for (const rule of ruleRows) {
        const col = `${rule.name}_EX`;
        const fromDb = dbRow[rule.id];
        let val: string | undefined = fromDb;

        // Limpiar fechas en columnas que contienen "FECHA" en su nombre
        if (val && val !== "—" && rule.name.toUpperCase().includes("FECHA")) {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          } else if (val.includes(" ") || val.includes("T")) {
            val = val.split(/[ T]/)[0];
          }
        }

        // Fallback 1: SFTP metadata
        if ((!val || val === "") && meta?.source === "sftp_ftp") {
          const fromMeta = resolveFromSftpMetadata(meta, rule.name);
          if (fromMeta && fromMeta.trim() !== "") val = fromMeta;
        }

        // Fallback 2: Apply rule
        if ((!val || val === "") && f.status === "completed") {
          const c = applyCallRule(rule, f.file_name, fullText, summary);
          if (c != null && c !== "") val = c;
        }
        row[col] = val && val !== "" ? val : "—";
      }
      m[f.id] = row;
    }
    return m;
  }, [files, ruleRows, extDbMap, analysisByFileId, transcriptionTextByAudio]);

  const extColumns = useMemo(() => {
    return ruleRows.map((r) => `${r.name}_EX`);
  }, [ruleRows]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const toggleColumn = (col: string) => setHiddenColumns(prev => {
    const next = new Set(prev);
    if (next.has(col)) next.delete(col); else next.add(col);
    return next;
  });
  const allColumns = ["archivo", "fecha_analisis", "tamaño", "duración", "estado", "score", "sentimiento", ...extColumns];

  const extKeyNombreAsesor = useMemo(() => resolveExtColumnKey(extColumns, "nombre_asesor"), [extColumns]);
  const extKeyNombreCampaña = useMemo(() => resolveExtColumnKey(extColumns, "nombre_campaña"), [extColumns]);
  const extKeyFechaExt = useMemo(() => resolveExtColumnKey(extColumns, "fecha_ext"), [extColumns]);

  const formatCallAnalysisCells = (f: { id: string; status: string }) => {
    const an = analysisByFileId[f.id];
    if (f.status !== "completed") {
      return { score: "—", sentiment: "—" };
    }
    const scoreStr =
      an?.sentiment_score != null && an.sentiment_score !== ""
        ? `${(Number(an.sentiment_score) * 100).toFixed(0)}%`
        : "—";
    const sentimentStr = (an?.overall_sentiment as string) || "—";
    return { score: scoreStr, sentiment: sentimentStr };
  };

  const analysisDateLabel = (f: { id: string; status: string }) => {
    if (f.status !== "completed") return "—";
    const an = analysisByFileId[f.id];
    const raw = an?.created_at as string | undefined;
    if (!raw) return "—";
    try {
      return format(new Date(raw), "dd MMM yyyy");
    } catch {
      return "—";
    }
  };

  const sentimentOptions = useMemo(() => {
    const s = new Set<string>();
    (files || []).forEach((f) => {
      if (f.status !== "completed") return;
      const sen = analysisByFileId[f.id]?.overall_sentiment as string | undefined;
      if (sen?.trim()) s.add(sen.trim());
    });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [files, analysisByFileId]);

  const uniqueExtColumnValues = useCallback(
    (key: string | undefined) => {
      if (!key || !files?.length) return [];
      const set = new Set<string>();
      for (const f of files) {
        const v = (mergedExtByFile as Record<string, any>)[f.id]?.[key];
        if (v && v !== "—") set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b));
    },
    [files, mergedExtByFile],
  );

  const optExtAsesor = useMemo(() => {
    if (extKeyNombreAsesor) return uniqueExtColumnValues(extKeyNombreAsesor);
    const set = new Set<string>();
    (files || []).forEach((f) => {
      if (f.status !== "completed") return;
      const a = resolveCallAgentFromFile(f);
      if (a && a !== "—") set.add(a);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [uniqueExtColumnValues, extKeyNombreAsesor, files]);
  const optExtCampaña = useMemo(() => uniqueExtColumnValues(extKeyNombreCampaña), [uniqueExtColumnValues, extKeyNombreCampaña]);
  const optExtFecha = useMemo(() => uniqueExtColumnValues(extKeyFechaExt), [uniqueExtColumnValues, extKeyFechaExt]);

  const activeBibFilters = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filterAnalysisDateFrom || filterAnalysisDateTo)
      chips.push({
        key: "anal_date",
        label: `Fecha análisis: ${filterAnalysisDateFrom || "…"} → ${filterAnalysisDateTo || "…"}`,
      });
    if (filterSentiment !== "all") chips.push({ key: "sent", label: `Sentimiento: ${filterSentiment}` });
    if (filterScoreMin !== "" || filterScoreMax !== "")
      chips.push({ key: "score", label: `Score %: ${filterScoreMin || "—"} – ${filterScoreMax || "—"}` });
    if (filterExtAsesor !== "all") chips.push({ key: "ext_asesor", label: `Asesor: ${filterExtAsesor}` });
    if (filterExtCampaña !== "all" && extKeyNombreCampaña) chips.push({ key: "ext_camp", label: `Nombre Campaña (ext): ${filterExtCampaña}` });
    if (filterExtFecha !== "all" && extKeyFechaExt) chips.push({ key: "ext_fecha", label: `fecha (ext): ${filterExtFecha}` });
    return chips;
  }, [
    filterAnalysisDateFrom,
    filterAnalysisDateTo,
    filterSentiment,
    filterScoreMin,
    filterScoreMax,
    filterExtAsesor,
    filterExtCampaña,
    filterExtFecha,
    extKeyNombreCampaña,
    extKeyFechaExt,
  ]);

  const clearBibFilter = (key: string) => {
    if (key === "anal_date") {
      setFilterAnalysisDateFrom("");
      setFilterAnalysisDateTo("");
    }
    if (key === "sent") setFilterSentiment("all");
    if (key === "score") {
      setFilterScoreMin("");
      setFilterScoreMax("");
    }
    if (key === "ext_asesor") setFilterExtAsesor("all");
    if (key === "ext_camp") setFilterExtCampaña("all");
    if (key === "ext_fecha") setFilterExtFecha("all");
  };

  const clearAllBibFilters = () => {
    setFilterAnalysisDateFrom("");
    setFilterAnalysisDateTo("");
    setFilterSentiment("all");
    setFilterScoreMin("");
    setFilterScoreMax("");
    setFilterExtAsesor("all");
    setFilterExtCampaña("all");
    setFilterExtFecha("all");
  };

  // Filtro client-side para columnas EXT (Asesor / Campaña / Fecha ext)
  // El backend ya filtró por sentimiento/score/fecha análisis vía join INNER.
  const paginatedFiles = useMemo(() => {
    let list = files;
    if (filterExtAsesor !== "all" && extKeyNombreAsesor) {
      list = list.filter((f) => extValuesEqual(mergedExtByFile[f.id]?.[extKeyNombreAsesor] ?? "—", filterExtAsesor));
    } else if (filterExtAsesor !== "all") {
      // Fallback: comparar contra resolveCallAgentFromFile
      list = list.filter((f) => extValuesEqual(resolveCallAgentFromFile(f), filterExtAsesor));
    }
    if (filterExtCampaña !== "all" && extKeyNombreCampaña) {
      list = list.filter((f) => extValuesEqual(mergedExtByFile[f.id]?.[extKeyNombreCampaña] ?? "—", filterExtCampaña));
    }
    if (filterExtFecha !== "all" && extKeyFechaExt) {
      list = list.filter((f) => extValuesEqual(mergedExtByFile[f.id]?.[extKeyFechaExt] ?? "—", filterExtFecha));
    }
    return list;
  }, [files, filterExtAsesor, filterExtCampaña, filterExtFecha, extKeyNombreAsesor, extKeyNombreCampaña, extKeyFechaExt, mergedExtByFile]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const safePage = Math.min(currentPage, totalPages || 1);

  const bibTabCounts = useMemo(
    () => ({
      all: totalCount,
      completed: 0, // No podemos calcular el total real sin cargar todo
      pending: 0,
      error: 0,
    }),
    [totalCount],
  );

  const metrics = useMemo(() => {
    return {
      total: totalCount,
      completed: 0,
      pending: 0,
      error: 0,
      totalDuration: 0,
    };
  }, [totalCount]);

  const openProcessDialog = (fileIds: string[]) => {
    const promptIds = Array.from(new Set(fileIds.map((id) => files?.find((file) => file.id === id)?.prompt_id || "none")));
    setSelectedPromptId(promptIds.length === 1 ? promptIds[0] : "none");
    setPromptDialog({ open: true, fileIds });
  };

  const selectedPrompt = prompts?.find((prompt) => prompt.id === selectedPromptId);

  const handleProcess = async (
    audioFileIds: string[],
    options?: { promptId?: string; qualityMatrixId?: string }
  ) => {
    if (!accountId) return;
    setPromptDialog({ open: false, fileIds: [] });
    for (const audioFileId of audioFileIds) {
      setProcessing((p) => [...p, audioFileId]);
      try {
        let finalPromptId =
          options?.promptId && options.promptId !== "none" && options.promptId !== "default"
            ? options.promptId
            : undefined;
        if (!finalPromptId) {
          const audioFile = files?.find((f) => f.id === audioFileId);
          if (audioFile?.prompt_id) finalPromptId = audioFile.prompt_id;
        }
        const { error } = await invokeProcessCall({
          audio_file_id: audioFileId,
          account_id: accountId,
          prompt_id: finalPromptId,
          quality_matrix_id: options?.qualityMatrixId,
        });
        if (error) throw error;
        toast.success("Procesamiento iniciado");
      } catch (err: any) {
        toast.error("Error al procesar: " + (err.message || "Error desconocido"));
      } finally {
        setProcessing((p) => p.filter((id) => id !== audioFileId));
      }
    }
    queryClient.invalidateQueries({ queryKey: ["audio-files", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-analyses", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-transcriptions-text", accountId] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-extractions", accountId] });
  };

  const handleExport = async (fmt: ExportFormat) => {
    if (!files?.length) return;
    try {
      const XLSX = await import("xlsx");
      const { data: allAnalyses } = await supabase.from("analyses").select("*").eq("account_id", accountId!);
      const analysisMap = new Map((allAnalyses || []).map((a) => [a.audio_file_id, a]));
      const { data: allTranscriptions } = await supabase.from("transcriptions").select("id, audio_file_id, full_text, language").eq("account_id", accountId!);
      const transcriptionMap = new Map((allTranscriptions || []).map((t) => [t.audio_file_id, t]));
      const { data: allPrompts } = await supabase.from("prompts").select("id, name").eq("account_id", accountId!);
      const promptMap = new Map((allPrompts || []).map((p) => [p.id, p.name]));

      const header = ["Archivo", "Fecha análisis", "Tamaño", "Duración (s)", "Estado", "Prompt Utilizado", "Sentimiento", "Score (%)", "Resumen", "Análisis (Prompt)", "Puntos Positivos", "Puntos Negativos", "Oportunidades", "Insights", "Recomendaciones", "Conclusiones", "Tags", "Idioma"];
      const rows = files.map((f) => {
        const an = analysisMap.get(f.id);
        const tr = transcriptionMap.get(f.id);
        const results = (an?.results as any) || {};
        const promptName = an?.prompt_id ? (promptMap.get(an.prompt_id) || "Personalizado") : "Predeterminado";
        const positiveList = Array.isArray(results.positive) ? results.positive.join("; ") : "";
        const negativeList = Array.isArray(results.negative) ? results.negative.join("; ") : "";
        const opportunitiesList = Array.isArray(results.opportunities) ? results.opportunities.join("; ") : "";
        const fechaAnalisis =
          f.status === "completed" && an?.created_at
            ? format(new Date(an.created_at as string), "dd/MM/yyyy HH:mm")
            : "";
        return [
          f.file_name,
          fechaAnalisis,
          f.file_size_bytes ? `${(f.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : "",
          f.duration_seconds || 0,
          statusLabel[f.status] || f.status,
          promptName,
          an?.overall_sentiment || "",
          an?.sentiment_score != null ? (Number(an.sentiment_score) * 100).toFixed(0) : "",
          an?.summary || "",
          typeof results.analysis === "string" ? results.analysis : "",
          positiveList,
          negativeList,
          opportunitiesList,
          typeof results.insights === "string" ? results.insights : "",
          typeof results.recommendations === "string" ? results.recommendations : "",
          typeof results.conclusions === "string" ? results.conclusions : "",
          (an?.tags as string[] || []).join(", "),
          tr?.language || "",
        ];
      });

      const dateSuffix = format(new Date(), "yyyy-MM-dd");
      if (fmt === "txt") {
        const content = header.join("\t") + "\n" + rows.map((r) => r.join("\t")).join("\n");
        const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `biblioteca-${dateSuffix}.txt`; a.click(); URL.revokeObjectURL(url);
      } else if (fmt === "xlsx") {
        const wsData = [header, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const colWidths = header.map((h, colIdx) => {
          const maxLen = Math.max(h.length, ...rows.map((r) => String(r[colIdx] ?? "").substring(0, 60).length));
          return { wch: Math.min(maxLen + 4, 60) };
        });
        ws["!cols"] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Biblioteca");
        XLSX.writeFile(wb, `biblioteca-${dateSuffix}.xlsx`);
      } else {
        const csvContent = "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `biblioteca-${dateSuffix}.csv`; a.click(); URL.revokeObjectURL(url);
      }
      toast.success("Archivo exportado correctamente");
    } catch { toast.error("Error al exportar"); }
  };

  const toggleSelect = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  const toggleAll = () => {
    if (!files) return;
    if (selected.length === files.length) setSelected([]);
    else setSelected(files.map((f) => f.id));
  };

  const statusLabel: Record<string, string> = {
    uploaded: "Cargado", pending: "Pendiente", queued: "En Cola",
    transcribing: "Transcribiendo", transcribed: "Transcrito",
    analyzing: "Analizando", completed: "Analizado",
    error: "Error", reprocessing: "Reprocesando", cancelled: "Cancelado",
  };
  const statusVariant = (s: string) => {
    if (s === "completed") return "completed" as const;
    if (s === "error") return "error" as const;
    if (["transcribing", "analyzing", "reprocessing", "queued", "pending"].includes(s)) return "processing" as const;
    return "pending" as const;
  };
  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Grabaciones</h1>
          <p className="text-sm text-muted-foreground">Gestión y biblioteca de llamadas de audio para análisis.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canReprocess && (() => {
            const nonCompleted = files?.filter((f) => f.status !== "completed" && f.status !== "cancelled") || [];
            return nonCompleted.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => openProcessDialog(nonCompleted.map((f) => f.id))} className="gap-1.5 text-xs text-accent border-accent/30 hover:bg-accent/10">
                <Sparkles className="w-3.5 h-3.5" /> Procesar ({nonCompleted.length})
              </Button>
            ) : null;
          })()}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Settings2 className="w-3.5 h-3.5" /> Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {allColumns.map(col => (
                <DropdownMenuItem key={col} onClick={(e) => { e.preventDefault(); toggleColumn(col); }} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!hiddenColumns.has(col)} readOnly className="rounded border-input h-3.5 w-3.5" />
                  <span className="text-xs capitalize">{bibliotecaColumnLabel(col)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <UsageWidget />
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["audio-files", accountId] })} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </Button>
          {canExport && (
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)} disabled={!files?.length} className="gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar
            </Button>
          )}
          {canUpload && (
            <Button size="sm" onClick={openUploadModal} className="gap-1.5 text-xs">
              <Upload className="w-3.5 h-3.5" /> Subir Llamada
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard title="Total" value={String(metrics.total)} icon={Phone} />
        <StatCard title="Analizadas" value={String(metrics.completed)} icon={CheckCircle2} subtitle={metrics.total > 0 ? `${Math.round((metrics.completed / metrics.total) * 100)}%` : "0%"} />
        <StatCard title="Pendientes" value={String(metrics.pending)} icon={Clock} />
        <StatCard title="Minutos" value={String(metrics.totalDuration)} icon={Activity} subtitle="min" />
        <StatCard title="Errores" value={String(metrics.error)} icon={AlertCircle} />
      </div>

      {/* Status Tabs + Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs defaultValue="all" className="flex-1" onValueChange={setStatusTab}>
          <TabsList className="bg-muted/50 p-1 rounded-lg">
            <TabsTrigger value="all" className="rounded-md text-xs">Todos ({bibTabCounts.all})</TabsTrigger>
            <TabsTrigger value="completed" className="rounded-md text-xs">Analizados ({bibTabCounts.completed})</TabsTrigger>
            <TabsTrigger value="pending" className="rounded-md text-xs">Pendientes ({bibTabCounts.pending})</TabsTrigger>
            <TabsTrigger value="error" className="rounded-md text-xs">Error ({bibTabCounts.error})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          variant={showFilters ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs shrink-0"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros{activeBibFilters.length > 0 ? ` (${activeBibFilters.length})` : ""}
        </Button>
      </div>

      {activeBibFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeBibFilters.map((c) => (
            <Badge
              key={c.key}
              variant="secondary"
              className="gap-1 text-xs cursor-pointer hover:bg-destructive/10 font-normal"
              onClick={() => clearBibFilter(c.key)}
            >
              {c.label}
              <X className="w-3 h-3" />
            </Badge>
          ))}
          <button type="button" onClick={clearAllBibFilters} className="text-xs text-destructive hover:underline font-medium">
            Limpiar filtros
          </button>
        </div>
      )}

      {showFilters && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha análisis (desde)</label>
              <Input type="date" className="h-9 text-xs" value={filterAnalysisDateFrom} onChange={(e) => setFilterAnalysisDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha análisis (hasta)</label>
              <Input type="date" className="h-9 text-xs" value={filterAnalysisDateTo} onChange={(e) => setFilterAnalysisDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Sentimiento</label>
              <Select value={filterSentiment} onValueChange={setFilterSentiment}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sentimentOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Score % (mín / máx)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Mín"
                  className="h-9 text-xs"
                  value={filterScoreMin}
                  onChange={(e) => setFilterScoreMin(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Máx"
                  className="h-9 text-xs"
                  value={filterScoreMax}
                  onChange={(e) => setFilterScoreMax(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                {extKeyNombreAsesor ? "Nombre Asesor (ext)" : "Asesor"}
              </label>
              <Select value={filterExtAsesor} onValueChange={setFilterExtAsesor}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {optExtAsesor.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!extKeyNombreAsesor && (
                <p className="text-[10px] text-muted-foreground">Desde metadatos o nombre de archivo si no hay regla EXT.</p>
              )}
            </div>
            {extKeyNombreCampaña ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Nombre Campaña (ext)</label>
                <Select value={filterExtCampaña} onValueChange={setFilterExtCampaña}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {optExtCampaña.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 text-[10px] text-muted-foreground flex items-end pb-2">
                Sin columna de regla &quot;Nombre Campaña&quot; en esta cuenta.
              </div>
            )}
            {extKeyFechaExt ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">fecha (ext)</label>
                <Select value={filterExtFecha} onValueChange={setFilterExtFecha}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {optExtFecha.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 text-[10px] text-muted-foreground flex items-end pb-2">
                Sin columna de regla &quot;fecha&quot; en esta cuenta.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, estado, tema..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Selection bar */}
      {selected.length > 0 && (
        <div className="bg-primary/5 rounded-lg border border-primary/10 p-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{selected.length}</span>
            seleccionados
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setSelected([])}>
              <XSquare className="w-3.5 h-3.5" /> Deseleccionar
            </Button>
            {canReprocess && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openProcessDialog(selected)}>
                <Sparkles className="w-3.5 h-3.5" /> Procesar
              </Button>
            )}
            {canBulkDelete && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive hover:bg-destructive/10" onClick={() => setDeleteDialog({ open: true, fileId: "", fileName: `${selected.length} archivos`, bulk: true })}>
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable table */}
      <div className="flex-1 overflow-y-auto w-full">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[5] bg-card">
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" className="rounded border-input" checked={files.length > 0 && selected.length === files.length} onChange={toggleAll} />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Archivo</th>
                  {!hiddenColumns.has("fecha_analisis") && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Fecha análisis</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Duración</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Estado</th>
                  {!hiddenColumns.has("score") && <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Score</th>}
                  {!hiddenColumns.has("sentimiento") && <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Sentimiento</th>}
                  {extColumns.filter(c => !hiddenColumns.has(c)).map(col => (
                    <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{bibliotecaColumnLabel(col)}</th>
                  ))}
                  <th className="w-12 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={99}>
                    <div className="min-h-[200px] flex flex-col items-center justify-center">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground animate-pulse mt-3">Loading voice interactions...</p>
                    </div>
                  </td></tr>
                ) : files.length === 0 ? (
                  <tr><td colSpan={99}>
                    <div className="flex flex-col items-center justify-center text-center py-16">
                      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                        <FileAudio className="w-8 h-8 text-accent" />
                      </div>
                      <p className="text-base font-semibold text-foreground mb-1">{searchQuery ? "Sin resultados" : "Sube tu primera grabación"}</p>
                      <p className="text-sm text-muted-foreground max-w-sm">{searchQuery ? "No se encontraron archivos con ese criterio." : "Haz clic en \"+ Subir grabación\" en el menú lateral para comenzar."}</p>
                    </div>
                  </td></tr>
                ) : (
                  paginatedFiles.map((f) => {
                    const analysisCells = formatCallAnalysisCells(f);
                    return (
                    <tr
                      key={f.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={(e) => {
                        // Don't navigate if clicking checkbox/dropdown
                        if ((e.target as HTMLElement).closest('input, button, [role="menuitem"]')) return;
                        if (f.status === "completed") navigate(`/transcripciones?audio=${f.id}`);
                      }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleSelect(f.id)} className="rounded border-input h-4 w-4" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileAudio className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{f.file_name}</p>
                            <p className="text-[10px] text-muted-foreground">{f.mime_type}</p>
                          </div>
                        </div>
                      </td>
                      {!hiddenColumns.has("fecha_analisis") && (
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap" title={analysisDateLabel(f)}>
                          {analysisDateLabel(f)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatSize(f.file_size_bytes)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{formatDuration(f.duration_seconds)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={statusVariant(f.status)}>{statusLabel[f.status] || f.status}</StatusBadge>
                      </td>
                      {!hiddenColumns.has("score") && (
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{analysisCells.score}</td>
                      )}
                      {!hiddenColumns.has("sentimiento") && (
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[100px]">{analysisCells.sentiment}</td>
                      )}
                      {extColumns.filter(c => !hiddenColumns.has(c)).map(col => (
                        <td key={col} className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[140px]" title={(mergedExtByFile as Record<string, any>)[f.id]?.[col] || ""}>
                          {(mergedExtByFile as Record<string, any>)[f.id]?.[col] || "—"}
                        </td>
                      ))}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><MoreVertical className="w-4 h-4" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canReprocess && f.status !== "completed" && f.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => openProcessDialog([f.id])} disabled={processing.includes(f.id)}>
                                {f.status === "error" ? <RefreshCw className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                {f.status === "error" ? "Reintentar" : "Procesar"}
                              </DropdownMenuItem>
                            )}
                            {f.status === "completed" && (
                              <DropdownMenuItem onClick={() => navigate(`/transcripciones?audio=${f.id}`)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Transcripción
                              </DropdownMenuItem>
                            )}
                            {canDeleteSingle && (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialog({ open: true, fileId: f.id, fileName: f.file_name })}>
                                <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        {totalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
            <div className="text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalCount)}</span> de <span className="font-semibold text-foreground">{totalCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Por página</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage(1)}>«</Button>
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>‹</Button>
              <span className="px-2 text-muted-foreground">Página <span className="font-semibold text-foreground">{safePage}</span> / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>›</Button>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>



      {/* Dual Prompt & Quality Matrix Selection Dialog */}
      <AudioProcessDialog
        open={promptDialog.open}
        onOpenChange={(open) => setPromptDialog({ open, fileIds: promptDialog.fileIds })}
        fileIds={promptDialog.fileIds}
        onConfirm={(opts) => handleProcess(promptDialog.fileIds, opts)}
        isProcessing={processing.length > 0}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, fileId: "", fileName: "" })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar {deleteDialog.bulk ? "archivos" : "archivo"}</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar <strong>{deleteDialog.fileName}</strong>? Se eliminarán también la transcripción, análisis y todos los datos asociados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, fileId: "", fileName: "" })}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteDialog.bulk ? handleBulkDelete : handleSingleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Format Dialog */}
      <ExportFormatDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} onExport={handleExport} title="Export voice interactions" />
    </div>
  );
}
