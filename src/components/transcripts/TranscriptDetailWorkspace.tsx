import type { ReactNode, RefObject } from "react";
import { format } from "date-fns";
import { FileAudio, Search, MessageSquare, Mic, X, Calendar, Clock } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { highlightText } from "./highlightText";
import { TranscriptSegmentCard } from "./TranscriptSegmentCard";
import { TranscriptInsightsColumn } from "./TranscriptInsightsColumn";
import { TranscriptChatColumn, type ChatMessage } from "./TranscriptChatColumn";

interface TranscriptDetailWorkspaceProps {
  audioFile: Record<string, unknown> | null | undefined;
  selectedTranscription: { full_text?: string | null } | null | undefined;
  analysis: Record<string, unknown> | null | undefined;
  callExtractions: Array<{ id: string; extracted_value?: string; extraction_rules?: { name?: string } }>;
  duration: number;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  displaySegments: unknown[];
  hasSegmentView: boolean;
  showPlainText: boolean;
  seekTo: (time: number) => void;
  formatTime: (seconds: number) => string;
  getSentimentIcon: (sentiment?: string) => ReactNode;
  isMobile: boolean;
  activeTab: "list" | "detail" | "insights";
  chatHistory: ChatMessage[];
  chatMsg: string;
  setChatMsg: (v: string) => void;
  sendChat: () => void;
  chatLoading: boolean;
  chatBottomRef: RefObject<HTMLDivElement | null>;
}

