import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Filter, MessageSquare, Brain, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, Play, Calendar, User, Hash, Zap, X, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DatePickerWithRange } from "@/components/whatsapp/DateRangePicker";
import { DateRange } from "react-day-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAccountLimits } from "@/hooks/useAccountLimits";

interface WhatsappAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'filter' | 'prompt' | 'processing';

export function WhatsappAnalysisModal({ open, onOpenChange, onSuccess }: WhatsappAnalysisModalProps) {
  const { currentAccount } = useAccount();
  const { canUploadWhatsapp, whatsappUsed, maxWhatsapp, whatsappRemaining } = useAccountLimits();
  const [step, setStep] = useState<Step>('filter');
  const [isLoading, setIsLoading] = useState(false);

  // Selection/Filtering State
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [minMessages, setMinMessages] = useState<string>("");
  const [maxMessages, setMaxMessages] = useState<string>("");
  const [minClientMsgs, setMinClientMsgs] = useState<string>("");
  const [maxClientMsgs, setMaxClientMsgs] = useState<string>("");

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);
  const [uniqueAgents, setUniqueAgents] = useState<string[]>([]);
  const [uniqueCampaigns, setUniqueCampaigns] = useState<string[]>([]);

  // Prompts State
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  // Processing State
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0 });
  const [processingDone, setProcessingDone] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && step === 'filter' && currentAccount) {
      fetchPrompts();
      fetchFilterOptions();
    }
  }, [open, step, currentAccount]);

  useEffect(() => {
    if (open && step === 'filter' && currentAccount) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        fetchNoAnalyzedConversations();
      }, 400);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [open, step, currentAccount, dateRange, typeFilter, agentFilter, campaignFilter, searchTerm, minMessages, maxMessages, minClientMsgs, maxClientMsgs]);

  // Smooth progress animation
  useEffect(() => {
    if (displayProgress < progress) {
      const timer = setTimeout(() => {
        setDisplayProgress(prev => Math.min(prev + 1, progress));
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [displayProgress, progress]);

  // Elapsed timer
  useEffect(() => {
    if (step === 'processing' && !processingDone) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [step, processingDone]);

  // Real-time progress subscription + fast polling
  useEffect(() => {
    if (!batchId) return;

    const pollProgress = async () => {
      try {
        const { data } = await supabase
          .from("whatsapp_analysis_batches")
          .select("*")
          .eq("id", batchId)
          .single();
        if (data) {
          const newCompleted = data.completed || 0;
          const newFailed = data.failed || 0;
          const total = data.total_conversations || 1;

          setStats({
            total,
            completed: newCompleted,
            failed: newFailed
          });

          const totalDone = newCompleted + newFailed;
          const newProgress = Math.round((totalDone / total) * 100);
          setProgress(newProgress);

          if (data.status === 'completed' || data.status === 'completed_with_errors' || data.status === 'failed') {
            setProcessingDone(true);
            setProgress(100);
            if (timerRef.current) clearInterval(timerRef.current);

            if (data.status === 'failed') {
              toast.error(`Análisis falló: ${newFailed} errores de ${total} conversaciones`);
            } else {
              toast.success(`Análisis finalizado: ${newCompleted} exitosos, ${newFailed} errores`);
            }
          }
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };

    // Poll every 1.5 seconds for faster feedback
    const interval = setInterval(pollProgress, 1500);
    pollProgress();

    // Realtime subscription
    const channel = supabase
      .channel(`batch-updates-${batchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_analysis_batches',
          filter: `id=eq.${batchId}`
        },
        (payload) => {
          const data = payload.new;
          const newCompleted = data.completed || 0;
          const newFailed = data.failed || 0;
          const total = data.total_conversations || 1;

          setStats({ total, completed: newCompleted, failed: newFailed });
          const totalDone = newCompleted + newFailed;
          setProgress(Math.round((totalDone / total) * 100));

          if (data.status === 'completed' || data.status === 'completed_with_errors' || data.status === 'failed') {
            setProcessingDone(true);
            setProgress(100);
            if (timerRef.current) clearInterval(timerRef.current);
            toast.success("Análisis completado");
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  const fetchFilterOptions = async () => {
    if (!currentAccount) return;
    try {
      // Fetch a sample of 2000 recent conversations to extract unique filter values
      // This is much faster than fetching all records
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("first_agent_name, campaign")
        .eq("account_id", currentAccount.account_id)
        .order("start_date", { ascending: false })
        .limit(2000);

      if (data) {
        const agents = Array.from(new Set(data.map(c => c.first_agent_name).filter(Boolean)));
        setUniqueAgents(agents as string[]);
        const campaigns = Array.from(new Set(data.map(c => c.campaign).filter(Boolean)));
        setUniqueCampaigns(campaigns as string[]);
      }
    } catch (e) {
      console.error("Error fetching filter options:", e);
    }
  };

  const fetchNoAnalyzedConversations = async () => {
    if (!currentAccount) return;
    setIsLoading(true);
    try {
      let q = supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, phone_number, campaign, initiate_type, total_messages, start_date, ticket")
        .eq("account_id", currentAccount.account_id)
        .in("status", ["no_analizado", "pendiente"]);

      // Server-side filters
      if (dateRange?.from) q = q.gte("start_date", dateRange.from.toISOString());
      if (dateRange?.to) q = q.lte("start_date", dateRange.to.toISOString());
      if (typeFilter !== "all") q = q.eq("initiate_type", typeFilter);
      if (agentFilter !== "all") q = q.eq("first_agent_name", agentFilter);
      if (campaignFilter !== "all") q = q.eq("campaign", campaignFilter);
      
      if (minMessages) q = q.gte("total_messages", parseInt(minMessages));
      if (maxMessages) q = q.lte("total_messages", parseInt(maxMessages));
      if (minClientMsgs) q = q.gte("mensajes_cliente", parseInt(minClientMsgs));
      if (maxClientMsgs) q = q.lte("mensajes_cliente", parseInt(maxClientMsgs));

      if (searchTerm) {
        const term = `%${searchTerm}%`;
        q = q.or(`contact_name.ilike.${term},phone_number.ilike.${term},campaign.ilike.${term}`);
      }

      // Limit to 1000 for better UI performance. 
      // If the user has more, they should refine filters.
      const { data, error } = await q
        .order("start_date", { ascending: false })
        .limit(1000);

      if (error) throw error;
      setConversations(data || []);
    } catch (error: any) {
      toast.error("Error al cargar conversaciones: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPrompts = async () => {
    if (!currentAccount) return;
    try {
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("account_id", currentAccount.account_id)
        .eq("status", "active");
      if (error) throw error;
      setPrompts(data || []);
    } catch (error: any) {
      console.error(error);
    }
  };

  // We still keep client-side filtering as a fallback/secondary layer if needed,
  // but most work is now done by fetchNoAnalyzedConversations on the server.
  const filteredConversations = conversations;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedConvIds(filteredConversations.map(c => c.id));
    } else {
      setSelectedConvIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedConvIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const startAnalysis = async () => {
    if (!selectedPromptId || selectedConvIds.length === 0) return;

    if (!canUploadWhatsapp) {
      toast.error("Límite de conversaciones de WhatsApp alcanzado", {
        description: `Has consumido ${whatsappUsed} de ${maxWhatsapp} este mes. Solicita ampliación al administrador.`,
        duration: 8000,
      });
      return;
    }

    if (selectedConvIds.length > whatsappRemaining) {
      toast.error("Selección excede el cupo restante", {
        description: `Te quedan ${whatsappRemaining} conversaciones disponibles este mes. Reduce la selección.`,
        duration: 8000,
      });
      return;
    }

    setStep('processing');
    setIsLoading(true);
    setProgress(0);
    setDisplayProgress(0);
    setProcessingDone(false);
    setElapsedTime(0);
    setStats({ total: selectedConvIds.length, completed: 0, failed: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-batch', {
        body: {
          conversation_ids: selectedConvIds,
          account_id: currentAccount?.account_id,
          prompt_id: selectedPromptId,
          config: {
            blockSize: 10,
            delayBetweenBlocks: 3000,
            maxRetries: 3
          }
        }
      });

      if (error) {
        console.error("Supabase edge function error:", error);
        if (error.context) {
          try {
            const errBody = await error.context.json();
            console.error("Edge function error body:", errBody);
          } catch (e) {}
        }
        throw error;
      }
      setBatchId(data.batch_id);

    } catch (error: any) {
      console.error("Full exception:", error);
      toast.error("Error al iniciar procesamiento: " + (error.message || String(error)));
      setStep('prompt');
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setStep('filter');
    setSelectedConvIds([]);
    setBatchId(null);
    setProgress(0);
    setDisplayProgress(0);
    setProcessingDone(false);
    setElapsedTime(0);
    setSearchTerm("");
    if (onSuccess) onSuccess();
    onOpenChange(false);
  };
  
  const handleCancelOpen = (val: boolean) => {
    if (!val) {
      // Modals closing via backdrop or X
      if (processingDone && onSuccess) onSuccess();
      resetModal();
    }
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isLoading && step !== 'processing' && handleCancelOpen(val)}>
      <DialogContent className="sm:max-w-[850px] transition-all duration-300 ease-in-out border-border/60 shadow-xl overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
              step === 'processing' && !processingDone
                ? "bg-accent/15 text-accent"
                : step === 'processing' && processingDone
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-accent/10 text-accent"
            )}>
              {step === 'filter' && <Filter className="w-4.5 h-4.5" />}
              {step === 'prompt' && <Brain className="w-4.5 h-4.5" />}
              {step === 'processing' && !processingDone && <Loader2 className="w-4.5 h-4.5 animate-spin" />}
              {step === 'processing' && processingDone && <CheckCircle2 className="w-4.5 h-4.5" />}
            </div>
            <span>
              {step === 'filter' && "Nuevo análisis WhatsApp"}
              {step === 'prompt' && "Seleccionar plantilla"}
              {step === 'processing' && !processingDone && "Procesando análisis"}
              {step === 'processing' && processingDone && "Análisis finalizado"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/80">
            {step === 'filter' && "Filtra y selecciona las conversaciones que deseas analizar."}
            {step === 'prompt' && `Selecciona el criterio de IA para analizar ${selectedConvIds.length} conversaciones.`}
            {step === 'processing' && !processingDone && "La IA está analizando las conversaciones seleccionadas."}
            {step === 'processing' && processingDone && "Todas las conversaciones han sido procesadas."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          {/* ── Step 1: Filter & Select ───────────────────────── */}
          {step === 'filter' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/20 p-4 rounded-xl border border-border/50 relative z-10">
                <div className="space-y-1.5 lg:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Buscar</label>
                  <Input 
                    placeholder="Contacto o teléfono..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="h-9 text-xs bg-background" 
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Rango de Fecha</label>
                  <div className="h-9">
                    <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Tipo</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="Ent.">Entrante</SelectItem>
                      <SelectItem value="Sal.">Saliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Campaña</label>
                  <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {uniqueCampaigns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Total Mensajes (min - max)</label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" value={minMessages} onChange={e => setMinMessages(e.target.value)} className="h-9 text-xs bg-background" />
                    <Input type="number" placeholder="Max" value={maxMessages} onChange={e => setMaxMessages(e.target.value)} className="h-9 text-xs bg-background" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Msgs Cliente (min - max)</label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" value={minClientMsgs} onChange={e => setMinClientMsgs(e.target.value)} className="h-9 text-xs bg-background" />
                    <Input type="number" placeholder="Max" value={maxClientMsgs} onChange={e => setMaxClientMsgs(e.target.value)} className="h-9 text-xs bg-background" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Agente</label>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueAgents.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border border-border/60 rounded-xl overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 flex justify-between items-center border-b border-border/50">
                   <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="rounded border-input w-4 h-4 accent-accent"
                        checked={selectedConvIds.length === filteredConversations.length && filteredConversations.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                      <span className="text-xs font-semibold text-muted-foreground">
                        {selectedConvIds.length} Seleccionadas
                      </span>
                   </div>
                   <span className="text-[10px] text-muted-foreground/70 font-medium">
                     {isLoading ? (
                       <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Cargando…</span>
                     ) : (
                       `${filteredConversations.length} encontradas`
                     )}
                   </span>
                </div>
                <ScrollArea className="h-[300px]">
                   <div className="divide-y divide-border/40">
                      {filteredConversations.map(conv => (
                        <div
                          key={conv.id}
                          className={cn(
                            "px-4 py-2.5 flex items-center justify-between hover:bg-accent/5 transition-colors cursor-pointer group",
                            selectedConvIds.includes(conv.id) && "bg-accent/[0.04]"
                          )}
                          onClick={() => toggleSelect(conv.id)}
                        >
                           <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                readOnly
                                checked={selectedConvIds.includes(conv.id)}
                                className="rounded border-input w-4 h-4 accent-accent"
                              />
                               <div className="flex flex-col">
                                 <span className="text-sm font-semibold text-foreground">{conv.contact_name || conv.phone_number}</span>
                                 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 mt-0.5">
                                    <span className="truncate max-w-[120px]">{conv.campaign}</span>
                                    <span className="text-border">•</span>
                                    <span>{conv.initiate_type}</span>
                                    <span className="text-border">•</span>
                                    <span>{conv.total_messages || 0} msgs</span>
                                    <span className="text-border">•</span>
                                    <span>{conv.start_date ? format(new Date(conv.start_date), "dd MMM") : ""}</span>
                                 </div>
                              </div>
                           </div>
                           <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground/60 border-border/40">
                              {conv.ticket || "N/A"}
                           </Badge>
                        </div>
                      ))}
                      {filteredConversations.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                           <MessageSquare className="w-8 h-8 opacity-15 mb-2" />
                           <p className="text-sm">No hay conversaciones con estos filtros</p>
                        </div>
                      )}
                   </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* ── Step 2: Select Prompt ─────────────────────────── */}
          {step === 'prompt' && (
            <div className="space-y-4">
               <div className="bg-accent/5 border border-accent/15 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Conversaciones listas</h4>
                    <p className="text-xs text-muted-foreground">Has seleccionado {selectedConvIds.length} chats para analizar.</p>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Selecciona una plantilla</label>
                  <ScrollArea className="h-[280px] border border-border/50 rounded-xl p-2 bg-muted/10">
                     <div className="space-y-1.5">
                        {prompts.map(p => (
                          <div
                            key={p.id}
                            className={cn(
                              "p-3.5 rounded-lg border-2 transition-all cursor-pointer",
                              selectedPromptId === p.id
                                ? "border-accent bg-accent/[0.04] shadow-sm"
                                : "border-transparent hover:border-border hover:bg-muted/30"
                            )}
                            onClick={() => setSelectedPromptId(p.id)}
                          >
                             <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-sm text-foreground">{p.name}</span>
                                {selectedPromptId === p.id && <CheckCircle2 className="w-4 h-4 text-accent" />}
                             </div>
                             <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                                {p.system_instructions}
                             </p>
                          </div>
                        ))}
                        {prompts.length === 0 && (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-sm">No tienes plantillas activas. Ve a Catálogo de Prompts para crear una.</p>
                          </div>
                        )}
                     </div>
                  </ScrollArea>
               </div>
            </div>
          )}

          {/* ── Step 3: Processing ────────────────────────────── */}
          {step === 'processing' && (
            <div className="space-y-6 py-2">
              {/* Progress ring */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-border/30" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke="currentColor"
                      className={cn(
                        "transition-all duration-500 ease-out",
                        processingDone ? "text-emerald-500" : "text-accent"
                      )}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 50}`}
                      strokeDashoffset={`${2 * Math.PI * 50 * (1 - displayProgress / 100)}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn(
                      "text-2xl font-bold tabular-nums",
                      processingDone ? "text-emerald-500" : "text-foreground"
                    )}>
                      {displayProgress}%
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className={cn(
                    "text-base font-bold",
                    processingDone ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                  )}>
                    {processingDone ? "¡Análisis completo!" : "Analizando con IA…"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stats.completed + stats.failed} de {stats.total} conversaciones
                    {!processingDone && elapsedTime > 0 && (
                      <span className="ml-1.5 text-muted-foreground/50">· {formatElapsed(elapsedTime)}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className={cn(
                  "p-3.5 rounded-xl border flex items-center gap-3 transition-all",
                  stats.completed > 0
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-muted/20 border-border/40"
                )}>
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    stats.completed > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground/40"
                  )}>
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Exitosos</p>
                    <p className={cn(
                      "text-xl font-bold tabular-nums",
                      stats.completed > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"
                    )}>{stats.completed}</p>
                  </div>
                </div>
                <div className={cn(
                  "p-3.5 rounded-xl border flex items-center gap-3 transition-all",
                  stats.failed > 0
                    ? "bg-destructive/5 border-destructive/20"
                    : "bg-muted/20 border-border/40"
                )}>
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    stats.failed > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground/40"
                  )}>
                    <AlertCircle className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Errores</p>
                    <p className={cn(
                      "text-xl font-bold tabular-nums",
                      stats.failed > 0 ? "text-destructive" : "text-muted-foreground/40"
                    )}>{stats.failed}</p>
                  </div>
                </div>
              </div>

              {/* Live log indicator */}
              {!processingDone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60 justify-center">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                  </span>
                  Procesando en segundo plano…
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {!processingDone && (
                  <Button variant="outline" onClick={resetModal} className="w-full text-xs h-9">
                    Cerrar y continuar en segundo plano
                  </Button>
                )}
                {processingDone && (
                  <Button onClick={resetModal} className="w-full text-xs h-9 bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ver resultados
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer (filter & prompt steps only) ────────────── */}
        {step !== 'processing' && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Cancelar
            </Button>

            {step === 'filter' && (
              <Button
                size="sm"
                disabled={selectedConvIds.length === 0}
                onClick={() => setStep('prompt')}
                className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}

            {step === 'prompt' && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep('filter')} className="gap-1.5 text-xs">
                  <ChevronLeft className="w-3.5 h-3.5" /> Atrás
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedPromptId || isLoading}
                  onClick={startAnalysis}
                  className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                  Procesar {selectedConvIds.length}
                </Button>
              </div>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
