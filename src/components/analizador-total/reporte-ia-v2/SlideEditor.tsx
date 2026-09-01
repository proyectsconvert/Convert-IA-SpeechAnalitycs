import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import {
  Type,
  Square,
  Circle as CircleIcon,
  Image as ImageIcon,
  Trash2,
  Plus,
  Copy,
  ChevronUp,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Save,
  FileDown,
  FileText,
  Maximize2,
  Minimize2,
  Keyboard,
  GripVertical,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  type EditablePresentation,
  type SlideElement,
  type TextElement,
  type ShapeElement,
  type ImageElement,
  SLIDE_W,
  SLIDE_H,
  updateElement,
  deleteElement,
  addElement,
  addSlide,
  insertSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  makeNewText,
  makeNewShape,
  makeNewImage,
} from "@/lib/analizador-total/presentationModel";
import { AddSlideDialog } from "./AddSlideDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  presentation: EditablePresentation;
  onChange: (next: EditablePresentation) => void;
  onSave: () => Promise<void> | void;
  isSaving?: boolean;
  onExportPptx: () => Promise<void> | void;
  onExportPdf: () => Promise<void> | void;
  isExportingPptx?: boolean;
  isExportingPdf?: boolean;
  accountId?: string;
}

export function SlideEditor({
  presentation,
  onChange,
  onSave,
  isSaving,
  onExportPptx,
  onExportPdf,
  isExportingPptx,
  isExportingPdf,
  accountId,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [zoomMode, setZoomMode] = useState<"fit" | "100">("fit");
  const [guides, setGuides] = useState<{ v?: number; h?: number }>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const slide = presentation.slides[activeIdx] ?? presentation.slides[0];
  const selectedEl = slide?.elements.find((e) => e.id === selectedId) ?? null;

  // Resize observer to compute scale to fit
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerW(entry.contentRect.width);
        setContainerH(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (zoomMode === "100") return 1;
    if (containerW === 0) return 0.4;
    const sW = (containerW - 32) / SLIDE_W;
    const sH = containerH > 0 ? (containerH - 32) / SLIDE_H : sW;
    return Math.min(sW, sH, 1);
  }, [containerW, containerH, zoomMode]);

  // Reset selection when slide changes
  useEffect(() => {
    setSelectedId(null);
    setEditingId(null);
  }, [activeIdx]);

  // Keep activeIdx within bounds when slides count changes
  useEffect(() => {
    if (activeIdx > presentation.slides.length - 1) {
      setActiveIdx(Math.max(0, presentation.slides.length - 1));
    }
  }, [presentation.slides.length, activeIdx]);

  const updateEl = useCallback(
    (patch: Partial<SlideElement>) => {
      if (!selectedEl) return;
      onChange(updateElement(presentation, activeIdx, selectedEl.id, patch));
    },
    [selectedEl, onChange, presentation, activeIdx],
  );

  const deleteEl = useCallback(() => {
    if (!selectedEl) return;
    onChange(deleteElement(presentation, activeIdx, selectedEl.id));
    setSelectedId(null);
    setEditingId(null);
  }, [selectedEl, onChange, presentation, activeIdx]);

  const handleAdd = (el: SlideElement) => {
    onChange(addElement(presentation, activeIdx, el));
    setSelectedId(el.id);
  };

  const handleAddImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      handleAdd(makeNewImage(src));
    };
    reader.readAsDataURL(file);
  };

  const handleInsertBlankSlide = useCallback(() => {
    onChange(addSlide(presentation, activeIdx));
    setActiveIdx(activeIdx + 1);
  }, [onChange, presentation, activeIdx]);

  const handleGenerateAiSlide = useCallback(
    async (context: string) => {
      setIsGeneratingSlide(true);
      try {
        if (accountId) {
          const { data: limitOk } = await supabase.rpc("check_account_limits", {
            p_account_id: accountId,
            p_check_type: "chatbot",
          });
          if (limitOk === false) {
            toast.error(
              "Has alcanzado el límite de consultas IA del mes. No se pueden generar más slides con IA; puedes agregar diapositivas en blanco y editarlas manualmente.",
            );
            setIsGeneratingSlide(false);
            return;
          }
        }
        const { data, error } = await supabase.functions.invoke("generate-slide", {
          body: {
            context,
            sourceResponse: presentation.sourceResponse ?? null,
            presentationTitle: presentation.title,
            accountId: accountId ?? null,
          },
        });
        if (error) throw error;
        if (data && typeof data === "object" && "error" in data) {
          throw new Error(String((data as { error: unknown }).error));
        }
        const slide = (data as { slide?: { background: string; elements: SlideElement[] } })?.slide;
        if (!slide || !Array.isArray(slide.elements) || slide.elements.length === 0) {
          throw new Error("La IA no devolvió contenido válido");
        }
        onChange(insertSlide(presentation, slide, activeIdx));
        setActiveIdx(activeIdx + 1);
        setAddDialogOpen(false);
        toast.success("Diapositiva creada con IA (1 crédito IA descontado)");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo generar la diapositiva";
        toast.error(msg);
      } finally {
        setIsGeneratingSlide(false);
      }
    },
    [onChange, presentation, activeIdx, accountId],
  );

  const moveZ = useCallback(
    (dir: "up" | "down") => {
      if (!selectedEl) return;
      const els = slide.elements;
      const idx = els.findIndex((e) => e.id === selectedEl.id);
      if (idx < 0) return;
      const target = dir === "up" ? Math.min(idx + 1, els.length - 1) : Math.max(idx - 1, 0);
      if (target === idx) return;
      const reordered = [...els];
      [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
      onChange({
        ...presentation,
        slides: presentation.slides.map((s, i) =>
          i === activeIdx ? { ...s, elements: reordered } : s,
        ),
      });
    },
    [selectedEl, slide, onChange, presentation, activeIdx],
  );

  const duplicateEl = useCallback(() => {
    if (!selectedEl) return;
    const copy = { ...selectedEl, id: `el_${Math.random().toString(36).slice(2, 10)}`, x: selectedEl.x + 30, y: selectedEl.y + 30 } as SlideElement;
    onChange(addElement(presentation, activeIdx, copy));
    setSelectedId(copy.id);
  }, [selectedEl, onChange, presentation, activeIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore typing in inputs
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (e.key === "Escape") {
        setSelectedId(null);
        setEditingId(null);
        return;
      }
      if (!selectedEl) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteEl();
        return;
      }
      const step = e.shiftKey ? 20 : 2;
      if (e.key === "ArrowUp") { e.preventDefault(); updateEl({ y: Math.max(0, selectedEl.y - step) }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); updateEl({ y: Math.min(SLIDE_H - selectedEl.h, selectedEl.y + step) }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); updateEl({ x: Math.max(0, selectedEl.x - step) }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); updateEl({ x: Math.min(SLIDE_W - selectedEl.w, selectedEl.x + step) }); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateEl(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "]") { e.preventDefault(); moveZ("up"); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "[") { e.preventDefault(); moveZ("down"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedEl, deleteEl, updateEl, duplicateEl, moveZ]);

  // Snap helpers
  const computeSnap = (x: number, y: number, w: number, h: number) => {
    const SNAP = 6; // px in canvas units
    const cx = x + w / 2;
    const cy = y + h / 2;
    const newGuides: { v?: number; h?: number } = {};
    let nx = x;
    let ny = y;
    if (Math.abs(cx - SLIDE_W / 2) < SNAP) {
      nx = Math.round(SLIDE_W / 2 - w / 2);
      newGuides.v = SLIDE_W / 2;
    }
    if (Math.abs(cy - SLIDE_H / 2) < SNAP) {
      ny = Math.round(SLIDE_H / 2 - h / 2);
      newGuides.h = SLIDE_H / 2;
    }
    return { x: nx, y: ny, guides: newGuides };
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100vh-220px)] min-h-[640px] flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
          <ToolbarButton icon={Type} label="Texto" onClick={() => handleAdd(makeNewText())} hint="T" />
          <ToolbarButton icon={Square} label="Rectángulo" onClick={() => handleAdd(makeNewShape("rect"))} />
          <ToolbarButton icon={Square} label="Redondeado" onClick={() => handleAdd(makeNewShape("roundRect"))} />
          <ToolbarButton icon={CircleIcon} label="Círculo" onClick={() => handleAdd(makeNewShape("ellipse"))} />
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="inline-flex">
                <Button size="sm" variant="outline" asChild className="h-8 cursor-pointer gap-1.5">
                  <span>
                    <ImageIcon className="h-3.5 w-3.5" /> Imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleAddImageFile(f);
                        e.target.value = "";
                      }}
                    />
                  </span>
                </Button>
              </label>
            </TooltipTrigger>
            <TooltipContent>Insertar imagen / logo</TooltipContent>
          </Tooltip>

          <div className="mx-2 h-5 w-px bg-border" />

          <Button
            size="sm"
            variant="outline"
            onClick={() => setZoomMode((z) => (z === "fit" ? "100" : "fit"))}
            className="h-8 gap-1.5"
            title={zoomMode === "fit" ? "Ver al 100%" : "Ajustar al ancho"}
          >
            {zoomMode === "fit" ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            {zoomMode === "fit" ? "Ajustar" : "100%"}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground">
                <Keyboard className="h-3.5 w-3.5" /> Atajos
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-1 text-xs">
                <div><kbd>↑↓←→</kbd> mover · <kbd>Shift</kbd>+flecha mover 20px</div>
                <div><kbd>Del</kbd> eliminar · <kbd>Esc</kbd> deseleccionar</div>
                <div><kbd>⌘/Ctrl</kbd>+<kbd>D</kbd> duplicar · <kbd>⌘/Ctrl</kbd>+<kbd>]</kbd>/<kbd>[</kbd> capa</div>
                <div>Doble clic en texto para editar</div>
              </div>
            </TooltipContent>
          </Tooltip>

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void onExportPdf()} disabled={isExportingPdf} className="h-8 gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {isExportingPdf ? "PDF…" : "PDF"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onExportPptx()} disabled={isExportingPptx} className="h-8 gap-1.5">
              <FileDown className="h-3.5 w-3.5" />
              {isExportingPptx ? "PPTX…" : "PPTX"}
            </Button>
            <Button size="sm" onClick={() => void onSave()} disabled={isSaving} className="h-8 gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Slide list */}
          <div className="flex w-48 shrink-0 flex-col border-r border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Slides · {presentation.slides.length}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-primary"
                    onClick={() => setAddDialogOpen(true)}
                  >
                    <Sparkles className="h-3 w-3" />
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nueva diapositiva con IA o en blanco</TooltipContent>
              </Tooltip>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-2">
                {presentation.slides.map((s, i) => (
                  <SlideThumb
                    key={s.id}
                    slide={s}
                    index={i}
                    isActive={i === activeIdx}
                    onClick={() => setActiveIdx(i)}
                    onDuplicate={() => onChange(duplicateSlide(presentation, i))}
                    onDelete={() => {
                      if (presentation.slides.length <= 1) return;
                      onChange(deleteSlide(presentation, i));
                      if (i <= activeIdx && activeIdx > 0) setActiveIdx(activeIdx - 1);
                    }}
                    canDelete={presentation.slides.length > 1}
                    onMoveUp={i > 0 ? () => {
                      onChange(moveSlide(presentation, i, i - 1));
                      if (activeIdx === i) setActiveIdx(i - 1);
                    } : undefined}
                    onMoveDown={i < presentation.slides.length - 1 ? () => {
                      onChange(moveSlide(presentation, i, i + 1));
                      if (activeIdx === i) setActiveIdx(i + 1);
                    } : undefined}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Canvas */}
          <div
            ref={canvasWrapRef}
            className={cn(
              "relative flex-1 overflow-auto bg-[hsl(220_15%_92%)] p-4",
              zoomMode === "fit" ? "flex items-center justify-center" : "",
            )}
            onClick={() => {
              setSelectedId(null);
              setEditingId(null);
            }}
          >
            <div
              className="relative shrink-0 shadow-2xl ring-1 ring-black/5"
              style={{
                width: SLIDE_W * scale,
                height: SLIDE_H * scale,
              }}
            >
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: SLIDE_W,
                  height: SLIDE_H,
                  transform: `scale(${scale})`,
                  background: slide?.background ?? "#fff",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {slide?.elements.map((el) => (
                  <RndElement
                    key={el.id}
                    element={el}
                    selected={el.id === selectedId}
                    editing={el.id === editingId}
                    scale={scale}
                    onSelect={() => setSelectedId(el.id)}
                    onStartEdit={() => {
                      setSelectedId(el.id);
                      if (el.type === "text") setEditingId(el.id);
                    }}
                    onEndEdit={() => setEditingId(null)}
                    onChange={(patch) =>
                      onChange(updateElement(presentation, activeIdx, el.id, patch))
                    }
                    onSnap={(x, y, w, h) => {
                      const snapped = computeSnap(x, y, w, h);
                      setGuides(snapped.guides);
                      return { x: snapped.x, y: snapped.y };
                    }}
                    onSnapEnd={() => setGuides({})}
                  />
                ))}

                {/* Center guides */}
                {guides.v !== undefined && (
                  <div
                    className="pointer-events-none absolute top-0 bg-pink-500"
                    style={{ left: guides.v - 1, width: 2, height: SLIDE_H }}
                  />
                )}
                {guides.h !== undefined && (
                  <div
                    className="pointer-events-none absolute left-0 bg-pink-500"
                    style={{ top: guides.h - 1, height: 2, width: SLIDE_W }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Inspector */}
          <div className="flex w-72 shrink-0 flex-col border-l border-border bg-muted/20">
            <Tabs defaultValue="element" className="flex flex-1 flex-col">
              <TabsList className="m-2 grid grid-cols-2">
                <TabsTrigger value="element">Elemento</TabsTrigger>
                <TabsTrigger value="slide">Diapositiva</TabsTrigger>
              </TabsList>
              <TabsContent value="element" className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    {!selectedEl && (
                      <div className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-center">
                        <p className="text-xs font-medium text-foreground">
                          Selecciona un elemento
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Haz clic sobre cualquier texto, forma o imagen del lienzo. Doble clic para editar el texto.
                        </p>
                      </div>
                    )}
                    {selectedEl && (
                      <ElementInspector
                        element={selectedEl}
                        onChange={updateEl}
                        onDelete={deleteEl}
                        onDuplicate={duplicateEl}
                        onMoveUp={() => moveZ("up")}
                        onMoveDown={() => moveZ("down")}
                      />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="slide" className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div>
                      <Label className="text-xs">Color de fondo</Label>
                      <Input
                        type="color"
                        value={slide?.background ?? "#FFFFFF"}
                        onChange={(e) =>
                          onChange({
                            ...presentation,
                            slides: presentation.slides.map((s, i) =>
                              i === activeIdx ? { ...s, background: e.target.value } : s,
                            ),
                          })
                        }
                        className="h-9 w-full p-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Notas (orador)</Label>
                      <Textarea
                        rows={5}
                        value={slide?.notes ?? ""}
                        onChange={(e) =>
                          onChange({
                            ...presentation,
                            slides: presentation.slides.map((s, i) =>
                              i === activeIdx ? { ...s, notes: e.target.value } : s,
                            ),
                          })
                        }
                        placeholder="Notas privadas del slide…"
                        className="resize-none text-xs"
                      />
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <AddSlideDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onGenerate={handleGenerateAiSlide}
        onInsertBlank={handleInsertBlankSlide}
        isGenerating={isGeneratingSlide}
        hasContextData={Boolean(presentation.sourceResponse)}
      />
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="sm" variant="outline" onClick={onClick} className="h-8 gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Insertar {label.toLowerCase()}
        {hint && <span className="ml-2 text-muted-foreground">[{hint}]</span>}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------

function SlideThumb({
  slide,
  index,
  isActive,
  onClick,
  onDuplicate,
  onDelete,
  canDelete,
  onMoveUp,
  onMoveDown,
}: {
  slide: { id: string; background: string; elements: SlideElement[] };
  index: number;
  isActive: boolean;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const THUMB_W = 168;
  const THUMB_SCALE = THUMB_W / SLIDE_W;
  return (
    <div className="group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative block w-full overflow-hidden rounded-md border-2 transition-all",
          isActive
            ? "border-primary shadow-md ring-2 ring-primary/20"
            : "border-border hover:border-muted-foreground/40",
        )}
      >
        <div
          className="relative"
          style={{
            width: THUMB_W,
            height: SLIDE_H * THUMB_SCALE,
            background: slide.background,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${THUMB_SCALE})`,
              pointerEvents: "none",
            }}
          >
            {slide.elements.map((el) => (
              <ElementRenderer key={el.id} element={el} />
            ))}
          </div>
        </div>
        <span
          className={cn(
            "absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-bold",
            isActive ? "bg-primary text-primary-foreground" : "bg-black/60 text-white",
          )}
        >
          {index + 1}
        </span>
      </button>
      <div className="mt-1 flex items-center justify-end gap-0.5 px-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onMoveUp && (
          <button onClick={onMoveUp} className="rounded p-0.5 hover:bg-muted" title="Subir">
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
        {onMoveDown && (
          <button onClick={onMoveDown} className="rounded p-0.5 hover:bg-muted" title="Bajar">
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
        <button onClick={onDuplicate} className="rounded p-0.5 hover:bg-muted" title="Duplicar">
          <Copy className="h-3 w-3" />
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="rounded p-0.5 text-destructive hover:bg-destructive/10"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RndElement({
  element,
  selected,
  editing,
  scale,
  onSelect,
  onStartEdit,
  onEndEdit,
  onChange,
  onSnap,
  onSnapEnd,
}: {
  element: SlideElement;
  selected: boolean;
  editing: boolean;
  scale: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (patch: Partial<SlideElement>) => void;
  onSnap: (x: number, y: number, w: number, h: number) => { x: number; y: number };
  onSnapEnd: () => void;
}) {
  return (
    <Rnd
      bounds="parent"
      scale={scale}
      size={{ width: element.w, height: element.h }}
      position={{ x: element.x, y: element.y }}
      disableDragging={editing}
      enableResizing={
        editing
          ? false
          : {
              top: true, right: true, bottom: true, left: true,
              topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
            }
      }
      onDrag={(_, d) => {
        onSnap(d.x, d.y, element.w, element.h);
      }}
      onDragStop={(_, d) => {
        const snapped = onSnap(d.x, d.y, element.w, element.h);
        onSnapEnd();
        onChange({ x: Math.round(snapped.x), y: Math.round(snapped.y) });
      }}
      onResizeStop={(_, __, ref, ___, pos) =>
        onChange({
          w: Math.round(parseFloat(ref.style.width)),
          h: Math.round(parseFloat(ref.style.height)),
          x: Math.round(pos.x),
          y: Math.round(pos.y),
        })
      }
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
      className={cn(
        "group/el transition-shadow",
        selected ? "" : "hover:outline hover:outline-1 hover:outline-blue-400/60",
      )}
      style={{
        outline: selected ? "2px solid hsl(217 91% 60%)" : undefined,
        outlineOffset: 2,
        cursor: editing ? "text" : "move",
      }}
      resizeHandleStyles={
        selected && !editing
          ? {
              topLeft: handleStyle, topRight: handleStyle, bottomLeft: handleStyle, bottomRight: handleStyle,
            }
          : undefined
      }
    >
      <ElementRenderer
        element={element}
        editing={editing}
        onTextChange={(v) => onChange({ text: v } as Partial<TextElement>)}
        onEndEdit={onEndEdit}
      />
    </Rnd>
  );
}

const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "hsl(217 91% 60%)",
  border: "2px solid white",
  borderRadius: 2,
};

// ---------------------------------------------------------------------------

export function ElementRenderer({
  element,
  editing,
  onTextChange,
  onEndEdit,
}: {
  element: SlideElement;
  editing?: boolean;
  onTextChange?: (v: string) => void;
  onEndEdit?: () => void;
}) {
  if (element.type === "text") {
    const style: React.CSSProperties = {
      width: "100%",
      height: "100%",
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle ?? "normal",
      color: element.color,
      textAlign: element.align,
      lineHeight: element.lineHeight ?? 1.25,
      background: element.bgColor ?? "transparent",
      display: "flex",
      flexDirection: "column",
      justifyContent:
        element.valign === "middle" ? "center" : element.valign === "bottom" ? "flex-end" : "flex-start",
      padding: 4,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflow: "hidden",
    };
    if (editing && onTextChange) {
      return (
        <textarea
          autoFocus
          value={element.text}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={() => onEndEdit?.()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...style,
            resize: "none",
            border: "none",
            outline: "none",
            cursor: "text",
          }}
        />
      );
    }
    return <div style={style}>{element.text}</div>;
  }
  if (element.type === "shape") {
    if (element.shape === "ellipse") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: element.fill,
            borderRadius: "50%",
            border: element.stroke ? `${element.strokeWidth ?? 1}px solid ${element.stroke}` : undefined,
          }}
        />
      );
    }
    if (element.shape === "line") {
      return <div style={{ width: "100%", height: "100%", background: element.fill }} />;
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: element.fill,
          borderRadius: element.shape === "roundRect" ? element.radius ?? 8 : 0,
          border: element.stroke ? `${element.strokeWidth ?? 1}px solid ${element.stroke}` : undefined,
        }}
      />
    );
  }
  if (element.type === "image") {
    return (
      <img
        src={element.src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: element.fit ?? "contain",
          pointerEvents: "none",
        }}
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------

function ElementInspector({
  element,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  element: SlideElement;
  onChange: (patch: Partial<SlideElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {element.type === "text" ? "Texto" : element.type === "shape" ? "Forma" : "Imagen"}
        </span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onMoveUp} className="h-7 w-7" title="Traer adelante (⌘])">
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown} className="h-7 w-7" title="Enviar atrás (⌘[)">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDuplicate} className="h-7 w-7" title="Duplicar (⌘D)">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} className="h-7 w-7 text-destructive" title="Eliminar (Del)">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Position / size */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumberField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumberField label="Ancho" value={element.w} onChange={(v) => onChange({ w: v })} />
        <NumberField label="Alto" value={element.h} onChange={(v) => onChange({ h: v })} />
      </div>

      {element.type === "text" && (
        <TextProps element={element} onChange={onChange as (p: Partial<TextElement>) => void} />
      )}
      {element.type === "shape" && (
        <ShapeProps element={element} onChange={onChange as (p: Partial<ShapeElement>) => void} />
      )}
      {element.type === "image" && (
        <ImageProps element={element} onChange={onChange as (p: Partial<ImageElement>) => void} />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function TextProps({
  element,
  onChange,
}: {
  element: TextElement;
  onChange: (p: Partial<TextElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Contenido</Label>
        <Textarea
          rows={4}
          value={element.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="resize-none text-xs"
        />
      </div>
      <div>
        <Label className="text-xs">Tamaño ({element.fontSize}px)</Label>
        <Slider
          min={10}
          max={240}
          step={2}
          value={[element.fontSize]}
          onValueChange={([v]) => onChange({ fontSize: v })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Color</Label>
          <Input
            type="color"
            value={element.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-8 w-full p-1"
          />
        </div>
        <div>
          <Label className="text-xs">Fondo</Label>
          <Input
            type="color"
            value={element.bgColor ?? "#FFFFFF"}
            onChange={(e) => onChange({ bgColor: e.target.value })}
            className="h-8 w-full p-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant={element.fontWeight >= 700 ? "default" : "outline"}
          onClick={() => onChange({ fontWeight: element.fontWeight >= 700 ? 400 : 700 })}
          className="h-8 w-8"
          title="Negrita"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="icon"
          variant={element.align === "left" ? "default" : "outline"}
          onClick={() => onChange({ align: "left" })}
          className="h-8 w-8"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant={element.align === "center" ? "default" : "outline"}
          onClick={() => onChange({ align: "center" })}
          className="h-8 w-8"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant={element.align === "right" ? "default" : "outline"}
          onClick={() => onChange({ align: "right" })}
          className="h-8 w-8"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ShapeProps({
  element,
  onChange,
}: {
  element: ShapeElement;
  onChange: (p: Partial<ShapeElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Relleno</Label>
          <Input
            type="color"
            value={element.fill}
            onChange={(e) => onChange({ fill: e.target.value })}
            className="h-8 w-full p-1"
          />
        </div>
        <div>
          <Label className="text-xs">Borde</Label>
          <Input
            type="color"
            value={element.stroke ?? "#000000"}
            onChange={(e) => onChange({ stroke: e.target.value })}
            className="h-8 w-full p-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Grosor borde ({element.strokeWidth ?? 0}px)</Label>
        <Slider
          min={0}
          max={20}
          step={1}
          value={[element.strokeWidth ?? 0]}
          onValueChange={([v]) => onChange({ strokeWidth: v })}
        />
      </div>
      {element.shape === "roundRect" && (
        <div>
          <Label className="text-xs">Radio ({element.radius ?? 0}px)</Label>
          <Slider
            min={0}
            max={120}
            step={2}
            value={[element.radius ?? 0]}
            onValueChange={([v]) => onChange({ radius: v })}
          />
        </div>
      )}
    </div>
  );
}

function ImageProps({
  element,
  onChange,
}: {
  element: ImageElement;
  onChange: (p: Partial<ImageElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Ajuste</Label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Button
            size="sm"
            variant={element.fit === "contain" ? "default" : "outline"}
            onClick={() => onChange({ fit: "contain" })}
          >
            Contener
          </Button>
          <Button
            size="sm"
            variant={element.fit === "cover" ? "default" : "outline"}
            onClick={() => onChange({ fit: "cover" })}
          >
            Cubrir
          </Button>
        </div>
      </div>
      <div>
        <Label className="text-xs">Reemplazar imagen</Label>
        <Input
          type="file"
          accept="image/*"
          className="h-8 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange({ src: reader.result as string });
            reader.readAsDataURL(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// Re-export to satisfy linter that imports below are used
void GripVertical;
