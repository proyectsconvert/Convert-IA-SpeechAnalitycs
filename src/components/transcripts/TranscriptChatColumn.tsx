import { format } from "date-fns";
import { MessageSquare, Send, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ChatMessage {
  role: string;
  content: string;
  created_at?: string;
  user_name?: string;
}

interface TranscriptChatColumnProps {
  onClose: () => void;
  chatHistory: ChatMessage[];
  chatMsg: string;
  setChatMsg: (v: string) => void;
  sendChat: () => void;
  chatLoading: boolean;
  chatBottomRef: RefObject<HTMLDivElement | null>;
}

export function TranscriptChatColumn({
  onClose,
  chatHistory,
  chatMsg,
  setChatMsg,
  sendChat,
  chatLoading,
  chatBottomRef,
}: TranscriptChatColumnProps) {
  return (
    <div className="h-full flex flex-col bg-card/60 min-h-0">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Consultar IA</h3>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {chatHistory.length === 0 && (
            <div className="py-10 text-center">
              <MessageSquare className="w-9 h-9 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Pregunta cualquier cosa sobre esta llamada.</p>
              <div className="mt-4 space-y-2 max-w-sm mx-auto">
                {["¿Cuál fue el tema principal?", "¿El cliente quedó satisfecho?", "¿Qué compromisos se tomaron?"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setChatMsg(q)}
                    className="block w-full text-left text-sm text-accent/80 hover:text-accent bg-accent/5 hover:bg-accent/10 px-4 py-2 rounded-lg transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatHistory.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-xl px-4 py-2.5 text-sm ${
                  m.role === "user" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                }`}
              >
                {m.user_name && m.role === "user" && (
                  <p className="text-xs opacity-70 mb-1 font-semibold">{m.user_name}</p>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.created_at && <p className="text-xs opacity-50 mt-1.5">{format(new Date(m.created_at), "HH:mm")}</p>}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-xl px-4 py-3">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Pregunta sobre la llamada..."
            value={chatMsg}
            onChange={(e) => setChatMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
            className="text-sm h-10 bg-background"
          />
          <Button size="icon" className="h-10 w-10 flex-shrink-0" onClick={sendChat} disabled={chatLoading || !chatMsg.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
