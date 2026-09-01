import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "@/contexts/AccountContext";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  parseWhatsappImportText,
  parseWhatsappExcelBuffer,
  type WhatsappConversation,
} from "@/utils/whatsappParser";
import { WhatsappChatView } from "@/components/whatsapp/WhatsappChatView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Trash2,
  Download,
  Loader2,
  Upload,
  Brain,
  MessageCircle,
  Smile,
  Meh,
  Frown,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Smartphone,
  FileText,
  BarChart3,
  Users,
  Clock,
  RotateCcw,
  Copy,
  ClipboardPaste,
  FileSpreadsheet,
  X,
  Filter as FilterIcon,
  Sparkles,
  Settings2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useWhatsappUpload } from "@/contexts/WhatsappUploadContext";
import { useIsSuperadmin } from "@/hooks/useIsSuperadmin";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WhatsappAnalysisModal } from "@/components/whatsapp/WhatsappAnalysisModal";
import { StatCard } from "@/components/ui/stat-card";
import {
  type ExtRuleRow,
  type WaConversationRow,
  jsonToRecord,
  partitionExtractionRules,
  computeWhatsappExtractionCells,
} from "@/lib/extractions/applyExtractionRules";
import { resolveExtColumnKey, extValuesEqual } from "@/lib/extractions/extColumnResolve";
import { useWhatsappConversations } from "@/hooks/useWhatsappConversations";
import { useWhatsappAnalysisVisible } from "@/hooks/useWhatsappAnalysisVisible";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { normalizeWhatsappAnalysisForInsights } from "@/lib/analysis/normalizeWhatsappAnalysis";
import { UsageWidget } from "@/components/UsageWidget";
import { TranscriptInsightsColumn } from "@/components/transcripts/TranscriptInsightsColumn";

const getWaSentimentIcon = (sentiment?: string) => {
  if (!sentiment) return <Meh className="w-4 h-4 text-muted-foreground" />;
  const s = sentiment.toLowerCase();
  if (s.includes("positivo") || s.includes("positive")) return <Smile className="w-4 h-4 text-emerald-400" />;
  if (s.includes("negativo") || s.includes("negative")) return <Frown className="w-4 h-4 text-red-400" />;
  return <Meh className="w-4 h-4 text-amber-400" />;
};

function waColumnLabel(col: string): string {
  if (col === "fecha_carga") return "Fecha cargue";
  if (col.endsWith("_EX")) return col.replace("_EX", " (ext)");
  const labels: Record<string, string> = {
    campaña: "Campaña",
    contacto: "Contacto",
    mensajes: "Msgs (C/A)",
    duración: "Duración",
    score: "Score",
    sentimiento: "Sentimiento",
    estado: "Estado",
  };
  return labels[col] ?? col;
}

