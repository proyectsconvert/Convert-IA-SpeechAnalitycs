import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { TrendingUp, TrendingDown, Minus, FileAudio, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ExportFormatDialog, type ExportFormat } from "@/components/ExportFormatDialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TranscriptsPageHeader } from "@/components/transcripts/TranscriptsPageHeader";
import {
  TranscriptCallListPanel,
  type TranscriptSortOrder,
  type TranscriptSentimentFilter,
} from "@/components/transcripts/TranscriptCallListPanel";
import { useTranscripcionesList } from "@/hooks/useTranscripcionesList";
import { TranscriptDetailWorkspace } from "@/components/transcripts/TranscriptDetailWorkspace";
import { TranscriptAudioFooter } from "@/components/transcripts/TranscriptAudioFooter";
import { useTranscriptViewPreference } from "@/hooks/useTranscriptViewPreference";
import { TranscriptExplorerList } from "@/components/transcripts/TranscriptExplorerList";
import { TranscriptDetailModal } from "@/components/transcripts/TranscriptDetailModal";

export default function TranscripcionesPage() {
  const { currentAccount } = useAccount();
  const { user, profile } = useAuth();
  const accountId = currentAccount?.account_id;
  const { canChat, queriesUsed, maxQueries } = useAccountLimits();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const audioParam = searchParams.get("audio");

  const { viewMode, setViewMode, isSaving: isSavingPreference } = useTranscriptViewPreference();
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(audioParam);
  const [searchTerm, setSearchTerm] = useState("");
  const [callSearchTerm, setCallSearchTerm] = useState("");
  const [debouncedCallSearchTerm, setDebouncedCallSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCallSearchTerm(callSearchTerm), 500);
    return () => clearTimeout(timer);
  }, [callSearchTerm]);

  const [sortOrder, setSortOrder] = useState<TranscriptSortOrder>("newest");
  const [sentimentFilter, setSentimentFilter] = useState<TranscriptSentimentFilter>("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string; created_at?: string; user_name?: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "detail" | "insights">("list");
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: transData, isLoading } = useTranscripcionesList(
    accountId,
    currentPage,
    pageSize,
    debouncedCallSearchTerm,
    sentimentFilter,
    sortOrder
  );

  const transcriptions = transData?.data || [];
  const totalCount = transData?.count || 0;

  const { data: allAnalyses } = useQuery({
    queryKey: ["all-analyses", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase
        .from("analyses")
        .select("audio_file_id, overall_sentiment, sentiment_score, tags")
        .eq("account_id", accountId);
      return data || [];
    },
    enabled: !!accountId,
  });

  const analysisMap = useMemo(() => {
    return new Map((allAnalyses || []).map((a) => [a.audio_file_id, a]));
  }, [allAnalyses]);

  const filteredTranscriptions = transcriptions;

  useEffect(() => {
    if (!selectedAudioId && transcriptions?.length) {
      const match = audioParam
        ? transcriptions.find((t) => (t.audio_files as { id?: string })?.id === audioParam)
        : transcriptions[0];
      if (match) setSelectedAudioId((match.audio_files as { id: string }).id);
      else if (transcriptions[0]) setSelectedAudioId((transcriptions[0].audio_files as { id: string }).id);
    }
  }, [transcriptions, audioParam, selectedAudioId]);

  // Si viene con parámetro en la URL y estamos en modo detalle, abrir el modal
  useEffect(() => {
    if (audioParam && viewMode === "detail" && selectedAudioId) {
      setDetailModalOpen(true);
    }
  }, [audioParam, viewMode, selectedAudioId]);

  useEffect(() => {
    if (!selectedAudioId || !accountId || !user) {
      setChatHistory([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("call_chat_messages")
        .select("*")
        .eq("audio_file_id", selectedAudioId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data)
        setChatHistory(
          data.map((m) => ({
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            user_name: (m.metadata as { user_name?: string })?.user_name || "",
          })),
        );
    };
    load();
  }, [selectedAudioId, accountId, user?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const selectedTranscription = transcriptions?.find((t) => (t.audio_files as { id?: string })?.id === selectedAudioId);
  const audioFile = selectedTranscription?.audio_files as Record<string, unknown> | undefined;

  const { data: segments } = useQuery({
    queryKey: ["segments", selectedTranscription?.id],
    queryFn: async () => {
      if (!selectedTranscription?.id) return [];
      const { data } = await supabase
        .from("transcription_segments")
        .select("*")
        .eq("transcription_id", selectedTranscription.id)
        .order("start_time");
      return data || [];
    },
    enabled: !!selectedTranscription?.id,
  });

  const { data: analysis } = useQuery({
    queryKey: ["analysis", selectedAudioId],
    queryFn: async () => {
      if (!selectedAudioId) return null;
      const { data } = await supabase
        .from("analyses")
        .select("*, prompts(name)")
        .eq("audio_file_id", selectedAudioId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAudioId,
  });

  const { data: callExtractions } = useQuery({
    queryKey: ["call-extractions", selectedAudioId],
    queryFn: async () => {
      if (!selectedAudioId) return [];
      const { data } = await supabase
        .from("call_extractions")
        .select("*, extraction_rules(name)")
        .eq("audio_file_id", selectedAudioId);
      return data || [];
    },
    enabled: !!selectedAudioId,
  });

  const { data: audioUrl } = useQuery({
    queryKey: ["audio-url", audioFile?.file_path],
    queryFn: async () => {
      if (!audioFile?.file_path) return null;
      const path = String(audioFile.file_path);
      const { data } = await supabase.storage.from("audio-files").createSignedUrl(path, 3600);
      if (data?.signedUrl) return data.signedUrl;
      if (accountId) {
        const { data: d2 } = await supabase.storage.from("audio-files").createSignedUrl(`${accountId}/${path}`, 3600);
        if (d2?.signedUrl) return d2.signedUrl;
      }
      return null;
    },
    enabled: !!audioFile?.file_path,
  });

  const parsedSegments = useMemo(() => {
    if (segments?.length) return null;
    const text = selectedTranscription?.full_text;
    if (!text) return null;
    const lines = text.split("\n").filter((l) => l.trim());
    const parsed: { speaker: string; time: string; text: string; startSeconds: number }[] = [];
    const SPEAKER_RX = /^(?:\[(\d+):(\d{2})\]\s*)?\[?(asesor|agente|cliente|agent|advisor|customer|representante)\]?\s*:\s*(.+)$/i;
    let runningSeconds = 0;
    for (const line of lines) {
      const match = line.match(SPEAKER_RX);
      if (!match) continue;
      const minutes = match[1] ? parseInt(match[1], 10) : null;
      const secs = match[2] ? parseInt(match[2], 10) : null;
      const rawSpeaker = match[3].toLowerCase();
      const speaker =
        rawSpeaker.includes("clien") || rawSpeaker.includes("custom") ? "Cliente" : "Asesor";
      const startSeconds = minutes !== null && secs !== null ? minutes * 60 + secs : runningSeconds;
      const mm = Math.floor(startSeconds / 60);
      const ss = startSeconds % 60;
      parsed.push({
        speaker,
        time: `${mm}:${ss.toString().padStart(2, "0")}`,
        text: match[4].trim(),
        startSeconds,
      });
      if (minutes === null) {
        const words = match[4].split(/\s+/).length;
        runningSeconds += Math.max(2, Math.round(words / 2.5));
      } else {
        runningSeconds = startSeconds;
      }
    }
    return parsed.length > 0 ? parsed : null;
  }, [segments, selectedTranscription?.full_text]);

  const displaySegments = useMemo(() => {
    if (segments?.length) {
      if (!searchTerm.trim()) return segments;
      return segments.filter((s) => s.text.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (parsedSegments) {
      if (!searchTerm.trim()) return parsedSegments;
      return parsedSegments.filter((s) => s.text.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return [];
  }, [segments, parsedSegments, searchTerm]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };
  const skip = (secs: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + secs);
  };
  const seekTo = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  };
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
  };
  const cycleSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleExport = async (fmt: ExportFormat) => {
    if (fmt === "txt" && selectedTranscription?.full_text) {
      const content = `Transcripción: ${audioFile?.file_name || "audio"}\nFecha: ${audioFile?.created_at ? format(new Date(String(audioFile.created_at)), "dd/MM/yyyy HH:mm") : ""}\nDuración: ${formatTime(Number(audioFile?.duration_seconds) || duration || 0)}\n\n${selectedTranscription.full_text}${analysis?.summary ? `\n\n--- ANÁLISIS ---\n${analysis.summary}` : ""}`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcripcion-${audioFile?.file_name || "audio"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Transcripción exportada");
      return;
    }
    if (!transcriptions?.length || !accountId) return;
    try {
      const { data: allAn } = await supabase.from("analyses").select("*").eq("account_id", accountId);
      const anMap = new Map((allAn || []).map((a) => [a.audio_file_id, a]));

      const { data: rulesData } = await supabase
        .from("extraction_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      const audioIds = transcriptions.map((t) => (t.audio_files as { id?: string })?.id).filter(Boolean) as string[];
      const { data: extractionsData } = await supabase.from("call_extractions").select("*").in("audio_file_id", audioIds);

      const extractMap = new Map<string, Map<string, string>>();
      if (extractionsData) {
        extractionsData.forEach((e) => {
          if (!extractMap.has(e.audio_file_id)) extractMap.set(e.audio_file_id, new Map());
          extractMap.get(e.audio_file_id)!.set(e.rule_id, e.extracted_value);
        });
      }

      const rules = rulesData || [];
      const dynamicHeaders = rules.map((r) => r.name);

      const header = [
        "Archivo",
        "Fecha",
        "Duración (s)",
        "Agente (JSON)",
        "Campaña (JSON)",
        "Teléfono",
        "Cliente",
        "Tipificación",
        "Es Objetivo",
        "Adeudo",
        "Ciudad",
        "Estado",
        "Dirección",
        "CP",
        "Nivel Atención",
        "Intentos",
        "Estado",
        "Prompt",
        "Sentimiento",
        "Score (%)",
        "Resumen",
        "Análisis (Prompt)",
        "Puntos Positivos",
        "Puntos Negativos",
        "Oportunidades",
        "Insights",
        "Recomendaciones",
        "Conclusiones",
        "Tags",
        ...dynamicHeaders,
      ];

      const rows = transcriptions.map((t) => {
        const af = t.audio_files as {
          id?: string;
          file_name?: string;
          created_at?: string;
          duration_seconds?: number;
          status?: string;
          metadata?: any;
        };
        const metadata = (af?.metadata || {}) as Record<string, any>;
        const an = anMap.get(af?.id || "");
        const results = (an?.results as Record<string, unknown>) || {};
        const positiveList = Array.isArray(results.positive) ? (results.positive as string[]).join("; ") : "";
        const negativeList = Array.isArray(results.negative) ? (results.negative as string[]).join("; ") : "";
        const opportunitiesList = Array.isArray(results.opportunities)
          ? (results.opportunities as string[]).join("; ")
          : "";

        const dynamicValues = rules.map((r) => {
          const ruleUpper = r.name.toUpperCase();
          let val = extractMap.get(af?.id || "")?.get(r.id);

          if (ruleUpper.includes("ASESOR") && metadata.agent) {
            val = String(metadata.agent).replace(/@.*$/, "").trim();
          }
          if ((ruleUpper.includes("CAMPAÑA") || ruleUpper.includes("CAMPANA")) && metadata.campaign) {
            val = String(metadata.campaign);
          }
          if (ruleUpper.includes("FECHA") && metadata.start_time) {
            const rawDate = String(metadata.start_time);
            val = rawDate.includes(" ") ? rawDate.split(" ")[0] : (rawDate.includes("T") ? rawDate.split("T")[0] : rawDate);
          }
          
          return val || "";
        });

        return [
          af?.file_name || "",
          metadata.start_time ? (String(metadata.start_time).includes(" ") ? String(metadata.start_time).split(" ")[0] : (String(metadata.start_time).includes("T") ? String(metadata.start_time).split("T")[0] : String(metadata.start_time))) : (af?.created_at ? format(new Date(af.created_at), "dd/MM/yyyy HH:mm") : ""),
          af?.duration_seconds || 0,
          metadata.agent ? String(metadata.agent).replace(/@.*$/, "").trim() : "",
          metadata.campaign || "",
          metadata.phone || "",
          metadata.contact_name || "",
          metadata.disposition || "",
          metadata.disposition_is_goal ? "SÍ" : "NO",
          metadata.adeudo || "",
          metadata.ciudad || "",
          metadata.estado || "",
          metadata.direccion || "",
          metadata.cp || "",
          metadata.attention_level || "",
          metadata.retries || "",
          af?.status || "",
          (an as any)?.prompts?.name || "",
          an?.overall_sentiment || "",
          an?.sentiment_score != null ? Number((Number(an.sentiment_score) * 100).toFixed(0)) : "",
          an?.summary || "",
          typeof results.analysis === "string" ? results.analysis : "",
          positiveList,
          negativeList,
          opportunitiesList,
          typeof results.insights === "string" ? results.insights : "",
          typeof results.recommendations === "string" ? results.recommendations : "",
          typeof results.conclusions === "string" ? results.conclusions : "",
          ((an?.tags as string[]) || []).join(", "),
          ...dynamicValues,
        ];
      });

      const dateSuffix = format(new Date(), "yyyy-MM-dd");

      if (fmt === "xlsx") {
        const wsData = [header, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        const colWidths = header.map((h, colIdx) => {
          const maxLen = Math.max(h.length, ...rows.map((r) => String(r[colIdx] ?? "").length));
          return { wch: Math.min(maxLen + 4, 60) };
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Llamadas");
        XLSX.writeFile(wb, `llamadas-detalle-${dateSuffix}.xlsx`);
        toast.success("Archivo Excel exportado correctamente");
      } else {
        const csvContent =
          "\uFEFF" +
          [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `llamadas-detalle-${dateSuffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Archivo CSV exportado correctamente");
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Error al exportar. Intenta de nuevo.");
    }
  };

  const saveCallMessage = async (role: string, content: string) => {
    if (!accountId || !user || !selectedAudioId) return;
    await supabase.from("call_chat_messages").insert({
      account_id: accountId,
      audio_file_id: selectedAudioId,
      user_id: user.id,
      role,
      content,
      metadata: { user_name: profile?.full_name || user.email || "" },
    });
  };

  const sendChat = async () => {
    if (!chatMsg.trim() || chatLoading || !selectedAudioId || !accountId) return;
    if (!canChat) {
      toast.error("Límite de consultas IA alcanzado", {
        description: `Has consumido ${queriesUsed} de ${maxQueries} consultas este mes.`,
        duration: 8000,
      });
      return;
    }
    const msg = chatMsg.trim();
    setChatMsg("");
    const userEntry = {
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
      user_name: profile?.full_name || user?.email || "",
    };
    const newHistory = [...chatHistory, userEntry];
    setChatHistory(newHistory);
    await saveCallMessage("user", msg);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: msg,
          context: { isCallSpecific: true, audioFileId: selectedAudioId },
          accountId,
          history: newHistory.slice(-10),
        },
      });
      if (error) throw error;
      const response = data?.response || "Sin respuesta";
      setChatHistory([...newHistory, { role: "assistant", content: response, created_at: new Date().toISOString() }]);
      await saveCallMessage("assistant", response);
    } catch {
      setChatHistory([
        ...newHistory,
        { role: "assistant", content: "Error al consultar. Intenta de nuevo.", created_at: new Date().toISOString() },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
    if (sentiment === "positive") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (sentiment === "negative") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const getSentimentColor = (sentiment?: string) => {
    if (sentiment === "positive") return "border-l-emerald-500 bg-emerald-500/5";
    if (sentiment === "negative") return "border-l-red-500 bg-red-500/5";
    return "border-l-border bg-transparent";
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse mt-3">Cargando transcripciones...</p>
      </div>
    );
  }

  if (!transcriptions?.length) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
          <FileAudio className="w-10 h-10 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Aún no hay transcripciones</h2>
          <p className="text-sm text-muted-foreground">Sube y procesa archivos en Gestión de Grabaciones.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/biblioteca")}>
          <FileAudio className="w-4 h-4 mr-2" />
          Ir a Gestión de Grabaciones
        </Button>
      </div>
    );
  }

  const hasSegmentView = displaySegments.length > 0;
  const showPlainText = !hasSegmentView && !!selectedTranscription?.full_text;

  return (
    <div className="flex flex-col flex-1 min-h-0 animate-fade-in">
      <TranscriptsPageHeader
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        isSavingPreference={isSavingPreference}
      />

      {viewMode === "classic" ? (
        /* ================= VISTA CLÁSICA (Preservada al 100%) ================= */
        <>
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />
          )}

          {isMobile && (
            <div className="flex flex-shrink-0 border-b border-border bg-card">
              <button
                type="button"
                className={cn(
                  "flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors",
                  activeTab === "list" ? "border-accent text-accent" : "border-transparent text-muted-foreground",
                )}
                onClick={() => setActiveTab("list")}
              >
                Llamadas
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors",
                  activeTab === "detail" ? "border-accent text-accent" : "border-transparent text-muted-foreground",
                )}
                onClick={() => setActiveTab("detail")}
              >
                Detalle
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors",
                  activeTab === "insights" ? "border-accent text-accent" : "border-transparent text-muted-foreground",
                )}
                onClick={() => setActiveTab("insights")}
              >
                Insights
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 pb-24 w-full overflow-hidden">
            <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="h-full">
              <ResizablePanel
                defaultSize={32}
                minSize={24}
                maxSize={40}
                className={cn(
                  "flex flex-col min-h-0 md:min-w-[280px]",
                  isMobile && activeTab !== "list" && "hidden",
                )}
              >
                <TranscriptCallListPanel
                  filteredTranscriptions={filteredTranscriptions}
                  totalCount={totalCount}
                  selectedAudioId={selectedAudioId}
                  onSelectCall={(id) => {
                    setSelectedAudioId(id);
                    setChatHistory([]);
                    setIsPlaying(false);
                  }}
                  callSearchTerm={callSearchTerm}
                  setCallSearchTerm={(v) => { setCallSearchTerm(v); setCurrentPage(1); }}
                  sortOrder={sortOrder}
                  setSortOrder={(v) => { setSortOrder(v); setCurrentPage(1); }}
                  sentimentFilter={sentimentFilter}
                  setSentimentFilter={(v) => { setSentimentFilter(v); setCurrentPage(1); }}
                  showFilters={showFilters}
                  setShowFilters={setShowFilters}
                  onOpenExport={() => setExportDialogOpen(true)}
                  analysisMap={analysisMap as Map<string, { overall_sentiment?: string; tags?: string[] } | undefined>}
                  formatTime={formatTime}
                  getSentimentColor={getSentimentColor}
                  getSentimentIcon={getSentimentIcon}
                  currentPage={currentPage}
                  totalPages={Math.ceil(totalCount / pageSize)}
                  onPageChange={setCurrentPage}
                />
              </ResizablePanel>

              <ResizableHandle withHandle className={cn(isMobile && "hidden")} />

              <ResizablePanel
                defaultSize={68}
                minSize={50}
                className={cn("flex flex-col min-h-0", isMobile && activeTab === "list" && "hidden")}
              >
                {selectedTranscription ? (
                  <div className="flex flex-col h-full min-h-0">
                    <TranscriptDetailWorkspace
                      audioFile={audioFile}
                      selectedTranscription={selectedTranscription}
                      analysis={analysis as Record<string, unknown> | null | undefined}
                      callExtractions={callExtractions || []}
                      duration={duration}
                      chatOpen={chatOpen}
                      setChatOpen={setChatOpen}
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      displaySegments={displaySegments}
                      hasSegmentView={hasSegmentView}
                      showPlainText={showPlainText}
                      seekTo={seekTo}
                      formatTime={formatTime}
                      getSentimentIcon={getSentimentIcon}
                      isMobile={isMobile}
                      activeTab={activeTab}
                      chatHistory={chatHistory}
                      chatMsg={chatMsg}
                      setChatMsg={setChatMsg}
                      sendChat={sendChat}
                      chatLoading={chatLoading}
                      chatBottomRef={chatBottomRef}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
                    <Phone className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Selecciona una llamada de la lista para ver su transcripción.</p>
                  </div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          <TranscriptAudioFooter
            audioUrl={audioUrl}
            audioRef={audioRef}
            isPlaying={isPlaying}
            togglePlay={togglePlay}
            skip={skip}
            fileName={audioFile?.file_name as string | undefined}
            currentTime={currentTime}
            duration={duration}
            fileDurationSeconds={Number(audioFile?.duration_seconds) || undefined}
            formatTime={formatTime}
            volume={volume}
            setVolume={setVolume}
            handleProgressClick={handleProgressClick}
            playbackRate={playbackRate}
            cycleSpeed={cycleSpeed}
          />
        </>
      ) : (
        /* ================= VISTA DETALLE (Explorador + Modal) ================= */
        <div className="flex-1 min-h-0 flex flex-col">
          <TranscriptExplorerList
            transcriptions={filteredTranscriptions}
            totalCount={totalCount}
            isLoading={isLoading}
            onSelectCall={(id) => {
              setSelectedAudioId(id);
              setDetailModalOpen(true);
            }}
            searchTerm={callSearchTerm}
            setSearchTerm={(v) => {
              setCallSearchTerm(v);
              setCurrentPage(1);
            }}
            sortOrder={sortOrder}
            setSortOrder={(v) => {
              setSortOrder(v);
              setCurrentPage(1);
            }}
            sentimentFilter={sentimentFilter}
            setSentimentFilter={(v) => {
              setSentimentFilter(v);
              setCurrentPage(1);
            }}
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / pageSize)}
            onPageChange={setCurrentPage}
            analysisMap={analysisMap as Map<string, { overall_sentiment?: string; tags?: string[]; sentiment_score?: number } | undefined>}
            onOpenExport={() => setExportDialogOpen(true)}
            formatTime={formatTime}
          />

          <TranscriptDetailModal
            open={detailModalOpen}
            onOpenChange={setDetailModalOpen}
            selectedAudioId={selectedAudioId}
            onSelectAudioId={(id) => {
              setSelectedAudioId(id);
            }}
            allTranscriptions={transcriptions as any[]}
          />
        </div>
      )}

      <ExportFormatDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Export transcripts"
      />
    </div>
  );
}

