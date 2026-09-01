import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, FileType } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExportFormat = "csv" | "xlsx" | "txt";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat) => void;
  title?: string;
}

const formats: { id: ExportFormat; label: string; desc: string; icon: typeof FileSpreadsheet }[] = [
  { id: "csv", label: "CSV", desc: "Compatible con Excel, Google Sheets", icon: FileSpreadsheet },
  { id: "xlsx", label: "Excel (XLSX)", desc: "Formato nativo de Excel con formato", icon: FileType },
  { id: "txt", label: "Texto (TXT)", desc: "Archivo de texto plano", icon: FileText },
];

export function ExportFormatDialog({ open, onOpenChange, onExport, title = "Exportar Datos" }: Props) {
  const [selected, setSelected] = useState<ExportFormat>("csv");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Selecciona el formato de descarga.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {formats.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                selected === f.id
                  ? "border-accent bg-accent/5 ring-2 ring-accent/20"
                  : "border-border hover:border-accent/30 hover:bg-secondary/50"
              )}
            >
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", selected === f.id ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground")}>
                <f.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onExport(selected); onOpenChange(false); }}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
