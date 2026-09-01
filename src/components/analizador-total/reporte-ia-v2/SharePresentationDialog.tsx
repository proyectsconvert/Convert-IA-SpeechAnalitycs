import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useIsSuperadmin } from "@/hooks/useIsSuperadmin";
import {
  Link2,
  Copy,
  Eye,
  Lock,
  Calendar,
  ShieldOff,
  Trash2,
  Download,
  CheckCircle2,
  Globe,
  Clock,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presentationId: string | null;
  accountId: string | undefined;
  presentationTitle?: string;
}

interface ShareRow {
  id: string;
  token: string;
  expires_at: string;
  password_hash: string | null;
  revoked: boolean;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  last_viewer_ip: string | null;
  allow_pdf_download: boolean;
  label: string | null;
  created_at: string;
}

function buildPublicUrl(token: string): string {
  return `${window.location.origin}/v/${token}`;
}

function defaultExpiration(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(23, 59, 0, 0);
  // datetime-local format: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SharePresentationDialog({
  open,
  onOpenChange,
  presentationId,
  accountId,
  presentationTitle,
}: Props) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const isSuperadmin = useIsSuperadmin();

  // Form
  const [expiresAt, setExpiresAt] = useState(defaultExpiration());
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [allowPdf, setAllowPdf] = useState(true);
  const [label, setLabel] = useState("");

  const fetchShares = async () => {
    if (!presentationId || !accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("shared_presentations")
      .select("*")
      .eq("presentation_id", presentationId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Error al cargar links: " + error.message);
    } else {
      setShares((data ?? []) as ShareRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      void fetchShares();
      setExpiresAt(defaultExpiration());
      setPassword("");
      setUsePassword(false);
      setAllowPdf(true);
      setLabel("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presentationId]);

  const handleCreate = async () => {
    if (!presentationId || !accountId) {
      toast.error("Guarda primero la presentación");
      return;
    }
    if (!expiresAt) {
      toast.error("Define una fecha de expiración");
      return;
    }
    const expiresDate = new Date(expiresAt);
    if (isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      toast.error("La fecha de expiración debe ser futura");
      return;
    }
    if (usePassword && password.length < 4) {
      toast.error("La contraseña debe tener al menos 4 caracteres");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-share-link", {
        body: {
          presentation_id: presentationId,
          account_id: accountId,
          expires_at: expiresDate.toISOString(),
          password: usePassword ? password : null,
          allow_pdf_download: allowPdf,
          label: label.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Link creado");
      setPassword("");
      setLabel("");
      void fetchShares();
    } catch (e: any) {
      toast.error("No se pudo crear el link: " + (e?.message ?? e));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("¿Revocar este link? Los visitantes dejarán de tener acceso inmediatamente.")) return;
    const { error } = await supabase
      .from("shared_presentations")
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Error al revocar: " + error.message);
    } else {
      toast.success("Link revocado");
      void fetchShares();
    }
  };

  const handleDelete = async (id: string) => {
    if (!isSuperadmin) {
      toast.error("Solo Superadmin puede eliminar links compartidos");
      return;
    }
    if (!confirm("¿Eliminar permanentemente este link y su historial de accesos?")) return;
    const { error } = await supabase.from("shared_presentations").delete().eq("id", id);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
    } else {
      toast.success("Link eliminado");
      void fetchShares();
    }
  };

  const copyUrl = async (token: string) => {
    await navigator.clipboard.writeText(buildPublicUrl(token));
    toast.success("Link copiado al portapapeles");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Compartir Resumen Ejecutivo
          </DialogTitle>
          <DialogDescription>
            Genera un link público seguro para compartir <strong>{presentationTitle || "esta presentación"}</strong> con
            personas externas. Solo verán el resumen ejecutivo en modo lectura, sin acceso a datos crudos ni a la plataforma.
          </DialogDescription>
        </DialogHeader>

        {/* Crear nuevo link */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Nuevo link de acceso
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Expira el (fecha y hora exactas)
              </Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etiqueta interna (opcional)</Label>
              <Input
                placeholder="Ej: Cliente Acme · Marzo"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm cursor-pointer" htmlFor="use-pwd">
                  Proteger con contraseña
                </Label>
              </div>
              <Switch id="use-pwd" checked={usePassword} onCheckedChange={setUsePassword} />
            </div>
            {usePassword && (
              <Input
                type="text"
                placeholder="Contraseña (mín. 4 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9"
              />
            )}

            <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm cursor-pointer" htmlFor="allow-pdf">
                  Permitir descarga del PDF del resumen
                </Label>
              </div>
              <Switch id="allow-pdf" checked={allowPdf} onCheckedChange={setAllowPdf} />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating || !presentationId} className="w-full">
            {creating ? "Creando..." : "Generar link público"}
          </Button>

          {!presentationId && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ Guarda primero la presentación para poder compartirla.
            </p>
          )}
        </div>

        <Separator />

        {/* Lista de links */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Links activos ({shares.filter((s) => !s.revoked).length})
          </h3>

          {loading && <p className="text-xs text-muted-foreground">Cargando...</p>}
          {!loading && shares.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-4 text-center">
              Aún no hay links compartidos para esta presentación.
            </p>
          )}

          <div className="space-y-2">
            {shares.map((s) => {
              const expired = new Date(s.expires_at) <= new Date();
              const status = s.revoked
                ? { label: "Revocado", color: "bg-destructive/10 text-destructive" }
                : expired
                ? { label: "Expirado", color: "bg-muted text-muted-foreground" }
                : { label: "Activo", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };

              return (
                <div key={s.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={status.color + " border-0 text-[10px]"}>{status.label}</Badge>
                        {s.password_hash && (
                          <Badge variant="outline" className="text-[10px]">
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Con contraseña
                          </Badge>
                        )}
                        {!s.allow_pdf_download && (
                          <Badge variant="outline" className="text-[10px]">PDF bloqueado</Badge>
                        )}
                        {s.label && (
                          <span className="text-xs font-medium text-foreground truncate">{s.label}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                        {buildPublicUrl(s.token)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => copyUrl(s.token)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!s.revoked && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-amber-600 hover:text-amber-700"
                          onClick={() => handleRevoke(s.id)}
                          title="Revocar"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isSuperadmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(s.id)}
                          title="Solo Superadmin. El consumo no se descuenta."
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expira {format(new Date(s.expires_at), "dd MMM yyyy HH:mm")}
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {s.view_count} {s.view_count === 1 ? "vista" : "vistas"}
                    </div>
                    {s.last_viewed_at && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Último: {format(new Date(s.last_viewed_at), "dd MMM HH:mm")}
                      </div>
                    )}
                    {s.last_viewer_ip && (
                      <div className="truncate" title={s.last_viewer_ip}>
                        IP: {s.last_viewer_ip}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
