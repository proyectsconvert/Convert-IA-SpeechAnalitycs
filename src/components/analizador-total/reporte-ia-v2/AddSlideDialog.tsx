import { useState } from "react";
import { Sparkles, Loader2, FilePlus2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado cuando el usuario confirma con contexto. Debe lanzar para mostrar error. */
  onGenerate: (context: string) => Promise<void>;
  /** Insertar diapositiva totalmente en blanco. */
  onInsertBlank: () => void;
  isGenerating?: boolean;
  /** Si la IA no está disponible (sin reporte de fondo). */
  hasContextData: boolean;
}

const SUGGESTIONS = [
  "Crea una portada de cierre con un mensaje motivacional para el equipo de atención y operaciones.",
  "Compara los 3 mejores asesores con los 3 con menor desempeño y resume oportunidades.",
  "Genera una diapositiva con 5 acciones inmediatas para mejorar los resultados y la calidad del servicio.",
  "Resume en 4 bullets el riesgo principal detectado en el período.",
  "Slide con la métrica más impactante del reporte y su lectura ejecutiva.",
];

export function AddSlideDialog({
  open,
  onOpenChange,
  onGenerate,
  onInsertBlank,
  isGenerating,
  hasContextData,
}: Props) {
  const [context, setContext] = useState("");

  const handleGenerate = async () => {
    const trimmed = context.trim();
    if (!trimmed) return;
    await onGenerate(trimmed);
    setContext("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isGenerating && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nueva diapositiva con IA
          </DialogTitle>
          <DialogDescription>
            Describe brevemente qué debe mostrar esta diapositiva.{" "}
            {hasContextData
              ? "La IA usará los datos reales de tu reporte para construirla."
              : "La IA construirá la diapositiva con el contexto que indiques."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="slide-context" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contexto / instrucción
            </Label>
            <Textarea
              id="slide-context"
              autoFocus
              rows={5}
              placeholder="Ej: Crea una diapositiva que destaque el principal riesgo detectado y proponga 3 acciones inmediatas…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={isGenerating}
              className="mt-2 resize-none"
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sugerencias rápidas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setContext(s)}
                  disabled={isGenerating}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-foreground transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onInsertBlank();
              onOpenChange(false);
            }}
            disabled={isGenerating}
            className="gap-1.5"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Insertar en blanco
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!context.trim() || isGenerating}
              className="gap-1.5"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generar con IA
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
