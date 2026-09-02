import { useState, useRef, useEffect, UIEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  Sparkles,
  Maximize2,
  BookOpen,
  Search,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  Target,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpandedPromptReaderModal } from "./ExpandedPromptReaderModal";
import { cn } from "@/lib/utils";

interface PromptItem {
  id: string;
  name: string;
  category?: string | null;
  status: "active" | "draft" | string;
  system_instructions?: string | null;
}

interface Props {
  prompt: PromptItem;
  capabilities: string[];
}

const DEFAULT_SYSTEM_INSTRUCTIONS = `# Convert-IA — Motor de Análisis Predeterminado

## Objetivo
Analizar de forma integral la interacción de audio / llamada para evaluar la calidad del servicio, la satisfacción del cliente y la eficacia comercial del asesor.

## Tareas Principales
- **Transcripción y Diarización**: Identificar con precisión los turnos de habla del agente y del cliente.
- **Resumen Ejecutivo**: Generar una síntesis concisa, cronológica y factual de la interacción sin inventar detalles.
- **Análisis de Sentimiento**: Clasificar el tono emocional global y por turnos (Positivo, Neutral, Negativo).
- **Detección de Intenciones y Motivos**: Extraer la razón principal del contacto, solicitudes específicas y preguntas clave.
- **Objeciones y Fricciones**: Registrar cualquier objeción comercial, duda o inconformidad planteada por el cliente.
- **Hallazgos Clave**:
  - Aspectos Positivos observados en el desempeño del asesor.
  - Puntos a Mejorar / Oportunidades de capacitación y coaching.

## Reglas de Evaluación
- Basar las conclusiones estrictamente en la evidencia presente en la transcripción.
- Si se detectan señales de riesgo de cancelación o queja formal, clasificar con prioridad alta.
- Mantener un formato estructurado y objetivo en las métricas resultantes.`;