export function TranscriptDetailWorkspace({
  audioFile,
  selectedTranscription,
  analysis,
  callExtractions,
  duration,
  chatOpen,
  setChatOpen,
  searchTerm,
  setSearchTerm,
  displaySegments,
  hasSegmentView,
  showPlainText,
  seekTo,
  formatTime,
  getSentimentIcon,
  isMobile,
  activeTab,
  chatHistory,
  chatMsg,
  setChatMsg,
  sendChat,
  chatLoading,
  chatBottomRef,
}: TranscriptDetailWorkspaceProps) {
  const results = (analysis?.results as Record<string, unknown>) || {};
  const overallSentiment = analysis?.overall_sentiment as string | undefined;

  return (
    <>
      <div className="flex-shrink-0 px-6 py-5 border-b border-border space-y-4 bg-card/30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-accent/15 flex items-center justify-center flex-shrink-0">
                <FileAudio className="w-4 h-4 text-accent" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                {String(audioFile?.file_name ?? "")}
              </h2>
            </div>
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm text-muted-foreground pl-0 sm:pl-10">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                {audioFile?.created_at
                  ? format(new Date(audioFile.created_at as string), "dd MMM yyyy · HH:mm")
                  : "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 flex-shrink-0" />
                {formatTime(Number(audioFile?.duration_seconds) || duration || 0)}
              </span>
              {overallSentiment && (
                <span
                  className={cn(
                    "flex items-center gap-1.5 font-medium",
                    overallSentiment === "positive"
                      ? "text-emerald-400"
                      : overallSentiment === "negative"
                        ? "text-red-400"
                        : "text-muted-foreground",
                  )}
                >
                  {getSentimentIcon(overallSentiment)}
                  {overallSentiment === "positive"
                    ? "Positivo"
                    : overallSentiment === "negative"
                      ? "Negativo"
                      : "Neutral"}
                </span>
              )}
              {analysis?.sentiment_score != null && (
                <span className="text-xs bg-secondary px-2.5 py-1 rounded-full text-muted-foreground font-mono">
                  Score: {(Number(analysis.sentiment_score) * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {callExtractions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pl-0 sm:pl-10">
                {callExtractions.map((ext) => (
                  <Badge
                    key={ext.id}
                    variant="secondary"
                    className="text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 border-accent/20"
                  >
                    {ext.extraction_rules?.name}: {ext.extracted_value}
                  </Badge>
                ))}
              </div>
            )}

            {/* Nueva sección de Datos de la Llamada (del JSON) */}
            {audioFile?.metadata && ((audioFile.metadata as any).remote_id || (audioFile.metadata as any).source === "sftp_ftp") && (
              <div className="flex flex-wrap gap-2 mt-4 pl-0 sm:pl-10">
                <div className="w-full text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Datos de Importación (JSON)
                </div>
                {(audioFile.metadata as any).agent && (
                  <Badge variant="outline" className="bg-blue-500/5 text-blue-400 border-blue-500/20">
                    Agente: {(audioFile.metadata as any).agent}
                  </Badge>
                )}
                {(audioFile.metadata as any).campaign && (
                  <Badge variant="outline" className="bg-purple-500/5 text-purple-400 border-purple-500/20">
                    Campaña: {(audioFile.metadata as any).campaign}
                  </Badge>
                )}
                {(audioFile.metadata as any).phone && (
                  <Badge variant="outline" className="bg-amber-500/5 text-amber-400 border-amber-500/20">
                    Tel: {(audioFile.metadata as any).phone}
                  </Badge>
                )}
                {(audioFile.metadata as any).disposition && (
                  <Badge variant="outline" className="bg-emerald-500/5 text-emerald-400 border-emerald-500/20">
                    Resultado: {(audioFile.metadata as any).disposition}
                  </Badge>
                )}
                {(audioFile.metadata as any).start_time && (
                  <Badge variant="outline" className="bg-cyan-500/5 text-cyan-400 border-cyan-500/20">
                    Fecha: {String((audioFile.metadata as any).start_time).slice(0, 19)}
                  </Badge>
                )}
                {(audioFile.metadata as any).contact_name && (
                  <Badge variant="outline" className="bg-pink-500/5 text-pink-400 border-pink-500/20">
                    Contacto: {(audioFile.metadata as any).contact_name}
                  </Badge>
                )}
                {(audioFile.metadata as any).initiative && (
                  <Badge variant="outline" className="bg-orange-500/5 text-orange-400 border-orange-500/20">
                    Iniciativa: {(audioFile.metadata as any).initiative}
                  </Badge>
                )}
                {(audioFile.metadata as any).attention_level && (
                  <Badge variant="outline" className="bg-teal-500/5 text-teal-400 border-teal-500/20">
                    Atención: {(audioFile.metadata as any).attention_level}
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const raw = (audioFile.metadata as any).json_raw;
                    if (raw) {
                      const win = window.open("", "_blank");
                      win?.document.write(`<pre style="font-family:monospace;font-size:12px;padding:16px">${JSON.stringify(raw, null, 2)}</pre>`);
                    } else {
                      alert("No hay JSON original disponible para esta grabación");
                    }
                  }}
                >
                  Ver JSON Completo
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant={chatOpen ? "default" : "outline"}
              size="sm"
              className="h-9 text-sm"
              onClick={() => setChatOpen(!chatOpen)}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Consultar IA
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-10 h-9 text-sm bg-background"
            placeholder="Buscar palabras en la transcripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{displaySegments.length} resultados</span>
              <button type="button" onClick={() => setSearchTerm("")} className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full">
        <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="h-full">
          <ResizablePanel
            defaultSize={chatOpen ? 40 : 55}
            minSize={25}
            className={cn(isMobile && activeTab !== "detail" && "hidden")}
          >
            <div className="h-full flex flex-col min-h-0">
              <div className="px-5 py-3 border-b border-border bg-card/50 flex items-center gap-2 flex-shrink-0">
                <Mic className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">Transcripción</h3>
                <span className="text-xs text-muted-foreground ml-auto">{displaySegments.length} segmentos</span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-5 space-y-4">
                  {showPlainText && selectedTranscription?.full_text ? (
                    <div className="bg-card rounded-xl border border-border p-5">
                      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {searchTerm
                          ? highlightText(selectedTranscription.full_text, searchTerm)
                          : selectedTranscription.full_text}
                      </p>
                    </div>
                  ) : hasSegmentView ? (
                    displaySegments.map((seg, idx) => (
                      <div
                        key={
                          typeof seg === "object" && seg !== null && "id" in seg
                            ? String((seg as { id: string }).id)
                            : idx
                        }
                      >
                        <TranscriptSegmentCard
                          seg={seg as never}
                          searchTerm={searchTerm}
                          seekTo={seekTo}
                          formatTime={formatTime}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="bg-card rounded-xl border border-border p-12 text-center">
                      <FileAudio className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No hay transcripción disponible.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className={cn(isMobile && "hidden")} />

          <ResizablePanel
            defaultSize={chatOpen ? 30 : 45}
            minSize={20}
            className={cn("min-h-0", isMobile && activeTab !== "insights" && "hidden")}
          >
            <TranscriptInsightsColumn analysis={analysis} results={results} getSentimentIcon={getSentimentIcon} />
          </ResizablePanel>

          {chatOpen && (
            <>
              <ResizableHandle withHandle className={cn(isMobile && "hidden")} />
              <ResizablePanel
                defaultSize={30}
                minSize={22}
                className={cn(isMobile && activeTab === "list" && "hidden")}
              >
                <TranscriptChatColumn
                  onClose={() => setChatOpen(false)}
                  chatHistory={chatHistory}
                  chatMsg={chatMsg}
                  setChatMsg={setChatMsg}
                  sendChat={sendChat}
                  chatLoading={chatLoading}
                  chatBottomRef={chatBottomRef}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </>
  );
}