function waCargaTimeMs(conv: { created_at?: string; start_date?: string | null }): number | null {
  const raw = conv.created_at || conv.start_date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function waAnalysisTimeMs(conv: { status?: string; id: string }, waByConvId: Map<string, Record<string, unknown>>): number | null {
  if (conv.status !== "analizado") return null;
  const r = waByConvId.get(conv.id);
  const raw = (r?.analyzed_at || r?.created_at) as string | undefined;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function waScorePercent(conv: { status?: string; score_general?: unknown }): number | null {
  if (conv.status !== "analizado") return null;
  const raw = Number(conv.score_general);
  if (Number.isNaN(raw)) return null;
  return raw <= 1.5 ? raw * 100 : raw;
}

export default function AnalyticsWhatsappPage() {
  const [searchParams] = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversation");
  const openedFromUrlRef = useRef<string | null>(null);

  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isUploading, uploadProgress, uploadStatus, startUpload } = useWhatsappUpload();
  const isSuperadmin = useIsSuperadmin();
  const { canUploadWhatsapp, whatsappUsed, maxWhatsapp, whatsappRemaining } = useAccountLimits();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [filterCargaDateFrom, setFilterCargaDateFrom] = useState("");
  const [filterCargaDateTo, setFilterCargaDateTo] = useState("");
  const [filterAnalysisDateFrom, setFilterAnalysisDateFrom] = useState("");
  const [filterAnalysisDateTo, setFilterAnalysisDateTo] = useState("");
  const [filterSentiment, setFilterSentiment] = useState<string>("all");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [filterExtAsesor, setFilterExtAsesor] = useState<string>("all");
  const [filterExtCampaña, setFilterExtCampaña] = useState<string>("all");
  const [filterExtFecha, setFilterExtFecha] = useState<string>("all");

  const { data: conversationsData, isLoading } = useWhatsappConversations(
    accountId,
    currentPage,
    pageSize,
    {
      searchTerm,
      status: statusTab,
      cargaDateFrom: filterCargaDateFrom,
      cargaDateTo: filterCargaDateTo,
      sentiment: filterSentiment,
      scoreMin: filterScoreMin,
      scoreMax: filterScoreMax,
      agent: filterExtAsesor,
      campaign: filterExtCampaña,
    }
  );

  const conversations = conversationsData?.data || [];
  const totalCount = conversationsData?.count || 0;

  // Optimized Filter Options: Fetch from a sample of recent data to avoid full table scans
  const { data: filterOptions } = useQuery({
    queryKey: ["wa-filter-options", accountId],
    queryFn: async () => {
      if (!accountId) return { agents: [], campaigns: [], sentiments: [], dates: [] };
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("first_agent_name, campaign, sentiment, start_date")
        .eq("account_id", accountId)
        .order("start_date", { ascending: false })
        .limit(3000);
      
      const agents = Array.from(new Set(data?.map(c => c.first_agent_name).filter(Boolean))).sort();
      const campaigns = Array.from(new Set(data?.map(c => c.campaign).filter(Boolean))).sort();
      const sentiments = Array.from(new Set(data?.map(c => c.sentiment).filter(Boolean))).sort();
      const dates = Array.from(new Set(data?.map(c => {
        if (!c.start_date) return null;
        try {
          return new Date(c.start_date).toISOString().split('T')[0];
        } catch { return null; }
      }).filter(Boolean))).sort().reverse();
      
      return { agents, campaigns, sentiments, dates };
    },
    enabled: !!accountId,
    staleTime: 60000,
  });

  const optExtAsesor = filterOptions?.agents || [];
  const optExtCampaña = filterOptions?.campaigns || [];
  const optExtFecha = filterOptions?.dates || [];
  const sentimentOptions = filterOptions?.sentiments || [];

  const visibleIds = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { data: waAnalysisMap, isLoading: isLoadingAnalysis } = useWhatsappAnalysisVisible(accountId, visibleIds);

  // ... (Upload verification and other states remain the same)
  const [showSummary, setShowSummary] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<{
    new: any[];
    upToDate: any[];
    incomplete: any[];
    totalMessages: number;
    parsedData: any[];
  } | null>(null);
  const [updateExistingMessages, setUpdateExistingMessages] = useState(true);
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [hiddenWaCols, setHiddenWaCols] = useState<Set<string>>(() => new Set(["campaña"]));
  const toggleWaCol = (col: string) => setHiddenWaCols(prev => {
    const next = new Set(prev);
    if (next.has(col)) next.delete(col); else next.add(col);
    return next;
  });
  
  const { data: waExtractionRulesRaw } = useQuery({
    queryKey: ["wa-list-extraction-rules", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_rules")
        .select("id, name, source, extraction_type, config")
        .eq("account_id", accountId!);
      if (error) throw error;
      return (data || []) as ExtRuleRow[];
    },
    enabled: !!accountId,
  });

  const { waOnlyRules, callRulesWithWaSync } = useMemo(
    () => partitionExtractionRules(waExtractionRulesRaw || []),
    [waExtractionRulesRaw],
  );

  const waExtColumnIds = useMemo(() => {
    const names = new Set<string>();
    waOnlyRules.forEach((r) => names.add(`${r.name}_EX`));
    callRulesWithWaSync.forEach((r) => names.add(`${r.name}_EX`));
    return [...names];
  }, [waOnlyRules, callRulesWithWaSync]);

  const waByConvId = waAnalysisMap || {};

  const convIdsNeedingAgentSig = useMemo(
    () => conversations.filter((c) => !c.first_agent_name).map((c) => c.id).sort().join(","),
    [conversations],
  );

  const { data: waAgentFallbackRecord } = useQuery({
    queryKey: ["wa-agent-fallbacks", accountId, convIdsNeedingAgentSig],
    queryFn: async () => {
      const ids = convIdsNeedingAgentSig ? convIdsNeedingAgentSig.split(",").filter(Boolean) : [];
      const rec: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data: agentMsgs } = await supabase
          .from("whatsapp_messages")
          .select("conversation_id, agent_name")
          .in("conversation_id", chunk)
          .eq("sender_type", "Agente")
          .not("agent_name", "is", null)
          .order("timestamp", { ascending: true });
        (agentMsgs || []).forEach((m: any) => {
          if (m.agent_name && !rec[m.conversation_id]) rec[m.conversation_id] = m.agent_name;
        });
      }
      return rec;
    },
    enabled: !!accountId && !!convIdsNeedingAgentSig,
  });

  const waExtCellsByConv = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    if (!conversations.length) return m;
    for (const conv of conversations) {
      const res = (waByConvId as Record<string, any>)[conv.id];
      const results = jsonToRecord((res?.results as Parameters<typeof jsonToRecord>[0]) ?? null);
      const agentFallback = conv.first_agent_name || waAgentFallbackRecord?.[conv.id] || "Desconocido";
      const cells = computeWhatsappExtractionCells(
        conv as WaConversationRow,
        results,
        agentFallback,
        waOnlyRules,
        callRulesWithWaSync,
      );
      m.set(conv.id, cells);
    }
    return m;
  }, [conversations, waByConvId, waAgentFallbackRecord, waOnlyRules, callRulesWithWaSync]);

  const waColumns = useMemo(
    () => ["campaña", "contacto", "fecha_carga", "mensajes", "duración", "score", "sentimiento", ...waExtColumnIds, "estado"],
    [waExtColumnIds],
  );

  const extKeyNombreAsesor = useMemo(() => resolveExtColumnKey(waExtColumnIds, "nombre_asesor"), [waExtColumnIds]);
  const extKeyNombreCampaña = useMemo(() => resolveExtColumnKey(waExtColumnIds, "nombre_campaña"), [waExtColumnIds]);
  const extKeyFechaExt = useMemo(() => resolveExtColumnKey(waExtColumnIds, "fecha_ext"), [waExtColumnIds]);

  const { data: countsData } = useQuery({
    queryKey: ["wa-counts", accountId, searchTerm, filterCargaDateFrom, filterCargaDateTo, filterSentiment, filterScoreMin, filterScoreMax, filterExtAsesor, filterExtCampaña],
    queryFn: async () => {
      if (!accountId) return { all: 0, notAnalyzed: 0, inProcess: 0, analyzed: 0, errored: 0 };
      
      const buildBase = () => {
        let q = supabase.from("whatsapp_conversations").select("*", { count: "exact", head: true }).eq("account_id", accountId);
        if (searchTerm) {
          const term = `%${searchTerm}%`;
          q = q.or(`contact_name.ilike.${term},phone_number.ilike.${term},campaign.ilike.${term},external_id.ilike.${term}`);
        }
        if (filterCargaDateFrom) q = q.gte("start_date", filterCargaDateFrom);
        if (filterCargaDateTo) q = q.lte("start_date", filterCargaDateTo);
        if (filterSentiment !== "all") q = q.eq("sentiment", filterSentiment);
        if (filterScoreMin) q = q.gte("score_general", parseFloat(filterScoreMin) / 100);
        if (filterScoreMax) q = q.lte("score_general", parseFloat(filterScoreMax) / 100);
        if (filterExtAsesor !== "all") q = q.eq("first_agent_name", filterExtAsesor);
        if (filterExtCampaña !== "all") q = q.eq("campaign", filterExtCampaña);
        return q;
      };

      const [all, notAnalyzed, inProcess, analyzed, errored] = await Promise.all([
        buildBase(),
        buildBase().in("status", ["no_analizado", "pendiente"]),
        buildBase().eq("status", "en_proceso"),
        buildBase().eq("status", "analizado"),
        buildBase().eq("status", "error"),
      ]);

      return {
        all: all.count || 0,
        notAnalyzed: notAnalyzed.count || 0,
        inProcess: inProcess.count || 0,
        analyzed: analyzed.count || 0,
        errored: errored.count || 0
      };
    },
    enabled: !!accountId,
    staleTime: 30000,
  });

  const waTabCounts = countsData || { all: 0, notAnalyzed: 0, inProcess: 0, analyzed: 0, errored: 0 };
  const totalPages = Math.ceil(totalCount / pageSize);
  const safePage = Math.min(currentPage, totalPages || 1);

  const metrics = useMemo(() => {
    return {
      total: waTabCounts.all,
      analyzed: waTabCounts.analyzed,
      notAnalyzed: waTabCounts.notAnalyzed,
      inProcess: waTabCounts.inProcess,
      errored: waTabCounts.errored,
      totalMessages: 0,
      uniqueContacts: 0,
      avgScore: 0,
      totalMsgsCliente: 0,
      totalMsgsAgente: 0,
      avgDuration: 0,
    };
  }, [waTabCounts]);

  const activeWaFilters = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filterCargaDateFrom || filterCargaDateTo)
      chips.push({
        key: "carga_date",
        label: `Fecha cargue: ${filterCargaDateFrom || "…"} → ${filterCargaDateTo || "…"}`,
      });
    if (filterAnalysisDateFrom || filterAnalysisDateTo)
      chips.push({
        key: "anal_date",
        label: `Fecha análisis: ${filterAnalysisDateFrom || "…"} → ${filterAnalysisDateTo || "…"}`,
      });
    if (filterSentiment !== "all") chips.push({ key: "sent", label: `Sentimiento: ${filterSentiment}` });
    if (filterScoreMin !== "" || filterScoreMax !== "")
      chips.push({ key: "score", label: `Score %: ${filterScoreMin || "—"} – ${filterScoreMax || "—"}` });
    if (filterExtAsesor !== "all") chips.push({ key: "ext_asesor", label: `Asesor: ${filterExtAsesor}` });
    if (filterExtCampaña !== "all") chips.push({ key: "ext_camp", label: `Campaña: ${filterExtCampaña}` });
    return chips;
  }, [
    filterCargaDateFrom,
    filterCargaDateTo,
    filterAnalysisDateFrom,
    filterAnalysisDateTo,
    filterSentiment,
    filterScoreMin,
    filterScoreMax,
    filterExtAsesor,
    filterExtCampaña,
  ]);

  const clearWaFilter = (key: string) => {
    if (key === "carga_date") {
      setFilterCargaDateFrom("");
      setFilterCargaDateTo("");
    }
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
  };

  const clearAllWaFilters = () => {
    setFilterCargaDateFrom("");
    setFilterCargaDateTo("");
    setFilterAnalysisDateFrom("");
    setFilterAnalysisDateTo("");
    setFilterSentiment("all");
    setFilterScoreMin("");
    setFilterScoreMax("");
    setFilterExtAsesor("all");
    setFilterExtCampaña("all");
  };

  const fetchConversations = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    queryClient.invalidateQueries({ queryKey: ["wa-visible-analysis"] });
    queryClient.invalidateQueries({ queryKey: ["wa-counts"] });
  }, [queryClient]);

  const filteredConversations = conversations;
  const paginatedConversations = conversations;

  // Actions
  const resetStuckConversations = async () => {
    setIsResetting(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ status: "no_analizado" } as any)
        .eq("account_id", currentAccount?.account_id)
        .in("status", ["en_proceso", "error"]);
      if (error) throw error;
      toast({ title: "Conversaciones reiniciadas" });
      fetchConversations();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSelectConversation = async (conv: any) => {
    try {
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("timestamp", { ascending: true });

      const { data: analysis } = await (supabase
        .from("whatsapp_analysis_results")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      setSelectedConversation({ ...conv, messages: messages || [] });
      setAnalysisResult(analysis || null);
    } catch (error: any) {
      toast({ title: "Error al cargar mensajes", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!conversationIdFromUrl || isLoading || !conversations.length) return;
    if (openedFromUrlRef.current === conversationIdFromUrl) return;
    const conv = conversations.find((c) => c.id === conversationIdFromUrl);
    if (conv) {
      openedFromUrlRef.current = conversationIdFromUrl;
      void handleSelectConversation(conv);
    }
  }, [conversationIdFromUrl, conversations, isLoading]);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSuperadmin) {
      toast({ title: "Acción restringida", description: "Solo Superadmin puede eliminar conversaciones. El consumo registrado no se descuenta.", variant: "destructive" });
      return;
    }
    if (!confirm("¿Eliminar esta conversación? El consumo registrado se mantendrá.")) return;
    try {
      const { error } = await supabase.from("whatsapp_conversations").delete().eq("id", id);
      if (error) throw error;
      fetchConversations();
      if (selectedConversation?.id === id) setSelectedConversation(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteSelectedConversations = async () => {
    if (!isSuperadmin) {
      toast({ title: "Acción restringida", description: "Solo Superadmin puede eliminar conversaciones.", variant: "destructive" });
      return;
    }
    if (!selectedIds.length || !confirm(`¿Eliminar ${selectedIds.length} conversaciones? El consumo registrado se mantendrá.`)) return;
    const idsToDelete = [...selectedIds];
    /** PostgREST pone `in.(…)` en la URL; muchos UUID en una sola petición supera el límite de longitud y devuelve 400. */
    const BATCH = 100;
    try {
      for (let i = 0; i < idsToDelete.length; i += BATCH) {
        const batch = idsToDelete.slice(i, i + BATCH);
        const { error } = await supabase.from("whatsapp_conversations").delete().in("id", batch);
        if (error) throw error;
      }
      fetchConversations();
      setSelectedIds([]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSelectAll = (checked: boolean) => setSelectedIds(checked ? conversations.map((c) => c.id) : []);
  const toggleSelectConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado" });
  };

  // Upload: CSV, Excel (.xlsx/.xls) o pegado (TSV/CSV)
  const runImportVerification = useCallback(
    async (parsedData: WhatsappConversation[]) => {
      if (!currentAccount) return;
      if (parsedData.length === 0) {
        toast({
          title: "Sin datos reconocibles",
          description:
            "No se encontraron conversaciones (filas Header / Thread). Usa el export estándar o la primera hoja del Excel.",
          variant: "destructive",
        });
        return;
      }

      const { data: dbCounts } = (await supabase
        .from("whatsapp_conversations")
        .select("external_id, whatsapp_messages(count)" as any)
        .eq("account_id", currentAccount.account_id)) as any;

      const dbMap = new Map();
      dbCounts?.forEach((item: any) => dbMap.set(item.external_id, item.whatsapp_messages?.[0]?.count || 0));

      const summary = {
        new: [] as any[],
        upToDate: [] as any[],
        incomplete: [] as any[],
        totalMessages: 0,
        parsedData,
      };
      for (const conv of parsedData) {
        const dbCount = dbMap.get(conv.external_id);
        summary.totalMessages += conv.messages.length;
        if (dbCount === undefined) summary.new.push(conv);
        else if (conv.messages.length > dbCount)
          summary.incomplete.push({ ...conv, dbCount, newCount: conv.messages.length - dbCount });
        else summary.upToDate.push(conv);
      }
      setVerificationSummary(summary);
      setShowSummary(true);
    },
    [currentAccount, toast],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentAccount) return;
    setIsVerifying(true);
    try {
      const lower = file.name.toLowerCase();
      let parsedData: WhatsappConversation[];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) {
        const buf = await file.arrayBuffer();
        parsedData = parseWhatsappExcelBuffer(buf);
      } else {
        const text = await file.text();
        parsedData = parseWhatsappImportText(text);
      }
      await runImportVerification(parsedData);
    } catch (error: any) {
      toast({ title: "Error al verificar archivo", description: error.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
      event.target.value = "";
    }
  };

  const handlePasteImport = async () => {
    if (!currentAccount) return;
    if (!pasteText.trim()) {
      toast({ title: "Contenido vacío", description: "Pega el export (CSV o tabla desde Excel).", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    try {
      const parsedData = parseWhatsappImportText(pasteText);
      await runImportVerification(parsedData);
      setShowPasteDialog(false);
      setPasteText("");
    } catch (error: any) {
      toast({ title: "Error al procesar pegado", description: error.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const confirmUpload = async () => {
    if (!verificationSummary || !currentAccount) return;
    let uploadData = [...verificationSummary.new];
    if (updateExistingMessages) uploadData = [...uploadData, ...verificationSummary.incomplete];

    if (!canUploadWhatsapp) {
      toast({
        title: "Límite de conversaciones alcanzado",
        description: `Has consumido ${whatsappUsed} de ${maxWhatsapp} este mes. Solicita ampliación al administrador.`,
        variant: "destructive",
      });
      return;
    }

    if (uploadData.length > whatsappRemaining) {
      toast({
        title: "La carga excede el cupo restante",
        description: `Te quedan ${whatsappRemaining} conversaciones disponibles. Reduce el archivo o solicita ampliación.`,
        variant: "destructive",
      });
      return;
    }

    setShowSummary(false);
    await startUpload(uploadData, currentAccount.account_id, { updateExisting: true });
    fetchConversations();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "analizado":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800";
      case "no_analizado":
      case "pendiente":
        return "bg-muted text-muted-foreground border-border";
      case "en_proceso":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 animate-pulse";
      case "error":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "analizado":
        return "Analizado";
      case "no_analizado":
      case "pendiente":
        return "Sin Analizar";
      case "en_proceso":
        return "En Proceso";
      case "error":
        return "Error";
      default:
        return status || "Sin Analizar";
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  };

  const waInsightsNormalized = useMemo(
    () =>
      normalizeWhatsappAnalysisForInsights(
        analysisResult,
        selectedConversation?.prompt_utilizado_nombre ?? null,
      ),
    [analysisResult, selectedConversation?.prompt_utilizado_nombre],
  );

  const getWaSentimentIcon = useCallback((sentiment?: string) => {
    if (sentiment === "positive") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (sentiment === "negative") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  }, []);

  return (
    <div className="flex flex-col h-full space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Chats</h1>
          <p className="text-sm text-muted-foreground">Upload, review, and analyze chats with AI (parallel channel to Gestión de Grabaciones).</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(metrics.inProcess > 0 || metrics.errored > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetStuckConversations}
              disabled={isResetting}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className={cn("w-3.5 h-3.5", isResetting && "animate-spin")} />
              Reiniciar ({metrics.inProcess + metrics.errored})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Settings2 className="w-3.5 h-3.5" /> Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {waColumns.map(col => (
                <DropdownMenuItem key={col} onClick={(e) => { e.preventDefault(); toggleWaCol(col); }} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!hiddenWaCols.has(col)} readOnly className="rounded border-input h-3.5 w-3.5" />
                  <span className="text-xs capitalize">{waColumnLabel(col)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <UsageWidget />
          <Button variant="outline" size="sm" onClick={fetchConversations} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading || isVerifying}
                className="gap-1.5 text-xs"
              >
                {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Importar datos
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="gap-2 cursor-pointer text-xs"
                disabled={isUploading || isVerifying}
                onSelect={(e) => {
                  e.preventDefault();
                  setTimeout(() => document.getElementById("whatsapp-upload")?.click(), 0);
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                Archivo (CSV, Excel…)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer text-xs"
                disabled={isUploading || isVerifying}
                onSelect={(e) => {
                  e.preventDefault();
                  setShowPasteDialog(true);
                }}
              >
                <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
                Pegar desde portapapeles
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            id="whatsapp-upload"
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button onClick={() => setIsAnalysisModalOpen(true)} size="sm" className="gap-1.5 text-xs">
            <Brain className="w-3.5 h-3.5" /> Nuevo Análisis
          </Button>
        </div>
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 rounded-lg border border-primary/10">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-medium text-primary">
              <span>{uploadStatus}</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5 mt-1" />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard title="Total" value={String(metrics.total)} icon={MessageCircle} />
        <StatCard
          title="Analizadas"
          value={String(metrics.analyzed)}
          icon={CheckCircle2}
          subtitle={metrics.total > 0 ? `${Math.round((metrics.analyzed / metrics.total) * 100)}%` : "0%"}
        />
        <StatCard title="Pendientes" value={String(metrics.notAnalyzed)} icon={Clock} />
        <StatCard
          title="Mensajes"
          value={String(metrics.totalMessages)}
          icon={FileText}
          subtitle={`C:${metrics.totalMsgsCliente} / A:${metrics.totalMsgsAgente}`}
        />
        <StatCard title="Score Prom." value={metrics.avgScore ? String(metrics.avgScore) : "—"} icon={BarChart3} />
        <StatCard title="Contactos" value={String(metrics.uniqueContacts)} icon={Users} />
        <StatCard
          title="Duración Prom."
          value={metrics.avgDuration ? `${metrics.avgDuration}m` : "—"}
          icon={Activity}
        />
        <StatCard title="Con Error" value={String(metrics.errored)} icon={AlertCircle} />
      </div>

      {/* Status Tabs + Filter Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs defaultValue="all" className="flex-1" onValueChange={setStatusTab}>
          <TabsList className="bg-muted/50 p-1 rounded-lg">
            <TabsTrigger value="all" className="rounded-md text-xs">
              Todos ({waTabCounts.all})
            </TabsTrigger>
            <TabsTrigger value="no_analizado" className="rounded-md text-xs">
              Pendientes ({waTabCounts.notAnalyzed})
            </TabsTrigger>
            <TabsTrigger value="en_proceso" className="rounded-md text-xs">
              En Proceso ({waTabCounts.inProcess})
            </TabsTrigger>
            <TabsTrigger value="analizado" className="rounded-md text-xs">
              Analizados ({waTabCounts.analyzed})
            </TabsTrigger>
            <TabsTrigger value="error" className="rounded-md text-xs">
              Error ({waTabCounts.errored})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5 text-xs"
        >
          <FilterIcon className="w-3.5 h-3.5" /> Filtros {activeWaFilters.length > 0 && `(${activeWaFilters.length})`}
        </Button>
      </div>

      {/* Active filter chips */}
      {activeWaFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeWaFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="gap-1 text-xs cursor-pointer hover:bg-destructive/10"
              onClick={() => clearWaFilter(f.key)}
            >
              {f.label} <X className="w-3 h-3" />
            </Badge>
          ))}
          <button type="button" onClick={clearAllWaFilters} className="text-xs text-destructive hover:underline font-medium">
            Limpiar filtros
          </button>
        </div>
      )}

      {showFilters && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha cargue (desde)</label>
              <Input type="date" className="h-9 text-xs" value={filterCargaDateFrom} onChange={(e) => setFilterCargaDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Fecha cargue (hasta)</label>
              <Input type="date" className="h-9 text-xs" value={filterCargaDateTo} onChange={(e) => setFilterCargaDateTo(e.target.value)} />
            </div>
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
                <p className="text-[10px] text-muted-foreground">Nombre del agente en conversación o primer mensaje Agente.</p>
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

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 rounded-lg border border-primary/10">
          <span className="text-xs font-semibold text-primary">{selectedIds.length} seleccionadas</span>
          <Button variant="destructive" size="sm" className="text-xs h-7" onClick={deleteSelectedConversations}>
            <Trash2 className="w-3 h-3 mr-1" /> Eliminar
          </Button>
        </div>
      )}

      {/* Compact search when filters hidden */}
      {!showFilters && (
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar contacto, teléfono, campaña..."
            className="pl-8 h-9 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {/* Table */}
      <Card className="border border-border rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        <CardContent className="p-0 flex-1 min-h-0 overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="w-10 pl-4">
                    <input
                      type="checkbox"
                      className="rounded border-input h-3.5 w-3.5"
                      checked={selectedIds.length === filteredConversations.length && filteredConversations.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </TableHead>
                  {!hiddenWaCols.has("campaña") && <TableHead className="text-[10px] font-semibold uppercase">Campaña</TableHead>}
                  {!hiddenWaCols.has("contacto") && <TableHead className="text-[10px] font-semibold uppercase">Contacto</TableHead>}
                  {!hiddenWaCols.has("fecha_carga") && <TableHead className="text-[10px] font-semibold uppercase">Fecha cargue</TableHead>}
                  {!hiddenWaCols.has("mensajes") && <TableHead className="text-[10px] font-semibold uppercase">Msgs (C/A)</TableHead>}
                  {!hiddenWaCols.has("duración") && <TableHead className="text-[10px] font-semibold uppercase">Duración</TableHead>}
                  {!hiddenWaCols.has("score") && <TableHead className="text-[10px] font-semibold uppercase">Score</TableHead>}
                  {!hiddenWaCols.has("sentimiento") && <TableHead className="text-[10px] font-semibold uppercase">Sentimiento</TableHead>}
                  {waExtColumnIds.filter((id) => !hiddenWaCols.has(id)).map((col) => (
                    <TableHead key={col} className="text-[10px] font-semibold uppercase whitespace-nowrap">
                      {waColumnLabel(col)}
                    </TableHead>
                  ))}
                  {!hiddenWaCols.has("estado") && <TableHead className="text-[10px] font-semibold uppercase">Estado</TableHead>}
                  <TableHead className="w-10 pr-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={99} className="h-48 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary/40 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredConversations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={99} className="h-48 text-center text-muted-foreground">
                      <Smartphone className="w-6 h-6 opacity-20 mx-auto mb-2" />
                      <p className="text-xs">Sin resultados para los filtros actuales.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedConversations.map((conv) => (
                    <TableRow
                      key={conv.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/30 transition-colors group",
                        selectedIds.includes(conv.id) && "bg-primary/5",
                      )}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <TableCell className="pl-4">
                        <input
                          type="checkbox"
                          className="rounded border-input h-3.5 w-3.5"
                          checked={selectedIds.includes(conv.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleSelectConversation(conv.id, e as any)}
                        />
                      </TableCell>
                      {!hiddenWaCols.has("campaña") && (
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {conv.campaign || "—"}
                          </Badge>
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("contacto") && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-bold">
                                {conv.contact_name?.slice(0, 2).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate max-w-[100px]">{conv.contact_name || "—"}</p>
                              <p className="text-[9px] text-muted-foreground font-mono">{conv.phone_number || ""}</p>
                            </div>
                          </div>
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("fecha_carga") && (
                        <TableCell className="text-[10px]">
                          {conv.created_at || conv.start_date
                            ? format(new Date(conv.created_at || conv.start_date), "dd MMM yyyy, HH:mm", { locale: es })
                            : "—"}
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("mensajes") && (
                        <TableCell className="text-[10px] font-medium">
                          <span>{conv.total_messages || 0}</span>
                          <span className="text-[8px] text-muted-foreground ml-1">
                            ({conv.mensajes_cliente || 0}/{conv.mensajes_agente || 0})
                          </span>
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("duración") && (
                        <TableCell className="text-[10px] text-muted-foreground">
                          {formatDuration(conv.duracion_conversacion)}
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("score") && (
                        <TableCell>
                          {conv.status === "analizado" && conv.score_general ? (
                            <Badge
                              variant="outline"
                              className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold"
                            >
                              {conv.score_general}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {!hiddenWaCols.has("sentimiento") && (
                        <TableCell>
                          {conv.status === "analizado" ? (
                            <div className="flex items-center gap-1">
                              {conv.sentiment === "Positivo" || conv.sentiment === "positive" ? (
                                <Smile className="w-3 h-3 text-emerald-500" />
                              ) : conv.sentiment === "Negativo" || conv.sentiment === "negative" ? (
                                <Frown className="w-3 h-3 text-destructive" />
                              ) : (
                                <Meh className="w-3 h-3 text-amber-500" />
                              )}
                              <span className="text-[9px]">{conv.sentiment || "Neutral"}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {waExtColumnIds.filter((id) => !hiddenWaCols.has(id)).map((col) => (
                        <TableCell
                          key={col}
                          className="text-[10px] text-muted-foreground truncate max-w-[120px]"
                          title={waExtCellsByConv.get(conv.id)?.[col]}
                        >
                          {waExtCellsByConv.get(conv.id)?.[col] || "—"}
                        </TableCell>
                      ))}
                      {!hiddenWaCols.has("estado") && (
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[9px] font-semibold", statusColor(conv.status))}>
                            {statusLabel(conv.status)}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="pr-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/30 hover:text-destructive opacity-0 group-hover:opacity-100"
                          onClick={(e) => deleteConversation(conv.id, e)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredConversations.length > 0 && (
            <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
              <span>
                Mostrando <span className="font-semibold text-foreground">{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalCount)}</span> de <span className="font-semibold text-foreground">{totalCount}</span>
                <span className="ml-3">· Msgs cliente: {metrics.totalMsgsCliente} · Msgs agente: {metrics.totalMsgsAgente}</span>
              </span>
              <div className="flex items-center gap-2">
                <span>Por página</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-7" disabled={safePage <= 1} onClick={() => setCurrentPage(1)}>«</Button>
                <Button variant="outline" size="sm" className="h-7" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>‹</Button>
                <span className="px-1">Página <span className="font-semibold text-foreground">{safePage}</span> / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>›</Button>
                <Button variant="outline" size="sm" className="h-7" disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)}>»</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!selectedConversation} onOpenChange={(open) => !open && setSelectedConversation(null)}>
        <SheetContent className="sm:max-w-[1000px] p-0 border-l shadow-2xl flex flex-col">
          {selectedConversation && (
            <div className="flex flex-col h-full">
              <SheetHeader className="px-6 py-4 border-b bg-card sticky top-0 z-20 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                      {selectedConversation.contact_name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-base font-bold">{selectedConversation.contact_name}</SheetTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedConversation.phone_number}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {selectedConversation.campaign}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[9px]", statusColor(selectedConversation.status))}>
                        {statusLabel(selectedConversation.status)}
                      </Badge>
                      {selectedConversation.prompt_utilizado_nombre && (
                        <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20">
                          <Sparkles className="w-2.5 h-2.5 mr-1" />
                          {selectedConversation.prompt_utilizado_nombre}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 h-full">
                  <WhatsappChatView
                    messages={selectedConversation.messages}
                    contactName={selectedConversation.contact_name || selectedConversation.phone_number}
                  />
                </div>

                {/* Analysis Sidebar — mismo bloque de insights que Transcripciones (TranscriptInsightsColumn) */}
                <div className="hidden lg:flex flex-col w-[min(100%,520px)] min-w-[300px] border-l bg-card shrink-0 h-full min-h-0">
                  {analysisResult ? (
                    <div className="flex flex-col h-full min-h-0">
                      <div className="p-4 border-b border-border space-y-3 shrink-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Conversación WhatsApp
                          </h4>
                          {analysisResult.score_general != null && (
                            <Badge className="bg-primary text-primary-foreground font-bold text-xs">
                              {String(analysisResult.score_general)}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2.5 rounded-lg bg-muted/30 border border-border text-center">
                            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Cliente</span>
                            <p className="text-sm font-bold">{selectedConversation.mensajes_cliente ?? "—"}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-muted/30 border border-border text-center">
                            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Agente</span>
                            <p className="text-sm font-bold">{selectedConversation.mensajes_agente ?? "—"}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-muted/30 border border-border text-center">
                            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Duración</span>
                            <p className="text-sm font-bold">
                              {formatDuration(selectedConversation.duracion_conversacion)}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Analizado:{" "}
                          {analysisResult.analyzed_at
                            ? format(new Date(analysisResult.analyzed_at), "dd/MM/yyyy HH:mm")
                            : "—"}
                          {analysisResult.id ? (
                            <>
                              {" "}
                              · ID <span className="font-mono">{String(analysisResult.id).slice(0, 8)}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col">
                        <TranscriptInsightsColumn
                          analysis={waInsightsNormalized.analysis}
                          results={waInsightsNormalized.results}
                          getSentimentIcon={getWaSentimentIcon}
                          summarySectionTitle="Resumen de la conversación"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 space-y-5">
                      <h4 className="text-[10px] font-bold text-primary uppercase tracking-wider border-b border-border pb-2 mb-3">
                        Información de Sesión
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase">ID Sesión</span>
                          <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg mt-0.5">
                            <span className="text-[10px] font-mono break-all pr-2">
                              {selectedConversation.external_id}
                            </span>
                            <button
                              onClick={() => copyToClipboard(selectedConversation.external_id)}
                              className="text-primary"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Inicio</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {selectedConversation.start_date
                                ? format(new Date(selectedConversation.start_date), "dd/MM/yy HH:mm")
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Fin</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {selectedConversation.end_date
                                ? format(new Date(selectedConversation.end_date), "dd/MM/yy HH:mm")
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Tipo</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {selectedConversation.initiate_type || "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Agente</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {selectedConversation.first_agent_name || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Mensajes</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {selectedConversation.total_messages || selectedConversation.messages?.length || 0}
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground uppercase">Duración</span>
                            <p className="text-[10px] font-medium mt-0.5">
                              {formatDuration(selectedConversation.duracion_conversacion)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center text-center p-6 bg-muted/30 rounded-xl border-2 border-dashed border-border">
                        <Brain className="w-6 h-6 text-muted-foreground/30 mb-2" />
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sin Análisis IA</p>
                        <p className="text-[9px] text-muted-foreground mt-1">Usa "Nuevo Análisis" para procesar.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <WhatsappAnalysisModal
        open={isAnalysisModalOpen}
        onOpenChange={setIsAnalysisModalOpen}
        onSuccess={fetchConversations}
      />

      {/* Pegar export (CSV / tabla desde Excel) */}
      <Dialog open={showPasteDialog} onOpenChange={setShowPasteDialog}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-primary" /> Pegar datos de conversaciones
            </DialogTitle>
            <DialogDescription>
              Copia desde Excel o desde un CSV (mismo formato que al exportar: filas{" "}
              <code className="text-xs bg-muted px-1 rounded">Header</code> y{" "}
              <code className="text-xs bg-muted px-1 rounded">Thread</code>) y pégalo aquí.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Pega aquí (Ctrl+V)…"
            className="min-h-[220px] font-mono text-xs"
            disabled={isVerifying}
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPasteDialog(false)} disabled={isVerifying}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handlePasteImport} disabled={isVerifying}>
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Verificar y continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" /> Resumen de Carga
            </DialogTitle>
            <DialogDescription>Detalle del archivo analizado.</DialogDescription>
          </DialogHeader>
          {verificationSummary && (
            <div className="space-y-3 py-3">
              <div className="grid gap-2">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-400">Nuevos</p>
                  </div>
                  <span className="text-lg font-bold text-emerald-600">{verificationSummary.new.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-400">Actualizaciones</p>
                  </div>
                  <span className="text-lg font-bold text-amber-600">{verificationSummary.incomplete.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50 border-border">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-bold text-muted-foreground">Sin Cambios</p>
                  </div>
                  <span className="text-lg font-bold text-muted-foreground">{verificationSummary.upToDate.length}</span>
                </div>
              </div>
              <label className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateExistingMessages}
                  onChange={(e) => setUpdateExistingMessages(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-xs font-medium">Agregar nuevos mensajes a chats existentes</span>
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSummary(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmUpload}>
              Confirmar Carga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
