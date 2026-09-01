import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Send, Bot, User, Trash2, Sparkles, Clock, AlertTriangle,
  Database, TrendingUp, MessageSquare, BarChart3, Target, Award, CheckCircle2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useAccountLimits } from "@/hooks/useAccountLimits";
import { useIsSuperadmin } from "@/hooks/useIsSuperadmin";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  user_name?: string;
  metadata?: {
    query_type?: string;
    stats?: { total_calls?: number; total_duration_seconds?: number };
    error?: boolean;
  };
}

export default function ConsultaIAPage() {
  const { currentAccount } = useAccount();
  const { user, profile } = useAuth();
  const accountId = currentAccount?.account_id;
  const { canChat, queriesUsed, maxQueries } = useAccountLimits();
  const isSuperadmin = useIsSuperadmin();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history from DB
  useEffect(() => {
    if (!accountId || !user) return;
    const loadHistory = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) {
        setMessages(data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          created_at: m.created_at,
          user_name: m.role === "user" ? (profile?.full_name || user.email || "") : undefined,
        })));
      }
      setHistoryLoaded(true);
    };
    loadHistory();
  }, [accountId, user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  const suggestions = [
    { icon: BarChart3, text: "Compara volumen, duración y distribución entre Llamadas y WhatsApp este mes" },
    { icon: TrendingUp, text: "Sentimiento general de clientes: ¿en qué canal o temas se detecta mayor fricción?" },
    { icon: MessageSquare, text: "Top 5 motivos de contacto más frecuentes y cómo se distribuyen por canal" },
    { icon: Target, text: "Efectividad operativa: ¿cuáles son los motivos con mejor y peor tasa de resolución?" },
    { icon: Award, text: "Ranking de asesores por score de calidad y mejores prácticas identificadas" },
    { icon: Sparkles, text: "Resumen ejecutivo integral: hallazgos clave, alertas y recomendaciones del periodo" },
  ];

  const saveMessage = async (role: "user" | "assistant", content: string) => {
    if (!accountId || !user) return;
    await supabase.from("chat_messages").insert({
      account_id: accountId,
      user_id: user.id,
      role,
      content,
      metadata: { user_name: profile?.full_name || user.email || "" },
    });
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading || !accountId || !user) return;

    if (!canChat) {
      toast.error("Límite de consultas IA alcanzado", {
        description: `Has consumido ${queriesUsed} de ${maxQueries} consultas este mes. Solicita ampliación al administrador.`,
        duration: 8000,
      });
      return;
    }

    setInput("");

    const userMsg: ChatMessage = {
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
      user_name: profile?.full_name || user.email || "",
    };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    await saveMessage("user", msg);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("general-chat", {
        body: {
          message: msg,
          accountId,
          chatHistory: newMsgs.slice(-8).map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        throw new Error(error.message || "Error al conectar con el asistente");
      }

      if (data?.error) {
        throw new Error(data.details || data.error);
      }

      const response = data?.response || "Sin respuesta del asistente";
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response,
        created_at: new Date().toISOString(),
        metadata: data?.metadata,
      };
      setMessages([...newMsgs, assistantMsg]);
      await saveMessage("assistant", response);

    } catch (err: any) {
      console.error("Chat error:", err);
      const errorContent = `Lo siento, ocurrió un error al procesar tu consulta. ${
        err?.message ? `Detalle: ${err.message}` : "Por favor intenta de nuevo."
      }`;
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: errorContent,
        created_at: new Date().toISOString(),
        metadata: { error: true },
      };
      setMessages([...newMsgs, errorMsg]);
      toast.error("Error en la consulta. Revisa la consola para más detalles.");
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!accountId || !user) return;
    if (!isSuperadmin) {
      toast.error("Solo Superadmin puede limpiar el historial. El consumo registrado se mantiene.");
      return;
    }
    await supabase.from("chat_messages").delete().eq("account_id", accountId).eq("user_id", user.id);
    setMessages([]);
    toast.success("Historial limpiado (el consumo no se descuenta)");
  };

  // Render message content with basic markdown-like formatting
  const renderContent = (content: string) => {
    // Split by double newline for paragraphs, single for line breaks
    return content.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return <p key={i} className="pl-3 before:content-['•'] before:mr-2">{line.slice(2)}</p>;
      }
      if (line.trim() === "") return <br key={i} />;
      // Handle inline bold **text**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <p key={i}>
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        );
      }
      return <p key={i}>{line}</p>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-accent" /> AI Copilot
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pregunta sobre llamadas, WhatsApp y métricas de{" "}
            <span className="font-medium text-foreground">{currentAccount?.account.name}</span>
          </p>
        </div>
        {messages.length > 0 && isSuperadmin && (
          <Button variant="ghost" size="sm" onClick={clearHistory} title="Solo Superadmin. El consumo no se descuenta.">
            <Trash2 className="w-4 h-4 mr-1" /> Limpiar historial
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-4 mb-4">
        {messages.length === 0 && historyLoaded && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">AI Copilot</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Pregunta sobre tus llamadas, tendencias, sentimientos y más. El asistente
                tiene acceso a todos los datos de tu cuenta en tiempo real.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  className="text-left text-sm px-4 py-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <s.icon className="w-4 h-4 flex-shrink-0 text-accent/70" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id || i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                m.metadata?.error ? "bg-destructive/10" : "bg-accent/10"
              }`}>
                <Bot className={`w-4 h-4 ${m.metadata?.error ? "text-destructive" : "text-accent"}`} />
              </div>
            )}
            <div className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : m.metadata?.error
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-secondary text-foreground"
            }`}>
              {/* Content */}
              <div className="leading-relaxed space-y-0.5">
                {m.role === "assistant" ? renderContent(m.content) : <p>{m.content}</p>}
              </div>

              {/* Footer: name + time + stats badge */}
              <div className={`flex items-center gap-2 mt-2 text-[10px] flex-wrap ${
                m.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}>
                {m.user_name && m.role === "user" && <span>{m.user_name}</span>}
                {m.created_at && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                  </span>
                )}
                {m.metadata?.stats?.total_calls !== undefined && (
                  <span className="flex items-center gap-1 bg-accent/10 text-accent px-1.5 py-0.5 rounded-full text-[9px] font-medium">
                    <Database className="w-2.5 h-2.5" />
                    {m.metadata.stats.total_calls} llamadas analizadas
                  </span>
                )}
              </div>
            </div>
            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div className="bg-secondary rounded-xl px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.3s]" />
                <span className="text-[10px] text-muted-foreground ml-1">Consultando base de datos...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Limit warning */}
      {/* Input area */}
      <div className="flex gap-2">
        <Input
          placeholder="Escribe tu consulta..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          disabled={loading}
          className="text-sm"
        />
        <Button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
