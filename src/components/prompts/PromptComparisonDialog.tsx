import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Copy, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface PromptComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalContent: string;
  improvedContent: string;
  promptName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function PromptComparisonDialog({
  open, onOpenChange, originalContent, improvedContent, promptName, onAccept, onReject,
}: PromptComparisonDialogProps) {
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado al portapapeles`);
    } catch {
      toast.error("Error al copiar al portapapeles");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] w-[95vw]">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl">
            Comparación de Prompts: {promptName}
          </DialogTitle>
          <DialogDescription>
            Compara el prompt original con la versión mejorada por IA. La versión mejorada incluye
            mejoras para análisis comercial, ventas e insights estratégicos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          <Card className="flex flex-col h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-muted-foreground">Prompt Original</CardTitle>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(originalContent, "Prompt original")}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-[400px] px-6 pb-6">
                <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 p-4 rounded-md">
                  {originalContent || "Sin contenido"}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col h-full border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg text-primary">Prompt Mejorado con IA</CardTitle>
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(improvedContent, "Prompt mejorado")}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-[400px] px-6 pb-6">
                <div className="whitespace-pre-wrap text-sm leading-relaxed bg-primary/10 p-4 rounded-md border border-primary/20">
                  {improvedContent || "Sin contenido mejorado"}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-green-50/50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-green-800 mb-2">Mejoras aplicadas por IA:</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Enfoque expandido para ventas comerciales e insights estratégicos</li>
                  <li>• Criterios específicos de evaluación y análisis</li>
                  <li>• Instrucciones más detalladas para análisis de comunicación</li>
                  <li>• Formato de respuesta estructurado y accionable</li>
                  <li>• Análisis de oportunidades de negocio y detección de necesidades</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onReject} className="flex items-center gap-2">
            <X className="h-4 w-4" /> Mantener Original
          </Button>
          <Button onClick={onAccept} className="flex items-center gap-2">
            <Check className="h-4 w-4" /> Usar Versión Mejorada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
