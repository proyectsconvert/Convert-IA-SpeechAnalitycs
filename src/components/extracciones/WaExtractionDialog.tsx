import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { ExtractionRule } from "@/components/extracciones/ExtractionDialog";

type WaSource =
  | "wa_agent_first"
  | "wa_agent_last"
  | "wa_date_first"
  | "wa_date_last"
  | "wa_campaign"
  | "wa_contact_name"
  | "wa_total_messages"
  | "wa_analysis_field"
  | "wa_static_value";

const WA_SOURCE_LABELS: Record<WaSource, string> = {
  wa_agent_first: "Nombre Asesor (primer agente)",
  wa_agent_last: "Nombre Asesor (último agente)",
  wa_date_first: "Fecha primer mensaje",
  wa_date_last: "Fecha último mensaje",
  wa_campaign: "Campaña (del campo campaña)",
  wa_contact_name: "Nombre del contacto",
  wa_total_messages: "Total de mensajes",
  wa_analysis_field: "Campo del análisis IA (results)",
  wa_static_value: "Valor estático (fijo)",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ExtractionRule | null;
  onSuccess: () => void;
}

export function WaExtractionDialog({ open, onOpenChange, rule, onSuccess }: Props) {
  const { currentAccount } = useAccount();
  const [name, setName] = useState("");
  const [waSource, setWaSource] = useState<WaSource>("wa_agent_first");
  const [analysisFieldKey, setAnalysisFieldKey] = useState("");
  const [staticValue, setStaticValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const cfg = rule?.config as Record<string, any> | null;
      if (rule && cfg?.targetChannel === "whatsapp") {
        setName(rule.name);
        setWaSource((cfg.waSource as WaSource) || "wa_agent_first");
        setAnalysisFieldKey(cfg.fieldKey || "");
        setStaticValue(cfg.staticValue || "");
      } else {
        setName("");
        setWaSource("wa_agent_first");
        setAnalysisFieldKey("");
        setStaticValue("");
      }
    }
  }, [open, rule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount?.account_id) return;
    if (!name.trim()) return toast.error("El nombre de la columna es requerido");
    if (waSource === "wa_analysis_field" && !analysisFieldKey.trim()) {
      return toast.error("Indica la clave del campo del análisis");
    }
    if (waSource === "wa_static_value" && !staticValue.trim()) {
      return toast.error("Indica el valor estático");
    }

    const config = {
      targetChannel: "whatsapp",
      waSource,
      ...(waSource === "wa_analysis_field" ? { fieldKey: analysisFieldKey.trim() } : {}),
      ...(waSource === "wa_static_value" ? { staticValue: staticValue.trim() } : {}),
    };

    const payload = {
      account_id: currentAccount.account_id,
      name: name.trim(),
      source: "summary" as const,
      extraction_type: "keyword_mapping" as const,
      config,
    };

    try {
      setIsSubmitting(true);
      if (rule) {
        const { error } = await supabase.from("extraction_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
        toast.success("Regla WhatsApp actualizada");
      } else {
        const { error } = await supabase.from("extraction_rules").insert(payload);
        if (error) throw error;
        toast.success("Regla WhatsApp creada");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al guardar";
      console.error(error);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar Regla WhatsApp" : "Nueva Regla WhatsApp"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="space-y-2">
            <Label>Nombre de la columna (aparecerá en la tabla y en Excel)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Nombre Asesor, Fecha Inicio, Campaña..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Dato a extraer</Label>
            <Select value={waSource} onValueChange={(v) => setWaSource(v as WaSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(WA_SOURCE_LABELS) as [WaSource, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {waSource === "wa_agent_first" && "Extrae el nombre del primer agente que atendió la conversación."}
              {waSource === "wa_agent_last" && "Extrae el nombre del último agente en la conversación (si hay rotación)."}
              {waSource === "wa_date_first" && "Fecha y hora del primer mensaje de la conversación."}
              {waSource === "wa_date_last" && "Fecha y hora del último mensaje de la conversación."}
              {waSource === "wa_campaign" && "Campaña asignada a la conversación en el sistema."}
              {waSource === "wa_contact_name" && "Nombre del contacto del cliente."}
              {waSource === "wa_total_messages" && "Cantidad total de mensajes en la conversación."}
              {waSource === "wa_analysis_field" && "Un campo específico del JSON de resultados del análisis IA."}
              {waSource === "wa_static_value" && "Un valor fijo que se asignará a todas las conversaciones."}
            </p>
          </div>

          {waSource === "wa_analysis_field" && (
            <div className="space-y-2">
              <Label>Clave del campo en resultados del análisis</Label>
              <Input
                value={analysisFieldKey}
                onChange={(e) => setAnalysisFieldKey(e.target.value)}
                placeholder="Ej. sentimiento_cliente, motivo_no_pago, resumen..."
              />
              <p className="text-[10px] text-muted-foreground">
                Escribe la clave exacta del campo en el JSON de resultados del análisis IA.
              </p>
            </div>
          )}

          {waSource === "wa_static_value" && (
            <div className="space-y-2">
              <Label>Valor estático</Label>
              <Input
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Ej. Cobranza Q1, Campaña Norte..."
              />
              <p className="text-[10px] text-muted-foreground">
                Este valor se asignará a todas las conversaciones WhatsApp.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar Regla"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
