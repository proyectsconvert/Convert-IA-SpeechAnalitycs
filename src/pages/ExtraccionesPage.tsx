import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { Plus, Pencil, Trash2, Loader2, ArrowRightLeft, Type, Phone, MessageCircle, Tags } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ExtractionDialog, ExtractionRule } from "@/components/extracciones/ExtractionDialog";
import { WaExtractionDialog } from "@/components/extracciones/WaExtractionDialog";

function isWaRule(rule: ExtractionRule): boolean {
  return (rule.config as Record<string, any>)?.targetChannel === "whatsapp";
}

const WA_SOURCE_SHORT: Record<string, string> = {
  wa_agent_first: "Asesor (primero)",
  wa_agent_last: "Asesor (último)",
  wa_date_first: "Fecha inicio",
  wa_date_last: "Fecha fin",
  wa_campaign: "Campaña",
  wa_contact_name: "Contacto",
  wa_total_messages: "Total msgs",
  wa_analysis_field: "Campo análisis",
  wa_static_value: "Valor fijo",
};

export default function ExtraccionesPage() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  const [rules, setRules] = useState<ExtractionRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("calls");

  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false);
  const [isWaDialogOpen, setIsWaDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ExtractionRule | null>(null);

  const callRules = useMemo(() => rules.filter((r) => !isWaRule(r)), [rules]);
  const waRules = useMemo(() => rules.filter((r) => isWaRule(r)), [rules]);

  const fetchRules = async () => {
    if (!accountId) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("extraction_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRules((data as ExtractionRule[]) || []);
    } catch (error) {
      console.error("Error fetching rules:", error);
      toast.error("Error al cargar las reglas");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) fetchRules();
  }, [accountId]);

  const handleDelete = async () => {
    if (!selectedRuleId) return;
    try {
      const { error } = await supabase.from("extraction_rules").delete().eq("id", selectedRuleId);
      if (error) throw error;
      setRules((prev) => prev.filter((r) => r.id !== selectedRuleId));
      toast.success("Regla eliminada correctamente");
    } catch (error) {
      console.error("Error deleting rule:", error);
      toast.error("Error al eliminar la regla");
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedRuleId(null);
    }
  };

  const handleSuccess = () => {
    fetchRules();
    setSelectedRule(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse mt-3">Cargando reglas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reglas de Extracción</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Configure field extraction from calls and WhatsApp conversations. Rules apply automatically.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 p-1 rounded-lg">
          <TabsTrigger value="calls" className="flex items-center gap-1.5 rounded-md text-xs font-medium px-4 py-2">
            <Phone className="w-3.5 h-3.5" /> Llamadas ({callRules.length})
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 rounded-md text-xs font-medium px-4 py-2">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp ({waRules.length})
          </TabsTrigger>
        </TabsList>

        {/* LLAMADAS */}
        <TabsContent value="calls" className="mt-4">
          <Card className="overflow-hidden border rounded-xl">
            <div className="p-4 border-b bg-muted/30">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold">Reglas de Llamadas</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Extraen datos del nombre del archivo, transcripciones o resumen de la llamada.
                  </p>
                </div>
                <Button
                  onClick={() => { setSelectedRule(null); setIsCallDialogOpen(true); }}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Nueva Regla
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columna / Dato</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fuente</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configuración</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Tags className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm">No hay reglas de extracción para llamadas</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    callRules.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-primary">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {rule.source.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {rule.extraction_type === "split" ? <ArrowRightLeft className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
                            {rule.extraction_type === "split" ? "Separador" : "Palabras Clave"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[140px]">
                              {rule.extraction_type === "split"
                                ? `Split "${(rule.config as any)?.separator}" (Idx: ${(rule.config as any)?.index})`
                                : `${Array.isArray(rule.config) ? rule.config.length : (rule.config as any)?.mappings ? ((rule.config as any).mappings as any[]).length : 0} salidas`}
                            </span>
                            {(rule.config as Record<string,unknown>)?.waMapping && ((rule.config as Record<string,unknown>).waMapping as Record<string,unknown>)?.enabled && (
                              <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700 bg-emerald-50 gap-0.5 shrink-0">
                                <MessageCircle className="w-2.5 h-2.5" /> WA
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedRule(rule); setIsCallDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10 text-destructive"
                            onClick={() => { setSelectedRuleId(rule.id); setIsDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* WHATSAPP */}
        <TabsContent value="whatsapp" className="mt-4">
          <Card className="overflow-hidden border rounded-xl">
            <div className="p-4 border-b bg-muted/30">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold">Reglas de WhatsApp</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Extraen datos de conversaciones WhatsApp: agente, fecha, campaña, campos del análisis IA y valores estáticos.
                  </p>
                </div>
                <Button
                  onClick={() => { setSelectedRule(null); setIsWaDialogOpen(true); }}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Nueva Regla WA
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columna / Dato</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fuente</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Detalle</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Tags className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm">No hay reglas de extracción WhatsApp. Crea una para agregar columnas a tus datos.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    waRules.map((rule) => {
                      const ws = (rule.config as any)?.waSource as string;
                      return (
                        <TableRow key={rule.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium text-emerald-700">{rule.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
                              {WA_SOURCE_SHORT[ws] || ws}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {ws === "wa_analysis_field" && `Campo: ${(rule.config as any)?.fieldKey || "—"}`}
                            {ws === "wa_static_value" && `Valor: "${(rule.config as any)?.staticValue || "—"}"`}
                            {!["wa_analysis_field", "wa_static_value"].includes(ws) && "Automático"}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedRule(rule); setIsWaDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10 text-destructive"
                              onClick={() => { setSelectedRuleId(rule.id); setIsDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <ExtractionDialog
        open={isCallDialogOpen}
        onOpenChange={setIsCallDialogOpen}
        rule={selectedRule}
        onSuccess={handleSuccess}
      />

      <WaExtractionDialog
        open={isWaDialogOpen}
        onOpenChange={setIsWaDialogOpen}
        rule={selectedRule}
        onSuccess={handleSuccess}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar regla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se dejará de extraer "{rules.find((r) => r.id === selectedRuleId)?.name}" en futuras operaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
