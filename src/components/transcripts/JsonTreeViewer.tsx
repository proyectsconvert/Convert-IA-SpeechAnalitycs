import { useState, useMemo } from "react";
import { Copy, Check, ChevronRight, ChevronDown, Search, X, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

interface JsonTreeViewerProps {
  data: unknown;
  rootTitle?: string;
  defaultExpanded?: boolean;
}

interface JsonNodeProps {
  name?: string;
  value: unknown;
  isLast?: boolean;
  depth?: number;
  searchTerm?: string;
  forceExpandAll?: boolean | null;
}

function JsonNode({
  name,
  value,
  isLast = true,
  depth = 0,
  searchTerm = "",
  forceExpandAll = null,
}: JsonNodeProps) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  // Sync forced expand/collapse if changed
  const isExpanded = forceExpandAll !== null ? forceExpandAll : isOpen;

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);

  const entries = useMemo(() => {
    if (!isObject) return [];
    if (isArray) {
      return (value as unknown[]).map((v, i) => ({ key: String(i), val: v }));
    }
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, val: v }));
  }, [value, isObject, isArray]);

  const matchesSearch = useMemo(() => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    if (name && name.toLowerCase().includes(term)) return true;
    if (!isObject && String(value).toLowerCase().includes(term)) return true;
    if (isObject) {
      return JSON.stringify(value).toLowerCase().includes(term);
    }
    return false;
  }, [name, value, isObject, searchTerm]);

  if (searchTerm && !matchesSearch) {
    return null;
  }

  const renderValue = (val: unknown) => {
    if (val === null) return <span className="text-red-400 font-mono">null</span>;
    if (val === undefined) return <span className="text-muted-foreground font-mono">undefined</span>;
    if (typeof val === "boolean")
      return <span className="text-purple-400 font-mono">{String(val)}</span>;
    if (typeof val === "number")
      return <span className="text-amber-400 font-mono">{val}</span>;
    if (typeof val === "string")
      return (
        <span className="text-emerald-400 font-mono break-all">
          "{val}"
        </span>
      );
    return <span className="text-foreground font-mono">{String(val)}</span>;
  };

  if (!isObject) {
    return (
      <div className="flex items-start gap-1.5 py-0.5 text-xs hover:bg-muted/30 px-1 rounded transition-colors">
        {name !== undefined && (
          <span className="text-cyan-400 font-medium font-mono select-none">
            {isArray ? `[${name}]:` : `"${name}":`}
          </span>
        )}
        <div className="flex-1 min-w-0">{renderValue(value)}</div>
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  const count = entries.length;
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div className="py-0.5 text-xs">
      <div
        className="flex items-center gap-1.5 hover:bg-muted/30 px-1 py-0.5 rounded cursor-pointer select-none group"
        onClick={() => setIsOpen(!isExpanded)}
      >
        <button type="button" className="p-0.5 text-muted-foreground group-hover:text-foreground">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {name !== undefined && (
          <span className="text-cyan-400 font-semibold font-mono">
            {isArray ? `[${name}]:` : `"${name}":`}
          </span>
        )}

        <span className="text-muted-foreground font-mono">
          {bracketOpen}
          {!isExpanded && (
            <span className="text-[11px] text-muted-foreground/70 px-1 font-sans">
              {count} {count === 1 ? "ítem" : "ítems"}
            </span>
          )}
          {!isExpanded && bracketClose}
        </span>
      </div>

      {isExpanded && (
        <div className="pl-4 border-l border-border/60 ml-2.5 my-0.5 space-y-0.5">
          {entries.map((item, idx) => (
            <JsonNode
              key={item.key}
              name={item.key}
              value={item.val}
              isLast={idx === entries.length - 1}
              depth={depth + 1}
              searchTerm={searchTerm}
              forceExpandAll={forceExpandAll}
            />
          ))}
          <div className="text-muted-foreground font-mono pl-1">{bracketClose}</div>
        </div>
      )}
    </div>
  );
}

export function JsonTreeViewer({ data, rootTitle = "Datos JSON", defaultExpanded = true }: JsonTreeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [forceExpandAll, setForceExpandAll] = useState<boolean | null>(defaultExpanded ? true : null);

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "{}";
    }
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      toast.success("JSON copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el JSON");
    }
  };

  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return (
      <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card/40">
        <p className="text-sm">No hay información JSON registrada para esta llamada.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
      {/* Header with Search and Actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {rootTitle}
          </span>
          <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full font-mono text-muted-foreground">
            {typeof data === "object" && data !== null ? `${Object.keys(data as object).length} campos` : "Primitivo"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en JSON..."
              className="h-7 pl-8 pr-7 text-xs w-44 sm:w-56 bg-background"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setForceExpandAll(forceExpandAll ? false : true)}
            title={forceExpandAll ? "Colapsar todos" : "Expandir todos"}
          >
            {forceExpandAll ? <Minimize2 className="w-3.5 h-3.5 mr-1" /> : <Maximize2 className="w-3.5 h-3.5 mr-1" />}
            {forceExpandAll ? "Colapsar" : "Expandir"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5 gap-1.5"
            onClick={handleCopy}
            title="Copiar JSON completo"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copiado" : "Copiar"}</span>
          </Button>
        </div>
      </div>

      {/* JSON Tree Content */}
      <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto bg-black/25 font-mono text-xs">
        <JsonNode
          value={data}
          depth={0}
          searchTerm={searchTerm}
          forceExpandAll={forceExpandAll}
        />
      </div>
    </div>
  );
}
