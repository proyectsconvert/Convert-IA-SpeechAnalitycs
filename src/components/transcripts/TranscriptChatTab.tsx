import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Play,
  Bot,
  User,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  created_at?: string;
  user_name?: string;
}

interface TranscriptChatTabProps {
  audioFileId: string | null | undefined;
  onSeek: (seconds: number) => void;
  formatTime: (seconds: number) => string;
}

const QUICK_QUESTIONS = [
  "¿Cuál fue la principal objeción del cliente?",
  "¿Qué pudo hacer mejor el asesor?",
  "¿El cliente mostró intención de compra?",
  "¿Qué productos o servicios se mencionaron?",
  "Resume los momentos clave de la llamada.",
  "Dame 3 oportunidades de mejora para el asesor.",
  "¿En qué momento se habló de precio o pagos?",
  "¿Por qué se cerró o no la llamada de forma exitosa?",
];

export function TranscriptChatTab({
  audioFileId,
  onSeek,
  formatTime,
}: TranscriptChatTabProps) {
  const { user, profile } = useAuth();
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const { canChat, queriesUsed, maxQueries } = useAccountLimits();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar historial de chat existente
  useEffect(() => {
    if (!audioFileId || !accountId) {
      setMessages([]);
      setInitialLoading(false);
      return;
    }

    let isMounted = true;
    async function loadChat() {
      try {
        const { data, error } = await supabase
          .from("call_chat_messages")
          .select("*")
          .eq("audio_file_id", audioFileId)
          .eq("account_id", accountId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (!error && data && isMounted) {
          setMessages(
            data.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              created_at: m.created_at,
              user_name: (m.metadata as { user_name?: string })?.user_name || "",
            }))
          );
        }
      } catch (err) {
        console.warn("Error cargando mensajes de chat:", err);
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }

    loadChat();
    return () => {
      isMounted = false;
    };
  }, [audioFileId, accountId]);

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveMessage = async (role: string, content: string) => {
    if (!accountId || !user || !audioFileId) return;
    try {
      await supabase.from("call_chat_messages").insert({
        account_id: accountId,
        audio_file_id: audioFileId,
        user_id: user.id,
        role,
        content,
        metadata: { user_name: profile?.full_name || user.email || "" },
      });
    } catch (err) {
      console.warn("Error guardando mensaje en BD:", err);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend ?? inputMsg).trim();
    if (!message || loading || !audioFileId || !accountId) return;

    if (!canChat) {
      toast.error("Límite de consultas IA alcanzado", {
        description: `Has consumido ${queriesUsed} de ${maxQueries} consultas este mes.`,
        duration: 8000,
      });
      return;
    }

    setInputMsg("");
    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
      user_name: profile?.full_name || user?.email || "",
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await saveMessage("user", message);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message,
          context: { isCallSpecific: true, audioFileId },
          accountId,
          history: newHistory.slice(-10),
        },
      });

      if (error) throw error;
      const response = data?.response || "Sin respuesta";

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response,
        created_at: new Date().toISOString(),
      };

      setMessages([...newHistory, assistantMsg]);
      await saveMessage("assistant", response);
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Ocurrió un error al procesar la consulta sobre esta llamada. Por favor intenta de nuevo.",
        created_at: new Date().toISOString(),
      };
      setMessages([...newHistory, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Renderizar texto con detección de timestamps clicables
  const renderMessageContent = (content: string) => {
    // Regex para detectar patrones de timestamp como "[01:25]", "01:25", "minuto 02:15", "momento 00:45"
    const TS_REGEX = /(?:(?:minuto|momento|segundo)?\s*(?:\[|\(|\b))(\d{1,2}:\d{2})(?:\]|\)|\b)/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TS_REGEX.exec(content)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(content.substring(lastIndex, matchIndex));
      }

      const timeStr = match[1];
      const [m, s] = timeStr.split(":").map((v) => parseInt(v, 10));
      const totalSeconds = m * 60 + s;

      parts.push(
        <button
          key={`${matchIndex}-${timeStr}`}
          type="button"
          onClick={() => onSeek(totalSeconds)}
          className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-accent/15 text-accent hover:bg-accent/25 font-mono text-xs font-bold transition-colors align-middle"
          title={`Reproducir en ${timeStr}`}
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Ver momento {timeStr}</span>
        </button>
      );

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background/50">
      {/* Mensajes */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-accent mb-2" />
              <p className="text-xs text-muted-foreground">Cargando chat de la llamada...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-6 pt-4">
              {/* Bienvenida y sugerencias */}
              <div className="bg-card/70 border border-border rounded-2xl p-6 text-center shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto text-accent mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  Consultas Inteligentes sobre esta Llamada
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Pregunta cualquier duda sobre la conversación, desempeño del asesor, acuerdos, objeciones o productos mencionados.
                </p>
              </div>

              {/* Preguntas Rápidas */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Preguntas Rápidas Sugeridas
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {QUICK_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(q)}
                      disabled={loading}
                      className="text-left p-3 rounded-xl border border-border/80 bg-card/60 hover:bg-accent/10 hover:border-accent/30 text-xs font-medium text-foreground/90 transition-all duration-150 flex items-center justify-between group shadow-sm"
                    >
                      <span className="line-clamp-2">{q}</span>
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-3",
                      isUser ? "justify-end" : "justify-start"
                    )}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-1 shadow-sm",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card/90 border border-border text-foreground rounded-tl-sm"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 mb-1">
                        <span className="font-semibold">
                          {isUser ? (m.user_name || "Tú") : "ConvertIA Assistant"}
                        </span>
                        {m.created_at && (
                          <span>
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      <div className="text-xs leading-relaxed whitespace-pre-wrap">
                        {isUser ? m.content : renderMessageContent(m.content)}
                      </div>
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4 text-xs flex items-center gap-2 text-muted-foreground shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    <span>Analizando llamada...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Bar */}
      <div className="p-4 border-t border-border bg-card/80 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="max-w-4xl mx-auto flex items-end gap-2"
        >
          <Textarea
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Pregunta algo sobre esta llamada... (Enter para enviar)"
            className="min-h-[42px] max-h-32 text-xs resize-none bg-background py-2.5 rounded-xl border-border shadow-inner"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !inputMsg.trim()}
            className="h-[42px] w-[42px] rounded-xl flex-shrink-0 bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
