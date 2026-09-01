import { useState, useMemo } from "react";
import { useAccount } from "@/contexts/AccountContext";
import { useActiveMatrix, useSeedMatrix, useCreateEmptyMatrix, useUpsertItem, useDeleteItem, useUpsertSection, useDeleteSection } from "@/hooks/useQualityMatrix";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Sparkles, Save, Loader2, CheckCircle2, Layers, AlertTriangle, ShieldAlert, Shield, FilePlus2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { QualityMatrixItem, QualityMatrixSection } from "./types";

export function QualityMatrixEditor() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;
  const { data, isLoading } = useActiveMatrix(accountId);
  const seed = useSeedMatrix(accountId);
  const createEmpty = useCreateEmptyMatrix(accountId);
  const upsertItem = useUpsertItem(accountId);
  const deleteItem = useDeleteItem(accountId);
  const upsertSection = useUpsertSection(accountId);
  const deleteSection = useDeleteSection(accountId);

  const [editingSections, setEditingSections] = useState<Record<string, Partial<QualityMatrixSection>>>({});
  const [editingItems, setEditingItems] = useState<Record<string, Partial<QualityMatrixItem>>>({});
  const [savingAll, setSavingAll] = useState(false);

  const dirtySectionIds = useMemo(
    () => Object.keys(editingSections).filter((id) => Object.keys(editingSections[id] || {}).length > 0),
    [editingSections],
  );

  const dirtyItemIds = useMemo(
    () => Object.keys(editingItems).filter((id) => Object.keys(editingItems[id] || {}).length > 0),
    [editingItems],
  );

  const totalDirty = dirtySectionIds.length + dirtyItemIds.length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando matriz de calidad...</p>
      </div>
    );
  }

  if (!data?.version || data.sections.length === 0) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="p-12 text-center space-y-5 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">Matriz de Calidad y Experiencia</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Puedes cargar la plantilla estándar global (5 bloques regulares + 2 críticos) o crear una matriz en blanco para estructurar tus propios bloques manualmente.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <Button
              onClick={() => seed.mutate(undefined, { onSuccess: () => toast.success("Plantilla estándar cargada exitosamente") })}
              disabled={seed.isPending || createEmpty.isPending}
              className="rounded-lg text-xs w-full sm:w-auto"
            >
              {seed.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Cargar Plantilla Estándar
            </Button>
            <Button
              variant="outline"
              onClick={() => createEmpty.mutate(undefined, { onSuccess: () => toast.success("Matriz creada en blanco. Agrega tus bloques manualmente.") })}
              disabled={seed.isPending || createEmpty.isPending}
              className="rounded-lg text-xs w-full sm:w-auto"
            >
              {createEmpty.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FilePlus2 className="w-4 h-4 mr-2" />}
              Crear en Blanco (Manual)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const itemsBySection = (sectionId: string) => (data.items ?? []).filter((i) => i.section_id === sectionId);

  const saveAll = async () => {
    if (totalDirty === 0) {
      toast.info("No hay cambios pendientes");
      return;
    }
    setSavingAll(true);
    try {
      // 1. Save sections
      for (const sId of dirtySectionIds) {
        const sec = data.sections.find((s) => s.id === sId);
        if (sec) {
          await upsertSection.mutateAsync({ ...sec, ...editingSections[sId], version_id: data.version.id });
        }
      }

      // 2. Save items
      const allItems = data.items ?? [];
      for (const iId of dirtyItemIds) {
        const item = allItems.find((i) => i.id === iId);
        if (item) {
          await upsertItem.mutateAsync({ ...item, ...editingItems[iId], section_id: item.section_id });
        }
      }

      setEditingSections({});
      setEditingItems({});
      toast.success(`${totalDirty} cambio(s) guardado(s) exitosamente`);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message || "desconocido"));
    } finally {
      setSavingAll(false);
    }
  };

  const discardAll = () => {
    setEditingSections({});
    setEditingItems({});
    toast.info("Cambios descartados");
  };

  // Calculate total matrix weight points
  const totalPoints = data.items.reduce((sum, item) => {
    const patch = editingItems[item.id];
    const score = patch?.max_score !== undefined ? patch.max_score : item.max_score;
    const active = patch?.is_active !== undefined ? patch.is_active : item.is_active;
    return active ? sum + (score || 0) : sum;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header Sticky */}
      <div className="sticky top-0 z-10 -mx-1 px-4 py-3 bg-background/95 backdrop-blur border-b border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Matriz de Calidad y Experiencia</h3>
            <Badge variant="outline" className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20">
              v{data.version.version} · {data.sections.length} Bloques · {totalPoints} Pts Totales
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estructura estandarizada: personaliza tus bloques o activa el check de <strong className="text-destructive font-semibold">Bloque Crítico</strong> en los bloques que anulen la nota a 0% si no se cumplen.
            {totalDirty > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">
                · {totalDirty} cambio(s) sin guardar
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totalDirty > 0 && (
            <Button variant="ghost" size="sm" onClick={discardAll} disabled={savingAll} className="text-xs h-8">
              Descartar
            </Button>
          )}
          <Button
            size="sm"
            onClick={saveAll}
            disabled={totalDirty === 0 || savingAll}
            className="text-xs h-8 min-w-[120px]"
          >
            {savingAll ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Guardar matriz{totalDirty > 0 ? ` (${totalDirty})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("¿Deseas crear una nueva versión de matriz en blanco para armarla manualmente desde cero? Las evaluaciones anteriores mantendrán su histórico intacto.")) {
                createEmpty.mutate(undefined, {
                  onSuccess: () => toast.success("Nueva versión creada en blanco. Agrega tus bloques y preguntas."),
                });
              }
            }}
            disabled={createEmpty.isPending || seed.isPending}
            className="text-xs h-8"
            title="Crea una nueva versión en blanco respetando el historial previo"
          >
            {createEmpty.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5 mr-1.5" />}
            Nueva en Blanco (Manual)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("¿Deseas cargar la plantilla estándar de Matriz de Calidad y Experiencia (5 bloques regulares + 2 críticos)? Se creará una nueva versión activa y las evaluaciones anteriores mantendrán su histórico.")) {
                seed.mutate(undefined, { onSuccess: () => toast.success("Plantilla estándar cargada exitosamente") });
              }
            }}
            disabled={seed.isPending || createEmpty.isPending}
            className="text-xs h-8"
            title="Restaura los 5 bloques regulares y 2 críticos predeterminados"
          >
            {seed.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-accent" />}
            Cargar Plantilla Estándar
          </Button>
        </div>
      </div>

      {/* Grid of Blocks */}
      <div className="space-y-4">
        {data.sections.map((section, sIndex) => {
          const sPatch = editingSections[section.id] || {};
          const sName = sPatch.name !== undefined ? sPatch.name : section.name;
          const sKind = sPatch.kind !== undefined ? sPatch.kind : section.kind;
          const isCritical = sKind === "critical";
          const items = itemsBySection(section.id);
          const blockPoints = items.reduce((sum, it) => {
            const iPatch = editingItems[it.id];
            const sc = iPatch?.max_score !== undefined ? iPatch.max_score : it.max_score;
            const ac = iPatch?.is_active !== undefined ? iPatch.is_active : it.is_active;
            return ac ? sum + (sc || 0) : sum;
          }, 0);

          return (
            <Card
              key={section.id}
              className={`border shadow-sm overflow-hidden bg-card transition-all ${
                isCritical ? "border-destructive/50 bg-destructive/[0.015] shadow-destructive/5" : "border-border/80"
              }`}
            >
              <CardHeader className={`p-4 border-b ${isCritical ? "bg-destructive/10 border-destructive/20" : "bg-muted/20 border-border/60"}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCritical ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"
                      }`}
                    >
                      {sIndex + 1}
                    </span>
                    <Input
                      value={sName || ""}
                      onChange={(e) => setEditingSections((prev) => ({ ...prev, [section.id]: { ...prev[section.id], name: e.target.value } }))}
                      className="font-semibold text-sm h-8 bg-transparent border-transparent hover:border-border focus:bg-background focus:border-primary max-w-sm px-2 truncate"
                      placeholder="Nombre del bloque..."
                    />
                    <Badge variant={isCritical ? "destructive" : "secondary"} className="text-[10px] font-bold shrink-0">
                      {blockPoints} pts {isCritical ? "(Suma si cumple)" : ""}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
                    {/* Switch de Activación de Crítico */}
                    <div
                      className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all ${
                        isCritical
                          ? "bg-destructive/15 border-destructive/40 text-destructive"
                          : "bg-background/80 border-border/60 text-muted-foreground hover:border-border"
                      }`}
                      title={isCritical ? "Bloque Crítico: Si no se cumple alguna pregunta, la nota total queda en 0" : "Haga clic para convertir este bloque en crítico"}
                    >
                      <Switch
                        id={`crit-switch-${section.id}`}
                        checked={isCritical}
                        onCheckedChange={(checked) => {
                          setEditingSections((prev) => ({
                            ...prev,
                            [section.id]: {
                              ...prev[section.id],
                              kind: checked ? "critical" : "regular",
                            },
                          }));
                          toast.info(checked ? `Bloque "${sName}" marcado como CRÍTICO (Falla = 0 total)` : `Bloque "${sName}" cambiado a REGULAR`);
                        }}
                        className="scale-75 data-[state=checked]:bg-destructive"
                      />
                      <label
                        htmlFor={`crit-switch-${section.id}`}
                        className="text-xs font-bold cursor-pointer select-none flex items-center gap-1.5"
                      >
                        {isCritical ? <ShieldAlert className="w-3.5 h-3.5 text-destructive animate-pulse" /> : <Shield className="w-3.5 h-3.5" />}
                        {isCritical ? "Bloque Crítico (Falla = 0)" : "Activar como Crítico"}
                      </label>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2.5"
                      onClick={() => upsertItem.mutate({
                        section_id: section.id,
                        attribute: isCritical ? "Nuevo criterio crítico" : "Nueva validación de calidad",
                        max_score: isCritical ? 10 : 10,
                        affectation: isCritical ? "critico" : "none",
                      })}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Pregunta / Validación
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`¿Eliminar el bloque "${section.name}" y todas sus preguntas?`)) {
                          deleteSection.mutate(section.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {isCritical && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-bold">Regla de Falla Crítica:</span> Si el agente no cumple alguna de las preguntas de este bloque, la calificación total de la interacción quedará automáticamente en <strong>0 puntos (0%)</strong>. Si cumple, conservará sus puntos ({blockPoints} pts).
                    </div>
                  </div>
                )}

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2 text-center">
                    Este bloque no tiene preguntas o validaciones aún. Haz clic en "Pregunta / Validación" para agregar una.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <div className="col-span-6 sm:col-span-6">Pregunta / Criterio de Evaluación</div>
                      <div className="col-span-4 sm:col-span-4">Descripción / Evidencia esperada</div>
                      <div className="col-span-1 sm:col-span-1 text-center">Puntos</div>
                      <div className="col-span-1 text-center">Activo</div>
                    </div>

                    {items.map((item) => {
                      const e = editingItems[item.id] || {};
                      const getV = (k: keyof QualityMatrixItem) => (e[k] !== undefined ? e[k] : item[k]) as any;
                      const updateI = (patch: Partial<QualityMatrixItem>) =>
                        setEditingItems((s) => ({ ...s, [item.id]: { ...s[item.id], ...patch } }));
                      const isDirty = Object.keys(e).length > 0;
                      const itemIsCrit = isCritical || getV("affectation") === "critico";

                      return (
                        <div
                          key={item.id}
                          className={`grid grid-cols-12 gap-2 p-2.5 rounded-lg border items-center transition-colors ${
                            isDirty
                              ? "bg-amber-500/5 border-amber-500/30"
                              : itemIsCrit
                              ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                              : "bg-muted/10 border-border/60 hover:bg-muted/20"
                          }`}
                        >
                          <div className="col-span-6 sm:col-span-6 flex items-center gap-2">
                            {itemIsCrit ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 opacity-70" />
                            )}
                            <Input
                              className="h-8 text-xs font-medium"
                              value={getV("attribute") || ""}
                              onChange={(ev) => updateI({ attribute: ev.target.value })}
                              placeholder="Ej: Saluda cordialmente y se identifica..."
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-4">
                            <Input
                              className="h-8 text-xs text-muted-foreground"
                              value={getV("description") || ""}
                              onChange={(ev) => updateI({ description: ev.target.value })}
                              placeholder="Evidencia o criterio esperado..."
                            />
                          </div>
                          <div className="col-span-1 sm:col-span-1 flex items-center justify-center">
                            <Input
                              type="number"
                              className={`h-8 text-xs text-center font-bold ${itemIsCrit ? "text-destructive" : ""}`}
                              value={getV("max_score") ?? 0}
                              onChange={(ev) => updateI({ max_score: Number(ev.target.value) })}
                              title="Puntaje que suma si el agente cumple este criterio"
                            />
                          </div>
                          <div className="col-span-1 flex items-center justify-between gap-1">
                            <Switch
                              checked={getV("is_active")}
                              onCheckedChange={(val) => updateI({ is_active: val })}
                              className="scale-75"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => deleteItem.mutate(item.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Section Buttons */}
      {data.sections.length < 15 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() =>
              upsertSection.mutate({
                version_id: data.version!.id,
                name: `Bloque Regular ${data.sections.length + 1}`,
                kind: "regular",
                sort_order: data.sections.length + 1,
              })
            }
            className="py-4 border-dashed border-2 text-xs flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-primary" /> Agregar Bloque Regular (Pondera a la nota)
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              upsertSection.mutate({
                version_id: data.version!.id,
                name: `Bloque Crítico ${data.sections.length + 1}`,
                kind: "critical",
                sort_order: data.sections.length + 1,
              })
            }
            className="py-4 border-dashed border-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4 text-destructive" /> Agregar Bloque Crítico (Falla = 0 total)
          </Button>
        </div>
      )}
    </div>
  );
}
