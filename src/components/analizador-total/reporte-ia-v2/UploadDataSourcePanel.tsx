import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2, Eye, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseXlsxFile, isXlsxFile, type ParsedXlsx } from "@/lib/analizador-total/parseXlsxClient";

interface Props {
  parsed: ParsedXlsx | null;
  fileMeta: { name: string; size: number } | null;
  isAnalyzing: boolean;
  onParsed: (file: File, parsed: ParsedXlsx) => void;
  onClear: () => void;
  onOpenColumnsDrawer: () => void;
  onGenerate: () => void;
}

export function UploadDataSourcePanel({
  parsed,
  fileMeta,
  isAnalyzing,
  onParsed,
  onClear,
  onOpenColumnsDrawer,
  onGenerate,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleFile = async (file: File) => {
    setParseError(null);
    if (!isXlsxFile(file)) {
      setParseError("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setParsing(true);
    try {
      const result = await parseXlsxFile(file);
      onParsed(file, result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Error al leer el archivo");
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  if (!parsed) {
    return (
      <Card className="border border-border bg-card p-5 sm:p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/50",
          )}
        >
          <div className="mb-3 rounded-full bg-primary/10 p-4">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base font-semibold text-foreground">
            {parsing ? "Procesando archivo…" : "Arrastra tu .xlsx aquí o haz clic para seleccionar"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Máximo 20 MB · hasta 5.000 filas · esquema de 26 columnas del Excel maestro
          </p>
          {parsing && <Loader2 className="mt-3 h-5 w-5 animate-spin text-primary" />}
          {parseError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {parseError}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </Card>
    );
  }

  const { validation } = parsed;

  return (
    <Card className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        {/* File info */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{fileMeta?.name ?? "archivo.xlsx"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{fileMeta ? (fileMeta.size / 1024).toFixed(1) : "—"} KB</span>
                <span>·</span>
                <span className="font-semibold text-foreground">{parsed.rowCount.toLocaleString("es")} filas</span>
                <span>·</span>
                <span>{parsed.headers.length} columnas detectadas</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
            <X className="h-3.5 w-3.5" /> Reemplazar archivo
          </Button>
        </div>

        {/* Validation */}
        {validation.missingCritical.length > 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Faltan columnas críticas
            </div>
            <p className="text-destructive/90">
              {validation.missingCritical.join(", ")}
            </p>
            <p className="mt-1 text-muted-foreground">
              Sin estas columnas no se puede generar un informe confiable. Reemplaza el archivo.
            </p>
          </div>
        ) : validation.missingOptional.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Faltan columnas secundarias
            </div>
            <p className="text-amber-700/90 dark:text-amber-300/90">
              {validation.missingOptional.slice(0, 6).join(", ")}
              {validation.missingOptional.length > 6 && ` (+${validation.missingOptional.length - 6})`}
            </p>
            <p className="mt-1 text-muted-foreground">El análisis será parcial pero se puede generar.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Las 26 columnas están presentes
            </div>
          </div>
        )}

        {/* Preview */}
        <div>
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {showPreview ? "Ocultar preview" : "Ver preview de las primeras 5 filas"}
          </button>
          {showPreview && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {parsed.headers.slice(0, 8).map((h) => (
                      <th key={h} className="border-b border-border px-2 py-1.5 text-left font-semibold">{h}</th>
                    ))}
                    {parsed.headers.length > 8 && (
                      <th className="border-b border-border px-2 py-1.5 text-left text-muted-foreground">
                        +{parsed.headers.length - 8} cols
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      {parsed.headers.slice(0, 8).map((h) => (
                        <td key={h} className="border-b border-border/40 px-2 py-1.5 text-foreground/90">
                          <span className="line-clamp-1 max-w-[180px] block">{String(row[h] ?? "")}</span>
                        </td>
                      ))}
                      {parsed.headers.length > 8 && <td className="border-b border-border/40 px-2 py-1.5">…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" size="sm" onClick={onOpenColumnsDrawer} className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Columnas consideradas (26)
          </Button>
          <Button
            onClick={onGenerate}
            disabled={isAnalyzing || !validation.ok || parsed.rowCount === 0}
            className="gap-1.5"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generar reporte
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