// Parsea texto en negrita **texto** a elementos React
function renderInlineFormatted(str: string) {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function FormattedPromptText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-3.5 text-xs font-sans leading-relaxed select-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Encabezado Principal (#)
        if (trimmed.startsWith("# ")) {
          return (
            <div key={idx} className="pb-2 mb-2 border-b border-border/70">
              <span className="font-bold text-sm text-foreground flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
                {trimmed.replace(/^#\s*/, "")}
              </span>
            </div>
          );
        }

        // Sub-encabezado (##)
        if (trimmed.startsWith("## ")) {
          return (
            <div key={idx} className="pt-3 pb-1">
              <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block bg-emerald-500/10 px-2.5 py-1 rounded-lg w-fit border border-emerald-500/20">
                {trimmed.replace(/^##\s*/, "")}
              </span>
            </div>
          );
        }

        // Sub-sub-encabezado (###)
        if (trimmed.startsWith("### ")) {
          return (
            <div key={idx} className="pt-2 pb-0.5">
              <span className="font-bold text-xs text-foreground block">
                {trimmed.replace(/^###\s*/, "")}
              </span>
            </div>
          );
        }

        // Items de lista con viñetas o números
        if (/^(\d+\.|\-|\*)\s/.test(trimmed)) {
          const content = trimmed.replace(/^(\d+\.|\-|\*)\s*/, "");
          return (
            <div key={idx} className="pl-3 flex items-start gap-2.5 text-foreground/90 py-0.5">
              <span className="text-emerald-500 font-bold flex-shrink-0 mt-0.5">•</span>
              <span className="leading-relaxed flex-1">{renderInlineFormatted(content)}</span>
            </div>
          );
        }

        // Línea vacía
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Texto regular
        return (
          <p key={idx} className="text-muted-foreground leading-relaxed pl-1">
            {renderInlineFormatted(line)}
          </p>
        );
      })}
    </div>
  );
}

export function PromptInspectorPanel({ prompt, capabilities }: Props) {
  const [activeTab, setActiveTab] = useState<"summary" | "full">("summary");
  const [expandModalOpen, setExpandModalOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fullPromptText =
    prompt.id === "default"
      ? DEFAULT_SYSTEM_INSTRUCTIONS
      : prompt.system_instructions ||
        `Instrucciones de análisis configuradas para el prompt: "${prompt.name}".\n\nEl motor evaluará la interacción según el modelo de lenguaje de la plataforma y extraerá las métricas operativas correspondientes.`;

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight <= clientHeight) {
      setScrollProgress(100);
      setIsAtBottom(true);
      return;
    }
    const percent = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
    setScrollProgress(percent);
    setIsAtBottom(scrollHeight - (scrollTop + clientHeight) < 30);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollProgress(0);
      setIsAtBottom(false);
    }
  }, [prompt.id, activeTab]);

  return (
    <>
      <div className="flex flex-col h-full min-h-0 rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-card via-card/95 to-emerald-500/5 p-5 shadow-xl backdrop-blur-md overflow-hidden relative">
        {/* Barra superior de progreso de lectura */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-border/40">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
            style={{ width: `${scrollProgress}%` }}
            transition={{ ease: "easeOut", duration: 0.15 }}
          />
        </div>

        {/* Encabezado del Inspector con espacio holgado */}
        <div className="pb-3.5 border-b border-border/60 flex-shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <motion.div
                animate={{
                  scale: [1, 1.06, 1],
                  filter: [
                    "drop-shadow(0 0 3px rgba(16,185,129,0.25))",
                    "drop-shadow(0 0 8px rgba(16,185,129,0.5))",
                    "drop-shadow(0 0 3px rgba(16,185,129,0.25))",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-500/30 shadow-2xs"
              >
                <BrainCircuit className="w-5 h-5" />
              </motion.div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    INSPECTOR DE IA
                  </span>
                  <Badge variant="outline" className="text-[9px] font-bold text-muted-foreground uppercase px-1.5 py-0">
                    PROMPT ACTIVO
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    Lectura {scrollProgress}%
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground truncate mt-1">
                  {prompt.name}
                </h3>
              </div>
            </div>

            {/* Botón Expandir */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpandModalOpen(true)}
              className="h-8.5 px-3 gap-1.5 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary flex-shrink-0 shadow-2xs"
              title="Expandir en ventana grande"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Expandir</span>
            </Button>
          </div>

          {/* Selector de Pestañas: Resumen Visual | Prompt Completo */}
          <div>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as any)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 h-9 p-1 bg-secondary/60 rounded-xl">
                <TabsTrigger
                  value="summary"
                  className="text-xs font-bold h-7 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-2xs data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  Resumen Visual
                </TabsTrigger>
                <TabsTrigger
                  value="full"
                  className="text-xs font-bold h-7 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-2xs data-[state=active]:text-teal-600 dark:data-[state=active]:text-teal-400"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5 text-teal-500" />
                  Prompt Completo
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Cuerpo del Inspector con Scroll Interno Independiente y Espaciado Cómodo */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto py-3.5 pr-2 pb-10 space-y-4 scrollbar-thin relative"
        >
          <AnimatePresence mode="wait">
            {activeTab === "summary" ? (
              <motion.div
                key="tab-summary"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3.5"
              >
                {/* Capacidades Detectadas */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Capacidades Activas en este Prompt
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20 shadow-2xs"
                      >
                        ✓ {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 1. ¿Qué información busca? */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <span>¿Qué información busca en cada audio?</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1.5 pl-4 list-disc leading-relaxed">
                    <li>Identificación precisa de turnos de habla (Asesor y Cliente).</li>
                    <li>Motivo principal de contacto, intenciones y solicitudes comerciales.</li>
                    <li>Objeciones planteadas por el cliente y nivel de fricción.</li>
                  </ul>
                </div>

                {/* 2. ¿Qué datos generará? */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                    <div className="w-6 h-6 rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <span>¿Qué datos y métricas generará?</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1.5 pl-4 list-disc leading-relaxed">
                    <li>Transcripción enriquecida por turnos con marcas de tiempo.</li>
                    <li>Resumen ejecutivo cronológico y objetivo de la interacción.</li>
                    <li>Puntuación y distribución de sentimiento emocional.</li>
                    <li>Etiquetas temáticas automáticas y clasificación de cierre.</li>
                  </ul>
                </div>

                {/* 3. ¿Qué evaluará? */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Target className="w-3.5 h-3.5" />
                    </div>
                    <span>¿Qué evaluará?</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1.5 pl-4 list-disc leading-relaxed">
                    <li>Apego a protocolos de atención, empatía y escucha activa.</li>
                    <li>Capacidad de resolución en primer contacto y manejo de objeciones.</li>
                    <li>Hallazgos positivos, oportunidades de mejora y coaching.</li>
                  </ul>
                </div>

                {/* 4. ¿Qué resultado entregará? */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-muted-foreground flex items-start gap-2.5">
                  <ShieldCheck className="w-4.5 h-4.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong className="text-foreground">Resultado garantizado:</strong> Diagnóstico estructurado sin alucinaciones, sincronizado automáticamente con tus paneles y reportes analíticos.
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="tab-full"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="p-4 rounded-2xl bg-secondary/20 border border-border/70"
              >
                <FormattedPromptText text={fullPromptText} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Indicador Flotante de Continuar Leyendo */}
        <AnimatePresence>
          {!isAtBottom && scrollProgress < 85 && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10"
            >
              <div className="px-3.5 py-1 rounded-full bg-background/95 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shadow-lg flex items-center gap-1.5 backdrop-blur-sm">
                <span>Desplázate para continuar leyendo</span>
                <ChevronDown className="w-3 h-3 animate-bounce" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal Expandido de Lectura Cómoda */}
      <ExpandedPromptReaderModal
        open={expandModalOpen}
        onOpenChange={setExpandModalOpen}
        prompt={prompt}
        capabilities={capabilities}
        fullPromptText={fullPromptText}
      />
    </>
  );
}
