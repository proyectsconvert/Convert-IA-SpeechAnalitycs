import { useState, useMemo, useEffect } from "react";
import { useAccount } from "@/contexts/AccountContext";
import {
  useQualityMatrices,
  useMatrixDetails,
  useCreateMatrix,
  useDuplicateMatrix,
  useSetDefaultMatrix,
  useUpdateMatrixMetadata,
  useDeleteMatrix,
  useUpsertItem,
  useDeleteItem,
  useUpsertSection,
  useDeleteSection,
} from "@/hooks/useQualityMatrix";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  Sparkles,
  Save,
  Loader2,
  CheckCircle2,
  Layers,
  AlertTriangle,
  ShieldAlert,
  Shield,
  FilePlus2,
  Star,
  Copy,
  Edit2,
  MoreVertical,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { QualityMatrixItem, QualityMatrixSection } from "./types";

export function QualityMatrixEditor() {
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  // 1. List of all matrices for this account
  const { data: matrices = [], isLoading: loadingMatrices } = useQualityMatrices(accountId);

  // 2. Active matrix selection state
  const [selectedMatrixId, setSelectedMatrixId] = useState<string | null>(null);

  // Select first/default matrix automatically if none is selected
  useEffect(() => {
    if (matrices.length > 0) {
      if (!selectedMatrixId || !matrices.some((m) => m.id === selectedMatrixId)) {
        const defaultMat = matrices.find((m) => m.is_default) || matrices[0];
        setSelectedMatrixId(defaultMat.id);
      }
    }
  }, [matrices, selectedMatrixId]);

  // 3. Query details for currently selected matrix
  const { data: matrixData, isLoading: loadingDetails } = useMatrixDetails(selectedMatrixId || undefined);

  // Mutations
  const createMatrix = useCreateMatrix(accountId);
  const duplicateMatrix = useDuplicateMatrix(accountId);
  const setDefaultMatrix = useSetDefaultMatrix(accountId);
  const updateMetadata = useUpdateMatrixMetadata(accountId);
  const deleteMatrix = useDeleteMatrix(accountId);
  const upsertItem = useUpsertItem(accountId);
  const deleteItem = useDeleteItem(accountId);
  const upsertSection = useUpsertSection(accountId);
  const deleteSection = useDeleteSection(accountId);

  // Modals state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newMatrixName, setNewMatrixName] = useState("");
  const [newMatrixDesc, setNewMatrixDesc] = useState("");
  const [newMatrixMacro, setNewMatrixMacro] = useState("ventas");
  const [newMatrixTemplate, setNewMatrixTemplate] = useState<"standard" | "blank">("standard");
  const [newMatrixIsDefault, setNewMatrixIsDefault] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMacro, setEditMacro] = useState("ventas");

  // Local changes state
  const [editingSections, setEditingSections] = useState<Record<string, Partial<QualityMatrixSection>>>({});
  const [editingItems, setEditingItems] = useState<Record<string, Partial<QualityMatrixItem>>>({});
  const [savingAll, setSavingAll] = useState(false);

  // Reset dirty states when matrix ID changes
  useEffect(() => {
    setEditingSections({});
    setEditingItems({});
  }, [selectedMatrixId]);

  const dirtySectionIds = useMemo(
    () => Object.keys(editingSections).filter((id) => Object.keys(editingSections[id] || {}).length > 0),
    [editingSections],
  );

  const dirtyItemIds = useMemo(
    () => Object.keys(editingItems).filter((id) => Object.keys(editingItems[id] || {}).length > 0),
    [editingItems],
  );

  const totalDirty = dirtySectionIds.length + dirtyItemIds.length;

  // Selected matrix object
  const currentMatrix = useMemo(
    () => matrices.find((m) => m.id === selectedMatrixId) || matrixData?.version,
    [matrices, selectedMatrixId, matrixData],
  );

  if (loadingMatrices || (selectedMatrixId && loadingDetails)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando matrices de calidad...</p>
      </div>
    );
  }

  // If no matrix exists yet in this account
  if (matrices.length === 0 || !matrixData?.version) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="p-12 text-center space-y-5 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">Matrices de Calidad y Experiencia</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Crea tu primera matriz de calidad para evaluar llamadas y conversaciones con criterios y errores críticos personalizados.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <Button
              onClick={() => {
                createMatrix.mutate(
                  {
                    name: "Matriz Global de Calidad",
                    templateType: "standard",
                    isDefault: true,
                    macroproceso: "ventas",
                  },
                  {
                    onSuccess: (res: any) => {
                      setSelectedMatrixId(res.id);
                      toast.success("Matriz estándar creada exitosamente");
                    },
                  },
                );
              }}
              disabled={createMatrix.isPending}
              className="rounded-lg text-xs w-full sm:w-auto"
            >
              {createMatrix.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Crear con Plantilla Estándar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewMatrixName("Nueva Matriz de Calidad");
                setNewMatrixTemplate("blank");
                setNewMatrixIsDefault(true);
                setShowNewModal(true);
              }}
              className="rounded-lg text-xs w-full sm:w-auto"
            >
              <FilePlus2 className="w-4 h-4 mr-2" />
              Crear en Blanco (Manual)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const itemsBySection = (sectionId: string) => (matrixData.items ?? []).filter((i) => i.section_id === sectionId);

  const saveAll = async () => {
    if (totalDirty === 0) {
      toast.info("No hay cambios pendientes");
      return;
    }
    setSavingAll(true);
    try {
      // 1. Save sections
      for (const sId of dirtySectionIds) {
        const sec = matrixData.sections.find((s) => s.id === sId);
        if (sec) {
          await upsertSection.mutateAsync({
            ...sec,
            ...editingSections[sId],
            version_id: matrixData.version.id,
          });
        }
      }

      // 2. Save items
      const allItems = matrixData.items ?? [];
      for (const iId of dirtyItemIds) {
        const item = allItems.find((i) => i.id === iId);
        if (item) {
          await upsertItem.mutateAsync({
            ...item,
            ...editingItems[iId],
            section_id: item.section_id,
            version_id: matrixData.version.id,
          });
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
  const totalPoints = matrixData.items.reduce((sum, item) => {
    const patch = editingItems[item.id];
    const score = patch?.max_score !== undefined ? patch.max_score : item.max_score;
    const active = patch?.is_active !== undefined ? patch.is_active : item.is_active;
    return active ? sum + (score || 0) : sum;
  }, 0);

  const openEditModal = () => {
    if (currentMatrix) {
      setEditLabel(currentMatrix.label || "");
      setEditDesc(currentMatrix.description || "");
      setEditMacro(currentMatrix.macroproceso || "ventas");
      setShowEditModal(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector & Actions Bar */}
      <div className="sticky top-0 z-10 -mx-1 px-4 py-3 bg-background/95 backdrop-blur border-b border-border rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        {/* Left: Matrix Selector & Badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-[220px]">
            <Select
              value={selectedMatrixId || undefined}
              onValueChange={(val) => {
                if (totalDirty > 0) {
                  if (confirm("Tienes cambios sin guardar. ¿Deseas descartarlos para cambiar de matriz?")) {
                    setEditingSections({});
                    setEditingItems({});
                    setSelectedMatrixId(val);
                  }
                } else {
                  setSelectedMatrixId(val);
                }
              }}
            >
              <SelectTrigger className="h-9 font-semibold text-xs border-primary/30 bg-card">
                <SelectValue placeholder="Seleccionar Matriz..." />
              </SelectTrigger>
              <SelectContent>
                {matrices.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.label || `Matriz v${m.version}`}</span>
                      {m.is_default && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-500" /> Predeterminada
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20">
              {matrixData.sections.length} Bloques · {totalPoints} Pts Totales
            </Badge>

            {currentMatrix?.is_default ? (
              <Badge variant="secondary" className="text-[11px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 font-semibold">
                <Star className="w-3 h-3 fill-amber-500" /> Predeterminada de la Cuenta
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-amber-500 gap-1 px-2"
                onClick={() => {
                  if (selectedMatrixId) {
                    setDefaultMatrix.mutate(selectedMatrixId, {
                      onSuccess: () => toast.success(`"${currentMatrix?.label}" establecida como matriz predeterminada`),
                    });
                  }
                }}
                disabled={setDefaultMatrix.isPending}
                title="Hacer que esta matriz sea la utilizada por defecto al procesar llamadas y en automatizaciones"
              >
                <Star className="w-3.5 h-3.5" /> Hacer Predeterminada
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={openEditModal}
              title="Editar nombre y descripción"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Right: Matrix Actions */}
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
              setNewMatrixName("");
              setNewMatrixDesc("");
              setNewMatrixMacro(currentMatrix?.macroproceso || "ventas");
              setNewMatrixTemplate("standard");
              setNewMatrixIsDefault(false);
              setShowNewModal(true);
            }}
            className="text-xs h-8 gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Matriz
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  if (selectedMatrixId) {
                    duplicateMatrix.mutate(
                      {
                        sourceVersionId: selectedMatrixId,
                        newLabel: `${currentMatrix?.label || "Matriz"} (Copia)`,
                      },
                      {
                        onSuccess: (res: any) => {
                          setSelectedMatrixId(res.id);
                          toast.success("Matriz duplicada exitosamente");
                        },
                      },
                    );
                  }
                }}
                className="text-xs gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicar esta Matriz
              </DropdownMenuItem>

              <DropdownMenuItem onClick={openEditModal} className="text-xs gap-2 cursor-pointer">
                <Edit2 className="w-3.5 h-3.5" /> Renombrar / Descripción
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => {
                  if (matrices.length <= 1) {
                    toast.error("No puedes eliminar la única matriz de calidad de la cuenta.");
                    return;
                  }
                  if (confirm(`¿Estás seguro de eliminar la matriz "${currentMatrix?.label}"? Las evaluaciones históricas seguirán asociadas a esta versión.`)) {
                    if (selectedMatrixId) {
                      deleteMatrix.mutate(selectedMatrixId, {
                        onSuccess: () => {
                          toast.success("Matriz eliminada");
                          const remaining = matrices.filter((m) => m.id !== selectedMatrixId);
                          setSelectedMatrixId(remaining[0]?.id || null);
                        },
                      });
                    }
                  }
                }}
                disabled={matrices.length <= 1 || deleteMatrix.isPending}
                className="text-xs gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Matriz
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Matrix Description Header */}
      {currentMatrix?.description && (
        <p className="text-xs text-muted-foreground px-1 -mt-3 italic">
          {currentMatrix.description}
        </p>
      )}

      {/* Grid of Blocks */}
      <div className="space-y-4">
        {matrixData.sections.map((section, sIndex) => {
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
                      onClick={() =>
                        upsertItem.mutate({
                          section_id: section.id,
                          version_id: matrixData.version.id,
                          attribute: isCritical ? "Nuevo criterio crítico" : "Nueva validación de calidad",
                          max_score: 10,
                          affectation: isCritical ? "critico" : "none",
                        })
                      }
                    >
                      <Plus className="w-3 h-3 mr-1" /> Pregunta / Validación
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`¿Eliminar el bloque "${section.name}" y todas sus preguntas?`)) {
                          deleteSection.mutate({ id: section.id, version_id: matrixData.version.id });
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
                      <span className="font-bold">Regla de Falla Crítica:</span> Si el asesor no cumple alguna de las preguntas de este bloque, la calificación total de la interacción quedará automáticamente en <strong>0 puntos (0%)</strong>.
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
                              title="Puntaje que suma si el asesor cumple este criterio"
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
                              onClick={() => deleteItem.mutate({ id: item.id, version_id: matrixData.version.id })}
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
      {matrixData.sections.length < 20 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() =>
              upsertSection.mutate({
                version_id: matrixData.version!.id,
                name: `Bloque Regular ${matrixData.sections.length + 1}`,
                kind: "regular",
                sort_order: matrixData.sections.length + 1,
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
                version_id: matrixData.version!.id,
                name: `Bloque Crítico ${matrixData.sections.length + 1}`,
                kind: "critical",
                sort_order: matrixData.sections.length + 1,
              })
            }
            className="py-4 border-dashed border-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4 text-destructive" /> Agregar Bloque Crítico (Falla = 0 total)
          </Button>
        </div>
      )}

      {/* Modal: Crear Nueva Matriz */}
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Matriz de Calidad</DialogTitle>
            <DialogDescription>
              Crea una matriz de evaluación personalizada para un proceso específico de tu operación.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nombre de la Matriz *</label>
              <Input
                placeholder="Ej: Matriz Ventas Prepago, Matriz Cobranzas..."
                value={newMatrixName}
                onChange={(e) => setNewMatrixName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Descripción (Opcional)</label>
              <Textarea
                placeholder="Detalla el propósito de esta matriz de calidad..."
                value={newMatrixDesc}
                onChange={(e) => setNewMatrixDesc(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Macroproceso</label>
                <Select value={newMatrixMacro} onValueChange={setNewMatrixMacro}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ventas">Ventas</SelectItem>
                    <SelectItem value="cobranza">Cobranzas</SelectItem>
                    <SelectItem value="servicio_cliente">Servicio al Cliente</SelectItem>
                    <SelectItem value="retencion">Retención</SelectItem>
                    <SelectItem value="soporte">Soporte Técnico</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Plantilla Inicial</label>
                <Select value={newMatrixTemplate} onValueChange={(v: any) => setNewMatrixTemplate(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Estándar (5 bloques + 2 críticos)</SelectItem>
                    <SelectItem value="blank">En blanco (Manual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-foreground cursor-pointer">
                  Matriz Predeterminada
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Se usará por defecto al procesar llamadas y en automatizaciones.
                </p>
              </div>
              <Switch checked={newMatrixIsDefault} onCheckedChange={setNewMatrixIsDefault} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!newMatrixName.trim() || createMatrix.isPending}
              onClick={() => {
                createMatrix.mutate(
                  {
                    name: newMatrixName.trim(),
                    description: newMatrixDesc.trim(),
                    macroproceso: newMatrixMacro,
                    templateType: newMatrixTemplate,
                    isDefault: newMatrixIsDefault,
                  },
                  {
                    onSuccess: (res: any) => {
                      setShowNewModal(false);
                      setSelectedMatrixId(res.id);
                      toast.success(`Matriz "${res.label}" creada exitosamente`);
                    },
                  },
                );
              }}
            >
              {createMatrix.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Crear Matriz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Metadatos */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Información de Matriz</DialogTitle>
            <DialogDescription>
              Modifica el nombre y descripción descriptiva de esta matriz de calidad.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nombre de la Matriz *</label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Descripción</label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="text-xs resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Macroproceso</label>
              <Select value={editMacro} onValueChange={setEditMacro}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ventas">Ventas</SelectItem>
                  <SelectItem value="cobranza">Cobranzas</SelectItem>
                  <SelectItem value="servicio_cliente">Servicio al Cliente</SelectItem>
                  <SelectItem value="retencion">Retención</SelectItem>
                  <SelectItem value="soporte">Soporte Técnico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!editLabel.trim() || updateMetadata.isPending}
              onClick={() => {
                if (selectedMatrixId) {
                  updateMetadata.mutate(
                    {
                      versionId: selectedMatrixId,
                      label: editLabel.trim(),
                      description: editDesc.trim(),
                      macroproceso: editMacro,
                    },
                    {
                      onSuccess: () => {
                        setShowEditModal(false);
                        toast.success("Información actualizada");
                      },
                    },
                  );
                }
              }}
            >
              {updateMetadata.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
