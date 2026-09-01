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
import {
  Link2,
  Copy,
  Eye,
  Lock,
  Calendar,
  ShieldOff,
  Trash2,
  Globe,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string | undefined;
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
  label: string | null;
  created_at: string;
}

function buildPublicUrl(token: string): string {
  return `${window.location.origin}/d/${token}`;
}

function defaultExpiration(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShareDashboardDialog({
  open,
  onOpenChange,
  accountId,
}: Props) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form
  const [expiresAt, setExpiresAt] = useState(defaultExpiration());
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");

  const fetchShares = async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("shared_dashboards")
      .select("*")
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
      setLabel("");
    }
  }, [open, accountId]);

  const handleCreate = async () => {
    if (!accountId) return;
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
      const { data, error } = await supabase.functions.invoke("create-dashboard-share", {
        body: {
          account_id: accountId,
          expires_at: expiresDate.toISOString(),
          password: usePassword ? password : null,
          label: label.trim() || null,
          config: { tabs: ["visual", "agents"] }
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Link compartido creado");
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
      .from("shared_dashboards")
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Error al revocar: " + error.message);
    } else {
      toast.success("Link revocado");
      void fetchShares();
    }
  };

  const copyUrl = async (token: string) => {
    await navigator.clipboard.writeText(buildPublicUrl(token));
    toast.success("Link copiado al portapapeles");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Compartir Dashboard en Tiempo Real
          </DialogTitle>
          <DialogDescription>
            Genera un enlace público para que interesados externos vean el "Centro Visual" y "Agentes" con datos actualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Nuevo link de acceso
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Expiración</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etiqueta (opcional)</Label>
              <Input
                placeholder="Ej: Dashboard Gerencia"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm cursor-pointer" htmlFor="use-pwd-dash">
                Proteger con contraseña
              </Label>
            </div>
            <Switch id="use-pwd-dash" checked={usePassword} onCheckedChange={setUsePassword} />
          </div>
          {usePassword && (
            <Input
              type="text"
              placeholder="Contraseña (mín. 4 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <Button onClick={handleCreate} disabled={creating || !accountId} className="w-full">
            {creating ? "Creando..." : "Generar link público"}
          </Button>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Links activos ({shares.filter((s) => !s.revoked).length})
          </h3>

          {loading && <p className="text-xs text-muted-foreground">Cargando...</p>}
          
          <div className="space-y-2">
            {shares.map((s) => {
              const expired = new Date(s.expires_at) <= new Date();
              const status = s.revoked
                ? { label: "Revocado", color: "bg-destructive/10 text-destructive" }
                : expired
                ? { label: "Expirado", color: "bg-muted text-muted-foreground" }
                : { label: "Activo", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };

              return (
                <div key={s.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={status.color + " border-0 text-[10px]"}>{status.label}</Badge>
                        {s.label && <span className="text-xs font-medium truncate">{s.label}</span>}
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
                          className="h-8 px-2 text-amber-600"
                          onClick={() => handleRevoke(s.id)}
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expira {format(new Date(s.expires_at), "dd/MM/yy HH:mm")}
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {s.view_count} vistas
                    </div>
                    {s.last_viewed_at && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Visto {format(new Date(s.last_viewed_at), "dd/MM HH:mm")}
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
