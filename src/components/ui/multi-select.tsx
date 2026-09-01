import { useState, useMemo } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  className?: string;
  triggerClassName?: string;
  searchable?: boolean;
  maxBadges?: number;
}

/**
 * Multi-select con popover + checkboxes. Lista vacía = "Todos".
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Seleccionar...",
  allLabel = "Todos",
  className,
  triggerClassName,
  searchable = true,
  maxBadges = 2,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const label =
    selected.length === 0
      ? allLabel
      : selected.length <= maxBadges
        ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
        : `${selected.length} seleccionados`;

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn(
              "h-9 w-full justify-between text-xs font-normal rounded-lg",
              selected.length === 0 && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="truncate">{label}</span>
            <div className="flex items-center gap-1 ml-2">
              {selected.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded-sm opacity-60 hover:opacity-100 cursor-pointer"
                  onClick={clearAll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChange([]);
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          {searchable && (
            <div className="p-2 border-b">
              <Input
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
          <div className="max-h-[260px] overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Sin resultados</div>
            )}
            {filtered.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left",
                    checked && "bg-accent/40",
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate flex-1">{opt.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-2 flex justify-between">
              <span className="text-[10px] text-muted-foreground self-center">
                {selected.length} seleccionado(s)
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
                Limpiar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
