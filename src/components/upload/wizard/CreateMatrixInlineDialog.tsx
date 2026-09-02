import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateMatrix } from "@/hooks/useQualityMatrix";
import { toast } from "@/components/ui/sonner";
import { Layers, Loader2, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | undefined;
  onMatrixCreated: (newMatrixId: string) => void;
}

export function CreateMatrixInlineDialog({
  open,
  onOpenChange,
  accountId,
  onMatrixCreated,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [macroproceso, setMacroproceso] = useState("ventas");
  const [templateType, setTemplateType] = useState<"standard" | "blank">("standard");

  const createMutation = useCreateMatrix(accountId);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Por favor ingresa un nombre para la matriz");
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        macroproceso,
        templateType,
        isDefault: false,
      });

      toast.success("Nueva Matriz de Calidad creada exitosamente");
      onMatrixCreated(res.id);
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Error al crear la matriz");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            Crear Nueva Matriz de Calidad
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configura una nueva matriz para auditar llamadas con tus propios criterios de negocio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nombre de la Matriz *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Matriz Ventas Fibra Óptica, Cobranza..."
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Macroproceso</Label>
            <Select value={macroproceso} onValueChange={setMacroproceso}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ventas">Ventas / Comercial</SelectItem>
                <SelectItem value="atencion">Atención al Cliente / Soporte</SelectItem>
                <SelectItem value="cobranza">Cobranzas / Cartera</SelectItem>
                <SelectItem value="retencion">Retención / Fidelización</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Plantilla Inicial</Label>
            <Select value={templateType} onValueChange={(v: any) => setTemplateType(v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">✨ Estándar (Saludo, Sondeo, Objeciones, Cierre, Errores Críticos)</SelectItem>
                <SelectItem value="blank">📄 En Blanco (Personalizada)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Descripción (Opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo o alcance de esta matriz..."
              rows={2}
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!name.trim() || createMutation.isPending}
            className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Crear Matriz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
