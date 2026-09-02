import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, Check, FileText, Plus, BrainCircuit, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptItem {
  id: string;
  name: string;
  category?: string | null;
  status: "active" | "draft" | string;
  system_instructions?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: PromptItem[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
  onOpenCreateDraft: () => void;
}

// Función auxiliar para extraer capacidades reales del prompt
function extractPromptCapabilities(prompt: { name: string; system_instructions?: string | null; id: string }) {
  const text = `${prompt.name} ${prompt.system_instructions || ""}`.toLowerCase();
  const caps: string[] = [];

  if (prompt.id === "default") {
    return ["Resumen", "Sentimiento", "Objeciones", "Motivos", "Evaluación IA"];
  }

  if (text.includes("resumen") || text.includes("summary")) caps.push("Resumen");
  if (text.includes("sentimiento") || text.includes("sentiment") || text.includes("emocion")) caps.push("Sentimiento");
  if (text.includes("objecion") || text.includes("freno") || text.includes("comercial")) caps.push("Objeciones");
  if (text.includes("motivo") || text.includes("intencion") || text.includes("razon")) caps.push("Motivos");
  if (text.includes("calidad") || text.includes("auditoria") || text.includes("score")) caps.push("Calidad IA");
  if (text.includes("transcrip") || text.includes("audio")) caps.push("Transcripción");

  if (caps.length === 0) {
    caps.push("Análisis Personalizado");
  }

  return caps.slice(0, 4);
}

export function PromptSelectionModal({
  open,
  onOpenChange,
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onOpenCreateDraft,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filtered = prompts.filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const handleSelect = (id: string) => {
    onSelectPrompt(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col p-6 rounded-3xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center shadow-2xs border border-accent/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <span>Catálogo de Prompts de Inteligencia Artificial</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Elige el motor de análisis y el conjunto de instrucciones especializadas para procesar tus audios.
          </DialogDescription>
        </DialogHeader>

        {/* Buscador y Creador rápido */}
        <div className="flex items-center gap-2 py-2">
          <div
            className={cn(
              "relative flex-1 rounded-xl transition-all duration-200",
              isSearchFocused ? "ring-2 ring-accent/30 shadow-xs" : "",
            )}
          >
            <Search
              className={cn(
                "w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 transition-colors",
                isSearchFocused ? "text-accent" : "text-muted-foreground",
              )}
            />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Buscar prompt por nombre o categoría..."
              className="pl-8.5 h-9 text-xs rounded-xl bg-secondary/40 border-border/70 focus-visible:ring-0 focus-visible:border-accent"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onOpenCreateDraft();
            }}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl hover:bg-secondary"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>Crear Borrador</span>
          </Button>
        </div>

        {/* Lista de Prompts con Animación */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[50vh] scrollbar-thin">
          {/* Opción Predeterminada */}
          <motion.div
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => handleSelect("default")}
            className={cn(
              "group relative flex items-start justify-between p-4 rounded-2xl border transition-all cursor-pointer",
              selectedPromptId === "default"
                ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent/40"
                : "border-border/70 bg-card/80 hover:border-accent/40 hover:bg-accent/5 hover:shadow-xs",
            )}
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <motion.div
                animate={selectedPromptId === "default" ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs border border-primary/20"
              >
                <BrainCircuit className="w-5 h-5" />
              </motion.div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-foreground">Análisis Predeterminado IA</span>
                  <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20 font-bold uppercase">
                    Estándar
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                  Extracción automática de resumen ejecutivo, sentimiento por turnos, motivos de contacto, objeciones y evaluación global.
                </p>

                {/* Chips de capacidades */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {extractPromptCapabilities({ name: "default", id: "default" }).map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-0.5 rounded-md bg-secondary/80 text-foreground text-[10px] font-semibold border border-border/50"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {selectedPromptId === "default" ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-xs"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </motion.div>
              ) : (
                <span className="text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Seleccionar →
                </span>
              )}
            </div>
          </motion.div>

          {/* Prompts de la cuenta */}
          <AnimatePresence>
            {filtered.map((p, idx) => {
              const isSelected = selectedPromptId === p.id;
              const isDraft = p.status === "draft";
              const caps = extractPromptCapabilities(p);

              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelect(p.id)}
                  className={cn(
                    "group relative flex items-start justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                    isSelected
                      ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent/40"
                      : "border-border/70 bg-card/80 hover:border-accent/40 hover:bg-accent/5 hover:shadow-xs",
                  )}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs border",
                        isDraft
                          ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                      )}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-foreground truncate max-w-[220px]">
                          {p.name}
                        </span>
                        {p.category && (
                          <Badge variant="secondary" className="text-[9px]">
                            {p.category}
                          </Badge>
                        )}
                        {isDraft && (
                          <Badge
                            variant="outline"
                            className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                          >
                            Borrador
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {p.system_instructions || "Prompt personalizado de análisis configurado para la cuenta."}
                      </p>

                      {/* Chips de capacidades */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {caps.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded-md bg-secondary/80 text-foreground text-[10px] font-semibold border border-border/50"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-2">
                    {isSelected ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </motion.div>
                    ) : (
                      <span className="text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                        Seleccionar →
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && searchTerm && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No se encontraron prompts con el término "{searchTerm}".
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
