import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, X, MessageCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";

export interface ExtractionRule {
  id: string;
  account_id: string;
  name: string;
  source: "filename" | "transcription_cliente" | "transcription_asesor" | "summary";
  extraction_type: "split" | "keyword_mapping";
  config: Record<string, any> | any[];
}

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
  wa_agent_first: "Asesor (primer agente)",
  wa_agent_last: "Asesor (último agente)",
  wa_date_first: "Fecha primer mensaje",
  wa_date_last: "Fecha último mensaje",
  wa_campaign: "Campaña",
  wa_contact_name: "Nombre del contacto",
  wa_total_messages: "Total de mensajes",
  wa_analysis_field: "Campo del análisis IA",
  wa_static_value: "Valor estático (fijo)",
};

interface ExtractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ExtractionRule | null;
  onSuccess: () => void;
}

export function ExtractionDialog({ open, onOpenChange, rule, onSuccess }: ExtractionDialogProps) {
  const { currentAccount } = useAccount();
  const [name, setName] = useState("");
  const [source, setSource] = useState<ExtractionRule["source"]>("filename");
  const [extractionType, setExtractionType] = useState<ExtractionRule["extraction_type"]>("split");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [separator, setSeparator] = useState("_");
  const [splitIndex, setSplitIndex] = useState("0");

  const [keywordMappings, setKeywordMappings] = useState<{ output: string; keywords: string[] }[]>([
    { output: "", keywords: [] },
  ]);
  const [keywordInputs, setKeywordInputs] = useState<string[]>([""]);

  // WA sync
  const [waSyncEnabled, setWaSyncEnabled] = useState(false);
  const [waSource, setWaSource] = useState<WaSource>("wa_agent_first");
  const [waFieldKey, setWaFieldKey] = useState("");
  const [waStaticValue, setWaStaticValue] = useState("");

  useEffect(() => {
    if (open) {
      if (rule) {
        setName(rule.name);
        setSource(rule.source);
        setExtractionType(rule.extraction_type);
        const cfg = rule.config as Record<string, unknown>;
        if (rule.extraction_type === "split") {
          setSeparator((cfg.separator as string) || "_");
          setSplitIndex(String(cfg.index || 0));
        } else if (rule.extraction_type === "keyword_mapping") {
          const arr = Array.isArray(rule.config) ? rule.config : [];
          setKeywordMappings(arr.length > 0 ? (arr as { output: string; keywords: string[] }[]) : [{ output: "", keywords: [] }]);
          setKeywordInputs(new Array(Math.max(arr.length, 1)).fill(""));
        }
        // WA sync
        const waMapping = cfg.waMapping as Record<string, unknown> | undefined;
        if (waMapping?.enabled) {
          setWaSyncEnabled(true);
          setWaSource((waMapping.waSource as WaSource) || "wa_agent_first");
          setWaFieldKey((waMapping.fieldKey as string) || "");
          setWaStaticValue((waMapping.staticValue as string) || "");
        } else {
          setWaSyncEnabled(false);
          setWaSource("wa_agent_first");
          setWaFieldKey("");
          setWaStaticValue("");
        }
      } else {
        setName("");
        setSource("filename");
        setExtractionType("split");
        setSeparator("_");
        setSplitIndex("0");
        setKeywordMappings([{ output: "", keywords: [] }]);
        setKeywordInputs([""]);
        setWaSyncEnabled(false);
        setWaSource("wa_agent_first");
        setWaFieldKey("");
        setWaStaticValue("");
      }
    }
  }, [open, rule]);

  useEffect(() => {
    if (!rule) {
      if (source === "filename") setExtractionType("split");
      else setExtractionType("keyword_mapping");
    }
  }, [source, rule]);

  const handleAddKeyword = (index: number) => {
    const input = keywordInputs[index].trim();
    if (input && !keywordMappings[index].keywords.includes(input)) {
      const newMappings = [...keywordMappings];
      newMappings[index].keywords.push(input);
      setKeywordMappings(newMappings);
      const newInputs = [...keywordInputs];
      newInputs[index] = "";
      setKeywordInputs(newInputs);
    }
  };

  const handleRemoveKeyword = (mappingIndex: number, keywordIndex: number) => {
    const newMappings = [...keywordMappings];
    newMappings[mappingIndex].keywords.splice(keywordIndex, 1);
    setKeywordMappings(newMappings);
  };

  const addMappingRow = () => {
    setKeywordMappings([...keywordMappings, { output: "", keywords: [] }]);
    setKeywordInputs([...keywordInputs, ""]);
  };

  const removeMappingRow = (index: number) => {
    const newMappings = [...keywordMappings];
    newMappings.splice(index, 1);
    setKeywordMappings(newMappings);
    const newInputs = [...keywordInputs];
    newInputs.splice(index, 1);
    setKeywordInputs(newInputs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount?.account_id) return;
    if (!name.trim()) return toast.error("El nombre es requerido");

    let config: any;
    if (extractionType === "split") {
      config = {
        separator,
        index: parseInt(splitIndex) || 0,
      };
    } else {
      const validMappings = keywordMappings.filter((m) => m.output.trim() && m.keywords.length > 0);
      if (validMappings.length === 0) return toast.error("Agrega al menos una palabra clave y resultado");
      config = validMappings;
    }

    // Attach WA mapping to config
    if (waSyncEnabled) {
      const waMapping: Record<string, unknown> = { enabled: true, waSource };
      if (waSource === "wa_analysis_field") waMapping.fieldKey = waFieldKey.trim();
      if (waSource === "wa_static_value") waMapping.staticValue = waStaticValue.trim();

      if (Array.isArray(config)) {
        config = { mappings: config, waMapping };
      } else {
        (config as Record<string, unknown>).waMapping = waMapping;
      }
    } else {
      if (!Array.isArray(config)) {
        delete (config as Record<string, unknown>).waMapping;
      }
    }

    const payload = {
      account_id: currentAccount.account_id,
      name,
      source,
      extraction_type: extractionType,
      config,
    };

    try {
      setIsSubmitting(true);
      if (rule) {
        const { error } = await supabase.from("extraction_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
        toast.success("Regla actualizada");
      } else {
        const { error } = await supabase.from("extraction_rules").insert(payload);
        if (error) throw error;
        toast.success("Regla creada");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al guardar regla";
      console.error(error);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar Regla de Extracción" : "Nueva Regla de Extracción"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2 p-1">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Nombre del Dato (Aparecerá como columna)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Nombre Asesor" required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fuente (Llamadas)</Label>
                <Select value={source} onValueChange={(val: ExtractionRule["source"]) => setSource(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filename">Nombre del Archivo</SelectItem>
                    <SelectItem value="transcription_cliente">Transcripción (Cliente)</SelectItem>
                    <SelectItem value="transcription_asesor">Transcripción (Asesor)</SelectItem>
                    <SelectItem value="summary">Resumen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Método</Label>
                <Select value={extractionType} onValueChange={(val: ExtractionRule["extraction_type"]) => setExtractionType(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="split">Separador (Split)</SelectItem>
                    <SelectItem value="keyword_mapping">Palabras Clave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg border space-y-4">
              {extractionType === "split" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Caracter Separador</Label>
                    <Input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder="_" className="font-mono text-center text-lg" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Posición / Índice (desde 0)</Label>
                    <Input type="number" min="0" value={splitIndex} onChange={(e) => setSplitIndex(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Ej: A_B_C → índice 1 = "B"</p>
                  </div>
                </div>
              )}

              {extractionType === "keyword_mapping" && (
                <div className="space-y-3">
                  <Label>Mapeo de Palabras Clave</Label>
                  {keywordMappings.map((mapping, idx) => (
                    <div key={idx} className="p-3 border rounded-md bg-background relative space-y-2">
                      {keywordMappings.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeMappingRow(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="grid gap-1.5 pr-8">
                        <Label className="text-xs">Resultado</Label>
                        <Input value={mapping.output} onChange={(e) => { const nm = [...keywordMappings]; nm[idx].output = e.target.value; setKeywordMappings(nm); }} placeholder="Ej. Exitoso" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Keywords</Label>
                        <div className="flex gap-2">
                          <Input
                            value={keywordInputs[idx]}
                            onChange={(e) => { const ni = [...keywordInputs]; ni[idx] = e.target.value; setKeywordInputs(ni); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddKeyword(idx); } }}
                            placeholder="Escribe y presiona Enter..."
                            className="flex-1"
                          />
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleAddKeyword(idx)}>+</Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {mapping.keywords.map((kw, kwIdx) => (
                            <Badge key={kwIdx} variant="outline" className="gap-1 text-xs">
                              {kw}
                              <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => handleRemoveKeyword(idx, kwIdx)} />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addMappingRow} className="w-full">
                    <Plus className="h-4 w-4 mr-1.5" /> Agregar resultado
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* WA Sync Section */}
          <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <Label className="text-sm font-semibold text-emerald-800">Sincronizar con WhatsApp</Label>
              </div>
              <Switch checked={waSyncEnabled} onCheckedChange={setWaSyncEnabled} />
            </div>
            <p className="text-[11px] text-emerald-700">
              Si activas esta opción, la misma columna "{name || "..."}" se llenará automáticamente en las conversaciones WhatsApp.
            </p>

            {waSyncEnabled && (
              <div className="space-y-3 pt-2 border-t border-emerald-200">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-emerald-800">¿De dónde tomar el dato en WhatsApp?</Label>
                  <Select value={waSource} onValueChange={(v) => setWaSource(v as WaSource)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(WA_SOURCE_LABELS) as [WaSource, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {waSource === "wa_analysis_field" && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-emerald-800">Clave del campo en resultados IA</Label>
                    <Input value={waFieldKey} onChange={(e) => setWaFieldKey(e.target.value)} placeholder="Ej. sentimiento_cliente" className="bg-white" />
                  </div>
                )}

                {waSource === "wa_static_value" && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-emerald-800">Valor fijo</Label>
                    <Input value={waStaticValue} onChange={(e) => setWaStaticValue(e.target.value)} placeholder="Ej. Cobranza Q1" className="bg-white" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Guardando..." : "Guardar Regla"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
