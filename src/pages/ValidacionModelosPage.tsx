import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck, AlertTriangle, KeyRound } from "lucide-react";
import { toast } from "sonner";

type Provider = "openai" | "assemblyai" | "deepgram";

interface ProviderResult {
  provider: Provider;
  configured: boolean;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  message?: string;
  details?: unknown;
}

const META: Record<Provider, { name: string; envKey: string; description: string; docsUrl: string }> = {
  openai: {
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    description: "Transcripción y análisis con modelos GPT.",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  assemblyai: {
    name: "AssemblyAI",
    envKey: "ASSEMBLY",
    description: "Transcripción de respaldo con diarización.",
    docsUrl: "https://www.assemblyai.com/app/account",
  },
  deepgram: {
    name: "Deepgram",
    envKey: "DEEPGRAM",
    description: "Transcripción rápida en tiempo real.",
    docsUrl: "https://console.deepgram.com/",
  },
};

export default function ValidacionModelosPage() {
  const [loading, setLoading] = useState<Record<Provider | "all", boolean>>({
    openai: false, assemblyai: false, deepgram: false, all: false,
  });
  const [results, setResults] = useState<Record<Provider, ProviderResult | undefined>>({
    openai: undefined, assemblyai: undefined, deepgram: undefined,
  });
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const run = async (providers: Provider[] | "all") => {
    const list = providers === "all" ? (["openai", "assemblyai", "deepgram"] as Provider[]) : providers;
    setLoading((s) => ({
      ...s,
      ...(providers === "all" ? { all: true } : {}),
      ...Object.fromEntries(list.map((p) => [p, true])),
    }));
    try {
      const { data, error } = await supabase.functions.invoke("validate-model-keys", {
        body: { providers: list },
      });
      if (error) throw error;
      const arr: ProviderResult[] = data?.results ?? [];
      setResults((prev) => {
        const next = { ...prev };
        arr.forEach((r) => { next[r.provider] = r; });
        return next;
      });
      setLastCheck(data?.checked_at ?? new Date().toISOString());
      const failed = arr.filter((r) => !r.ok);
      if (failed.length === 0) toast.success("Todas las APIs respondieron correctamente");
      else toast.error(`${failed.length} proveedor(es) con problemas: ${failed.map((f) => META[f.provider].name).join(", ")}`);
    } catch (e: any) {
      toast.error("No se pudo validar: " + (e?.message ?? "error desconocido"));
    } finally {
      setLoading((s) => ({
        ...s,
        all: false,
        ...Object.fromEntries(list.map((p) => [p, false])),
      }));
    }
  };

  const renderStatusBadge = (r?: ProviderResult, isLoading?: boolean) => {
    if (isLoading) return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando</Badge>;
    if (!r) return <Badge variant="outline">Sin verificar</Badge>;
    if (!r.configured) return <Badge variant="destructive" className="gap-1"><KeyRound className="h-3 w-3" /> Sin clave</Badge>;
    if (r.ok) return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" /> Operativo</Badge>;
    if (r.status === 401) return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Credenciales inválidas</Badge>;
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Falla</Badge>;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Evaluación de Modelos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evaluación y validación de claves API y modelos de transcripción e IA.
          </p>
          {lastCheck && (
            <p className="text-xs text-muted-foreground mt-1">
              Última verificación: {new Date(lastCheck).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={() => run("all")} disabled={loading.all} className="gap-2">
          {loading.all ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Validar todas
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(META) as Provider[]).map((p) => {
          const meta = META[p];
          const r = results[p];
          return (
            <Card key={p} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{meta.name}</CardTitle>
                  {renderStatusBadge(r, loading[p])}
                </div>
                <CardDescription>{meta.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Variable</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded">{meta.envKey}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Código HTTP</span>
                  <span className="font-mono">{r?.status ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Latencia</span>
                  <span className="font-mono">{r?.latencyMs ? `${r.latencyMs} ms` : "—"}</span>
                </div>
                {r?.message && (
                  <div className={`text-xs rounded-md p-2 border ${r.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-destructive/5 border-destructive/30 text-destructive"}`}>
                    {r.message}
                  </div>
                )}
                {r?.details && !r.ok && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Ver respuesta del proveedor</summary>
                    <pre className="mt-2 max-h-48 overflow-auto bg-muted p-2 rounded text-[10px] whitespace-pre-wrap break-all">
                      {typeof r.details === "string" ? r.details : JSON.stringify(r.details, null, 2)}
                    </pre>
                  </details>
                )}
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    Gestionar clave
                  </a>
                  <Button size="sm" variant="outline" onClick={() => run([p])} disabled={loading[p]} className="gap-2">
                    {loading[p] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Probar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">¿Cómo se interpreta el resultado?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Operativo:</strong> el proveedor respondió correctamente con la clave configurada.</p>
          <p><strong className="text-foreground">Credenciales inválidas (401):</strong> la clave existe pero fue rechazada. Generalmente significa que la clave fue rotada, eliminada o no tiene permisos. Genera una nueva clave y actualízala en los secretos de la plataforma.</p>
          <p><strong className="text-foreground">Sin clave:</strong> la variable de entorno no está configurada en el servidor.</p>
          <p><strong className="text-foreground">Falla:</strong> error de red u otro código HTTP. Revisa los detalles para más información.</p>
        </CardContent>
      </Card>
    </div>
  );
}
