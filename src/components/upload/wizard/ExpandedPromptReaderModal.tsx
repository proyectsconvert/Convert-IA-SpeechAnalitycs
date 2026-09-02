import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BrainCircuit, Copy, Check, Sparkles, BookOpen, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: {
    id: string;
    name: string;
    category?: string | null;
    status: string;
    system_instructions?: string | null;
  };
  capabilities: string[];
  fullPromptText: string;
}

export function ExpandedPromptReaderModal({
  open,
  onOpenChange,
  prompt,
  capabilities,
  fullPromptText,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "full">("full");

  const handleCopy = () => {
    navigator.clipboard.writeText(fullPromptText);
    setCopied(true);
    toast.success("Instrucciones del prompt copiadas al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 rounded-3xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        <DialogHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-bold text-foreground">
                    {prompt.name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  >
                    Lectura Completa
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Revisión detallada de las directrices y configuración del modelo de Inteligencia Artificial.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 text-xs font-semibold rounded-xl hover:bg-secondary flex-shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Texto</span>
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs de vista */}
        <div className="pt-2 flex-1 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between pb-2">
              <TabsList className="bg-secondary/60 h-8 p-1 rounded-xl">
                <TabsTrigger
                  value="full"
                  className="text-xs font-semibold h-6 px-3 rounded-lg data-[state=active]:bg-background"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  Prompt Completo
                </TabsTrigger>
                <TabsTrigger
                  value="summary"
                  className="text-xs font-semibold h-6 px-3 rounded-lg data-[state=active]:bg-background"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Resumen Estructurado
                </TabsTrigger>
              </TabsList>

              <div className="text-[11px] text-muted-foreground font-mono">
                {fullPromptText.length} caracteres • {fullPromptText.split("\n").length} líneas
              </div>
            </div>

            <TabsContent
              value="full"
              className="flex-1 overflow-y-auto p-4 rounded-2xl bg-secondary/20 border border-border/70 font-mono text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed select-text scrollbar-thin"
            >
              {fullPromptText}
            </TabsContent>

            <TabsContent
              value="summary"
              className="flex-1 overflow-y-auto space-y-4 p-4 rounded-2xl bg-secondary/20 border border-border/70 text-xs scrollbar-thin"
            >
              <div>
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Capacidades Detectadas en este Prompt
                </h4>
                <div className="flex flex-wrap gap-2">
                  {capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20"
                    >
                      ✓ {cap}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-card border border-border/60 space-y-1.5">
                  <span className="font-bold text-foreground text-xs block">🎯 Objetivo del Modelo</span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Auditar, transcribir y sintetizar las interacciones para extraer valor operativo, comercial y de satisfacción del cliente.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-card border border-border/60 space-y-1.5">
                  <span className="font-bold text-foreground text-xs block">🛡️ Reglas de Seguridad</span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Solo evalúa sobre los hechos demostrados en la transcripción. Identifica riesgos de inconformidad o cancelación de forma prioritaria.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
