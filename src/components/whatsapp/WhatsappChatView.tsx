import React, { useState } from "react";
import { format } from "date-fns";
import { WhatsappMessage } from "@/utils/whatsappParser";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { User, UserCheck, Mic, Search, X, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSameDay, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

interface WhatsappChatViewProps {
  messages: WhatsappMessage[];
  contactName: string;
}

export function WhatsappChatView({ messages, contactName }: WhatsappChatViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const filteredMessages = messages.filter(msg => 
    msg.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.agent_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, "gi"));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
          ) : part
        )}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#e5ddd5] dark:bg-slate-950 border rounded-xl overflow-hidden shadow-xl relative">
      {/* Chat Header */}
      <div className="bg-[#f0f2f5] dark:bg-slate-900 px-4 py-2 flex items-center border-b gap-3 z-10 shadow-sm">
        {!isSearchVisible ? (
          <>
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-200">
              <AvatarFallback className="bg-primary/10 text-primary">
                {contactName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground leading-tight truncate">{contactName}</h3>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-tight font-medium">En línea</span>
              </div>
            </div>
            <button 
              onClick={() => setIsSearchVisible(true)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <Search className="w-5 h-5 text-muted-foreground" />
            </button>
          </>
        ) : (
          <div className="flex-1 flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
            <button onClick={() => { setIsSearchVisible(false); setSearchTerm(""); }} className="p-1">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                autoFocus
                placeholder="Buscar en la conversación..."
                className="pl-9 bg-white dark:bg-slate-800 border-none h-9 rounded-full shadow-inner ring-0 focus-visible:ring-1 focus-visible:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 md:p-6 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat opacity-95">
        <div className="flex flex-col gap-1 max-w-2xl mx-auto pb-10">
          {filteredMessages.length === 0 && (
            <div className="text-center py-20 text-muted-foreground/60 italic bg-white/40 dark:bg-black/20 rounded-lg backdrop-blur-sm">
              {searchTerm ? "No se encontraron coincidencias" : "No hay mensajes grabados en este hilo"}
            </div>
          )}
          
          {filteredMessages.map((msg, idx) => {
            const isAgent = msg.sender_type.toLowerCase() === "agente";
            const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null;
            const showDateHeader = !prevMsg || !isSameDay(new Date(msg.timestamp), new Date(prevMsg.timestamp));
            
            return (
              <React.Fragment key={msg.external_message_id || idx}>
                {showDateHeader && (
                  <div className="flex justify-center my-6 sticky top-2 z-10">
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm border border-slate-200/50">
                      {format(new Date(msg.timestamp), "d 'de' MMMM", { locale: es })}
                    </div>
                  </div>
                )}

                <div 
                  className={cn(
                    "flex w-full animate-in fade-in slide-in-from-bottom-1 duration-300",
                    isAgent ? "justify-end" : "justify-start",
                    !showDateHeader && "mt-1"
                  )}
                >
                  <div className={cn(
                    "flex items-end gap-2 max-w-[85%]",
                    isAgent ? "flex-row-reverse" : "flex-row"
                  )}>
                    {/* Bubble */}
                    <div className={cn(
                      "relative px-3 py-2 rounded-2xl text-[13px] shadow-sm",
                      isAgent 
                        ? "bg-[#dcf8c6] dark:bg-emerald-900 text-slate-900 dark:text-slate-100 rounded-tr-none ring-1 ring-emerald-200/20" 
                        : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-none ring-1 ring-slate-200/20"
                    )}>
                      {isAgent && (
                        <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1 uppercase tracking-tighter">
                          <UserCheck className="w-2.5 h-2.5" />
                          {msg.agent_name}
                        </div>
                      )}
                      
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.message_type === "Audio" ? (
                          <div className="flex items-center gap-2 italic text-muted-foreground py-1 bg-black/5 dark:bg-white/5 px-2 rounded-lg">
                            <Mic className="w-4 h-4 text-primary" /> Nota de voz
                          </div>
                        ) : msg.message_type === "Image" ? (
                          <div className="italic text-muted-foreground py-1 flex flex-col gap-2">
                             <div className="p-3 bg-black/10 dark:bg-white/10 rounded-lg flex items-center justify-center aspect-video w-48">
                                <span className="text-xs font-bold">📷 IMAGEN</span>
                             </div>
                             {msg.content !== "N/A" && <span className="text-xs">{msg.content}</span>}
                          </div>
                        ) : msg.message_type === "File" ? (
                          <div className="italic text-muted-foreground py-1 flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-lg border border-black/5">
                             <div className="p-2 bg-primary/10 rounded text-primary">
                                <CalendarIcon className="w-4 h-4" />
                             </div>
                             <div className="flex flex-col">
                                <span className="text-[11px] font-bold uppercase truncate max-w-[120px]">Archivo Adjunto</span>
                                {msg.content !== "N/A" && <span className="text-[9px] truncate max-w-[120px]">{msg.content}</span>}
                             </div>
                          </div>
                        ) : (
                          msg.content === "N/A" ? <span className="italic text-muted-foreground opacity-50">Sin contenido</span> : highlightText(msg.content, searchTerm)
                        )}
                      </div>
                      
                      <div className={cn(
                        "text-[9px] mt-1 flex items-center justify-end gap-1 font-medium",
                        isAgent ? "text-emerald-800/50 dark:text-emerald-300/50" : "text-muted-foreground"
                      )}>
                        {format(new Date(msg.timestamp), "HH:mm")}
                        {isAgent && <span className="text-primary font-black">✓✓</span>}
                      </div>

                      {/* Speech pointer tail */}
                      <div className={cn(
                        "absolute top-0 w-3 h-3",
                        isAgent 
                          ? "-right-1 bg-[#dcf8c6] dark:bg-emerald-900" 
                          : "-left-1 bg-white dark:bg-slate-800"
                      )} style={{ 
                        clipPath: isAgent 
                          ? "polygon(0 0, 0 100%, 100% 0)" 
                          : "polygon(100% 0, 100% 100%, 0 0)" 
                      }} />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
