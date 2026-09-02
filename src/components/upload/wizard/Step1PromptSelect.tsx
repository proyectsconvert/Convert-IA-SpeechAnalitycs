import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  BrainCircuit,
  Search,
  Plus,
  Check,
  FileText,
  Loader2,
  SlidersHorizontal,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PromptInspectorPanel } from "./PromptInspectorPanel";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface PromptItem {
  id: string;
  name: string;
  category?: string | null;
  status: "active" | "draft" | string;
  system_instructions?: string | null;
}

interface Props {
  accountId: string | undefined;
  userId: string | undefined;
  prompts: PromptItem[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
}

function extractPromptCapabilities(prompt: { name: string; system_instructions?: string | null; id: string }) {
  const text = `${prompt.name} ${prompt.system_instructions || ""}`.toLowerCase();
  const caps: string[] = [];

  if (prompt.id === "default") {
    return ["Resumen Ejecutivo", "Sentimiento por Turnos", "Objeciones", "Motivos de Contacto", "Evaluación Global"];
  }

  if (text.includes("resumen") || text.includes("summary")) caps.push("Resumen");
  if (text.includes("sentimiento") || text.includes("sentiment") || text.includes("emocion")) caps.push("Sentimiento");
  if (text.includes("objecion") || text.includes("freno") || text.includes("comercial")) caps.push("Objeciones");
  if (text.includes("motivo") || text.includes("intencion") || text.includes("razon")) caps.push("Motivos");
  if (text.includes("calidad") || text.includes("auditoria") || text.includes("score")) caps.push("Calidad IA");
  if (text.includes("transcrip") || text.includes("audio")) caps.push("Transcripción");
  if (text.includes("cierre") || text.includes("venta")) caps.push("Ventas");

  if (caps.length === 0) {
    caps.push("Análisis Personalizado");
  }

  return caps.slice(0, 4);
}

export function Step1PromptSelect({
  accountId,
  userId,
  prompts,
  selectedPromptId,
  onSelectPrompt,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const queryClient = useQueryClient();

  // Lista de categorías únicas encontradas en los prompts de la cuenta
  const categories = useMemo(() => {
    const set = new Set<string>();
    set.add("Todos");
    prompts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [prompts]);

  // Lista de prompts filtrada por término de búsqueda y categoría
  const filteredPrompts = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return prompts.filter((p) => {
      const matchesCategory =
        selectedCategory === "Todos" || (p.category && p.category.trim() === selectedCategory);
      if (!matchesCategory) return false;

      if (!q) return true;
      const matchName = p.name.toLowerCase().includes(q);
      const matchCategory = p.category && p.category.toLowerCase().includes(q);
      const matchInstructions = p.system_instructions && p.system_instructions.toLowerCase().includes(q);
      return matchName || matchCategory || matchInstructions;
    });
  }, [prompts, searchTerm, selectedCategory]);

  const defaultPromptMatches = useMemo(() => {
    if (selectedCategory !== "Todos" && selectedCategory !== "General") return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return "análisis predeterminado ia resumen sentimiento objeciones calidad".includes(q);
  }, [searchTerm, selectedCategory]);

  // Prompt activo seleccionado
  const selectedPrompt = useMemo(() => {
    if (selectedPromptId === "default") {
      return {
        id: "default",
        name: "Análisis Predeterminado IA",
        category: "General",
        status: "active",
        system_instructions:
          "Extracción estándar de transcripción, resumen ejecutivo de la interacción, sentimientos por turnos, motivos de contacto, objeciones y detección de intenciones comerciales.",
      };
    }
    return (
      prompts.find((p) => p.id === selectedPromptId) || {
        id: selectedPromptId,
        name: "Prompt Seleccionado",
        category: null,
        status: "active",
        system_instructions: null,
      }
    );
  }, [selectedPromptId, prompts]);

  const capabilities = useMemo(() => {
    return extractPromptCapabilities(selectedPrompt);
  }, [selectedPrompt]);

  const saveDraftPrompt = async () => {
    if (!accountId || !userId || !draftName.trim()) return;
    setSavingDraft(true);
    try {
      const { data, error } = await supabase
        .from("prompts")
        .insert({
          account_id: accountId,
          name: draftName.trim(),
          system_instructions:
            draftInstructions.trim() || "Analiza la llamada y proporciona un resumen detallado.",
          status: "draft" as any,
          created_by: userId,
        })
        .select("id")
        .single();

      if (error) throw error;
      toast.success("Prompt borrador creado y seleccionado");
      onSelectPrompt(data.id);
      setShowDraftForm(false);
      setDraftName("");
      setDraftInstructions("");
      queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    } catch (err: any) {
      toast.error(err.message || "Error al crear prompt");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDeletePrompt = async (e: React.MouseEvent, promptId: string) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from("prompts").delete().eq("id", promptId);
      if (error) throw error;
      toast.success("Prompt eliminado");
      if (selectedPromptId === promptId) {
        onSelectPrompt("default");
      }
      queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar prompt");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Cuadrícula de 2 Columnas: Selector a la izquierda + Inspector a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full min-h-0 flex-1">
        {/* =================================================================== */}
        {/* COLUMNA IZQUIERDA: BIBLIOTECA Y SELECTOR DIRECTO DE PROMPTS         */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-0 space-y-2.5">
          {/* 1. Botón Superior Permanente: + Crear Prompt Borrador */}
          {!showDraftForm ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowDraftForm(true)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border-2 border-dashed border-border/80 bg-secondary/25 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer group shadow-2xs flex-shrink-0"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-secondary group-hover:bg-emerald-500/20 text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center justify-center transition-colors">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 block">
                    + Crear Prompt Borrador
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    Redactar instrucciones personalizadas para este lote
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-accent group-hover:translate-x-0.5 transition-transform">
                Crear →
              </span>
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="rounded-2xl border border-emerald-500/40 bg-card p-3.5 space-y-2.5 shadow-md flex-shrink-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-500" />
                  Nuevo Prompt Borrador Rápido
                </span>
                <button
                  type="button"
                  onClick={() => setShowDraftForm(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <Input
                placeholder="Nombre del prompt (ej. Auditoría Ventas Fibra)"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="text-xs h-8.5"
                autoFocus
              />

              <Textarea
                placeholder="Instrucciones específicas para el modelo de IA..."
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDraftForm(false)}
                  className="h-7.5 text-xs font-semibold"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveDraftPrompt}
                  disabled={!draftName.trim() || savingDraft}
                  className="h-7.5 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 font-bold"
                >
                  {savingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                  Guardar y Activar
                </Button>
              </div>
            </motion.div>
          )}

          {/* 2. Buscador Permanente */}
          <div className="relative flex-shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔎 Buscar prompt por nombre o categoría..."
              className="pl-8.5 h-8.5 text-xs rounded-xl bg-secondary/40 border-border/70 focus-visible:ring-1 focus-visible:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 3. Filtros de Categorías (si existen más de 1) */}
          {categories.length > 2 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none flex-shrink-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap",
                    selectedCategory === cat
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* 4. Lista Desplazable de Tarjetas de Prompts */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-2 scrollbar-thin">
            {/* OPCIÓN 1: Análisis Predeterminado IA */}
            {defaultPromptMatches && (
              <motion.div
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelectPrompt("default")}
                className={cn(
                  "group relative p-3 rounded-2xl border transition-all cursor-pointer select-none",
                  selectedPromptId === "default"
                    ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/40"
                    : "border-border/70 bg-rose-500/[0.025] dark:bg-rose-500/[0.035] hover:border-emerald-500/50 hover:bg-emerald-500/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                        selectedPromptId === "default"
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-secondary text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <BrainCircuit className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-foreground truncate">
                          Análisis Predeterminado IA
                        </span>
                        {selectedPromptId === "default" ? (
                          <Badge className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold px-1.5 py-0">
                            PROMPT ACTIVO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground font-medium px-1.5 py-0">
                            Estándar
                          </Badge>
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 leading-snug">
                        Resumen ejecutivo, sentimiento, motivos, objeciones y métricas clave.
                      </p>

                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {["Resumen", "Sentimiento", "Objeciones", "Calidad"].map((tag) => (
                          <span
                            key={tag}
                            className={cn(
                              "px-1.5 py-0.2 rounded text-[9px] font-semibold border",
                              selectedPromptId === "default"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-secondary/60 text-muted-foreground border-border/50",
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Indicador Check */}
                  <div className="flex-shrink-0 pt-0.5">
                    {selectedPromptId === "default" ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </motion.div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-border/70 group-hover:border-emerald-500/60" />
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* OPCIONES DE LA CUENTA */}
            <AnimatePresence>
              {filteredPrompts.map((p) => {
                const isSelected = selectedPromptId === p.id;
                const isDraft = p.status === "draft";
                const caps = extractPromptCapabilities(p);

                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onSelectPrompt(p.id)}
                    className={cn(
                      "group relative p-3 rounded-2xl border transition-all cursor-pointer select-none",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/40"
                        : "border-border/70 bg-rose-500/[0.025] dark:bg-rose-500/[0.035] hover:border-emerald-500/50 hover:bg-emerald-500/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                            isSelected
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : isDraft
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-secondary text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          <FileText className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-foreground truncate max-w-[170px]">
                              {p.name}
                            </span>
                            {isSelected ? (
                              <Badge className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold px-1.5 py-0">
                                PROMPT ACTIVO
                              </Badge>
                            ) : p.category ? (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                {p.category}
                              </Badge>
                            ) : null}

                            {isDraft && !isSelected && (
                              <Badge
                                variant="outline"
                                className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 px-1.5 py-0"
                              >
                                Borrador
                              </Badge>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 leading-snug">
                            {p.system_instructions || "Prompt personalizado de análisis configurado para la cuenta."}
                          </p>

                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {caps.map((tag) => (
                              <span
                                key={tag}
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[9px] font-semibold border",
                                  isSelected
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-secondary/60 text-muted-foreground border-border/50",
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Indicador Check o Botón de Eliminar */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => handleDeletePrompt(e, p.id)}
                          title="Eliminar este prompt"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isSelected ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                            className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </motion.div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-border/70 group-hover:border-emerald-500/60" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!defaultPromptMatches && filteredPrompts.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No se encontraron prompts con el término "{searchTerm}".
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* COLUMNA DERECHA: INSPECTOR DE IA PERMANENTE                         */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 flex flex-col h-full min-h-0">
          <PromptInspectorPanel
            prompt={selectedPrompt}
            capabilities={capabilities}
          />
        </div>
      </div>
    </div>
  );
}
