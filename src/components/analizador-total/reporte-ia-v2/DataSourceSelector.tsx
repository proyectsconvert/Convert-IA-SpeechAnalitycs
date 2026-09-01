import { useState } from "react";
import { Database, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReporteIaSourceMode = "master" | "upload";

interface Props {
  value: ReporteIaSourceMode;
  onChange: (mode: ReporteIaSourceMode) => void;
}

export function DataSourceSelector({ value, onChange }: Props) {
  const items: { mode: ReporteIaSourceMode; label: string; icon: typeof Database; hint: string }[] = [
    { mode: "master", label: "Desde Datos Maestros", icon: Database, hint: "Usa el dataset filtrado actual" },
    { mode: "upload", label: "Subir Excel", icon: Upload, hint: "Archivo .xlsx con las 26 columnas" },
  ];

  return (
    <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
      {items.map((it) => {
        const Icon = it.icon;
        const active = value === it.mode;
        return (
          <button
            key={it.mode}
            type="button"
            onClick={() => onChange(it.mode)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
