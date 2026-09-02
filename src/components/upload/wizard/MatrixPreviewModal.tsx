import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMatrixDetails } from "@/hooks/useQualityMatrix";
import { Loader2, Layers, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string | null;
  matrixName?: string;
}

export function MatrixPreviewModal({ open, onOpenChange, versionId, matrixName }: Props) {
  const { data, isLoading } = useMatrixDetails(open ? versionId || undefined : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            Criterios de Evaluación: {data?.version.label || matrixName || "Matriz de Calidad"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {data?.version.description || "Esta matriz auditará los siguientes parámetros y estándares de calidad en cada grabación."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2 text-xs text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p>Cargando criterios de la matriz...</p>
          </div>
        ) : !data || data.sections.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No se encontraron criterios configurados en esta matriz.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin max-h-[55vh]">
            {data.sections.map((section) => {
              const sectionItems = data.items.filter((it) => it.section_id === section.id);
              const isCritical = section.kind === "critical";

              return (
                <div
                  key={section.id}
                  className="rounded-xl border border-border/70 bg-card overflow-hidden"
                >
                  <div
                    className={`flex items-center justify-between px-3.5 py-2 border-b border-border/50 text-xs font-semibold ${
                      isCritical
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-secondary/60 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCritical ? <ShieldAlert className="w-4 h-4" /> : <Layers className="w-3.5 h-3.5 text-primary" />}
                      <span>{section.name}</span>
                    </div>
                    <Badge variant={isCritical ? "destructive" : "secondary"} className="text-[10px]">
                      {sectionItems.length} criterios
                    </Badge>
                  </div>

                  <div className="p-3 space-y-2">
                    {sectionItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 p-2 rounded-lg bg-secondary/30 text-xs border border-border/30"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{item.attribute}</p>
                          {item.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {item.affectation === "critico" || isCritical ? (
                            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30">
                              Error Crítico
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {item.max_score} pts
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
