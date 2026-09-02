import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { Plus, Minus, Edit, Building2, Trash2, Power, PowerOff, Lock as LockIcon, Layers, Users, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MACROPROCESO_LIST, getMacroprocesoConfig } from "@/lib/analizador-total/macroprocesoConfigs";

export default function CuentasPage() {
  const { user } = useAuth();
  const { refreshAccounts } = useAccount();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"suspend" | "delete">("suspend");
  const [confirmName, setConfirmName] = useState("");
  const [name, setName] = useState("");
  const [macroproceso, setMacroproceso] = useState<string>("ventas");
  const [plan, setPlan] = useState<string>("starter");
  const [maxUsers, setMaxUsers] = useState<number>(10);
  const [maxProcessingMinutes, setMaxProcessingMinutes] = useState<number>(1000);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["all-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: stats } = useQuery({
    queryKey: ["account-stats"],
    queryFn: async () => {
      if (!accounts) return {};
      const result: Record<string, { users: number; files: number }> = {};
      for (const a of accounts) {
        const { count: userCount } = await supabase.from("user_accounts").select("*", { count: "exact", head: true }).eq("account_id", a.id);
        const { count: fileCount } = await supabase.from("audio_files").select("*", { count: "exact", head: true }).eq("account_id", a.id);
        result[a.id] = { users: userCount || 0, files: fileCount || 0 };
      }
      return result;
    },
    enabled: !!accounts?.length,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const { data: newAcc, error } = await supabase.from("accounts").insert({
        name,
        slug,
        macroproceso,
        plan,
        max_users: Number(maxUsers) || 5,
        max_processing_minutes: Number(maxProcessingMinutes) || 1000,
        branding: { macroproceso },
        created_by: user?.id,
      } as any).select().single();
      if (error) throw error;

      if (newAcc?.id) {
        await supabase.from("account_limits").upsert({
          account_id: newAcc.id,
          max_transcription_hours: Math.max(10, Math.round((Number(maxProcessingMinutes) || 1000) / 60)),
          max_chatbot_queries: 500,
          max_whatsapp_conversations: 1000,
          max_presentations: 50,
          max_storage_gb: 10,
          additional_hours: 0,
        }, { onConflict: "account_id" });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["all-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-with-limits"] }),
        queryClient.invalidateQueries({ queryKey: ["account-data"] }),
        queryClient.invalidateQueries({ queryKey: ["account-limits"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-for-metrics"] }),
        refreshAccounts(),
      ]);
      toast.success("Cuenta creada exitosamente");
      setShowNew(false);
      setName("");
      setMacroproceso("ventas");
      setPlan("starter");
      setMaxUsers(10);
      setMaxProcessingMinutes(1000);
    },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editAccount) return;
      const { error } = await supabase.from("accounts").update({
        name,
        macroproceso,
        plan,
        max_users: Number(maxUsers) || 5,
        max_processing_minutes: Number(maxProcessingMinutes) || 1000,
        branding: { ...(editAccount.branding || {}), macroproceso },
      } as any).eq("id", editAccount.id);
      if (error) throw error;

      const hours = Math.max(1, Math.round((Number(maxProcessingMinutes) || 1000) / 60));
      await supabase.from("account_limits").upsert({
        account_id: editAccount.id,
        max_transcription_hours: hours,
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id" });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["all-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-with-limits"] }),
        queryClient.invalidateQueries({ queryKey: ["account-data"] }),
        queryClient.invalidateQueries({ queryKey: ["account-limits"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-for-metrics"] }),
        refreshAccounts(),
      ]);
      toast.success("Cuenta actualizada exitosamente");
      setEditAccount(null);
      setName("");
      setMacroproceso("ventas");
      setPlan("starter");
      setMaxUsers(10);
      setMaxProcessingMinutes(1000);
    },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "inactive" : "active";
      const { error } = await supabase.from("accounts").update({ status: newStatus as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-accounts"] });
      toast.success("Estado actualizado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "suspend" | "delete" }) => {
      if (type === "suspend") {
        const { error } = await supabase.from("accounts").update({ status: "suspended" as any }).eq("id", id);
        if (error) throw error;
      } else {
        console.log("Invoking delete-account for:", id);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa");
        
        const { data, error } = await supabase.functions.invoke("delete-account", {
          body: { account_id: id },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });
        console.log("Delete response:", { data, error });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["all-accounts"] });
      toast.success(variables.type === "suspend" ? "Cuenta suspendida" : "Cuenta eliminada permanentemente");
      setDeleteId(null);
      setConfirmName("");
    },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const openEdit = (account: any) => {
    setName(account.name);
    const mp = (account as any).macroproceso || account.branding?.macroproceso || "ventas";
    setMacroproceso(mp);
    setPlan(account.plan || "starter");
    setMaxUsers(account.max_users ?? 5);
    setMaxProcessingMinutes(account.max_processing_minutes ?? 1000);
    setEditAccount(account);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cuentas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestión de organizaciones, planes y macroprocesos de operación.</p>
        </div>
        <Button onClick={() => {
          setName("");
          setMacroproceso("ventas");
          setPlan("starter");
          setMaxUsers(10);
          setMaxProcessingMinutes(1000);
          setShowNew(true);
        }}>
          <Plus className="w-4 h-4 mr-1" /> Nueva Cuenta
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando cuentas...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts?.map((a: any) => {
          const mpConfig = getMacroprocesoConfig(a.macroproceso || a.branding?.macroproceso || "ventas");
          return (
            <div key={a.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px] gap-1 font-medium bg-muted/40">
                      <span>{mpConfig.emoji}</span> {mpConfig.label}
                    </Badge>
                    <StatusBadge variant={a.status === "active" ? "completed" : a.status === "suspended" ? "error" : "pending"}>
                      {a.status === "active" ? "Activa" : a.status === "suspended" ? "Suspendida" : "Inactiva"}
                    </StatusBadge>
                  </div>
                </div>
                <h3 className="font-semibold text-foreground text-base">{a.name}</h3>
                <p className="text-xs text-muted-foreground mb-3 capitalize">
                  Plan <strong className="text-foreground">{a.plan}</strong> • <strong className="text-foreground">{a.max_users}</strong> usuarios máx
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                  <div className="bg-secondary/60 rounded-lg p-2 text-center">
                    <p className="font-bold text-foreground">{stats?.[a.id]?.users ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Usuarios</p>
                  </div>
                  <div className="bg-secondary/60 rounded-lg p-2 text-center">
                    <p className="font-bold text-foreground">{stats?.[a.id]?.files ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Archivos</p>
                  </div>
                  <div className="bg-secondary/60 rounded-lg p-2 text-center">
                    <p className="font-bold text-foreground">{a.max_processing_minutes}</p>
                    <p className="text-[10px] text-muted-foreground">Min Máx</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border/40">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openEdit(a)}>
                  <Edit className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleStatusMutation.mutate({ id: a.id, status: a.status })}>
                  {a.status === "active" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(a.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showNew || !!editAccount} onOpenChange={(open) => { if (!open) { setShowNew(false); setEditAccount(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editAccount ? "Editar Cuenta y Límites" : "Nueva Cuenta y Configuración"}</DialogTitle>
            <DialogDescription>
              {editAccount ? "Modifica los límites de usuarios, plan, cuota de procesamiento y tipo de operación." : "Crea una nueva cuenta y define su capacidad de usuarios y operación."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Nombre de la cuenta *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Convertia Ventas Latam" />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Tipo de Operación / Macroproceso *</label>
              <Select value={macroproceso} onValueChange={(v) => setMacroproceso(v)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Selecciona el macroproceso" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {MACROPROCESO_LIST.map((mp) => (
                    <SelectItem key={mp.id} value={mp.id} className="text-xs py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{mp.emoji}</span>
                        <div>
                          <span className="font-semibold text-foreground">{mp.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{mp.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Adapta automáticamente los KPIs, gráficos, clasificaciones y análisis de IA según el tipo de operación.
              </p>
            </div>

            {/* Fila: Plan y Usuarios Permitidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/50">
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-foreground">Plan de Suscripción *</label>
                <Select value={plan} onValueChange={(v) => setPlan(v)}>
                  <SelectTrigger className="h-10 text-xs capitalize">
                    <SelectValue placeholder="Selecciona el plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter" className="text-xs">Starter (Básico)</SelectItem>
                    <SelectItem value="pro" className="text-xs">Pro (Avanzado)</SelectItem>
                    <SelectItem value="enterprise" className="text-xs">Enterprise (Corporativo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center justify-between text-foreground">
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" /> Usuarios Permitidos *</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setMaxUsers((prev) => Math.max(1, prev - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-10 text-xs text-center font-bold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setMaxUsers((prev) => prev + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Minutos Máximos de Procesamiento */}
            <div className="pt-1">
              <label className="text-xs font-semibold mb-1.5 flex items-center justify-between text-foreground">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-primary" /> Minutos de Audio Mensuales</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  ≈ {(maxProcessingMinutes / 60).toFixed(1)} horas/mes
                </span>
              </label>
              <Input
                type="number"
                min={100}
                step={500}
                value={maxProcessingMinutes}
                onChange={(e) => setMaxProcessingMinutes(Math.max(100, parseInt(e.target.value) || 1000))}
                className="h-10 text-xs font-mono"
                placeholder="Ej: 1000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditAccount(null); }}>Cancelar</Button>
            <Button
              onClick={() => editAccount ? updateMutation.mutate() : createMutation.mutate()}
              disabled={!name || createMutation.isPending || updateMutation.isPending}
            >
              {editAccount ? "Guardar Cambios" : "Crear Cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action confirmation: Suspend vs Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) { setDeleteId(null); setConfirmName(""); } }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Gestión de Cuenta
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Qué acción deseas realizar con esta cuenta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex gap-4">
              <button 
                onClick={() => setActionType("suspend")}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-left space-y-1 ${actionType === "suspend" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
              >
                <p className="font-semibold text-sm">Suspender</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Inhabilita el acceso pero conserva los datos. Reversible.</p>
              </button>
              <button 
                onClick={() => setActionType("delete")}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-left space-y-1 ${actionType === "delete" ? "border-destructive bg-destructive/5" : "border-border hover:border-border/80"}`}
              >
                <p className="font-semibold text-sm text-destructive">Borrar Todo</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Elimina permanentemente DB y Storage. Irreversible.</p>
              </button>
            </div>

            {actionType === "delete" && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
                  <LockIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <strong>¡ALERTA!:</strong> Esta acción borrará transcripciones, audios, análisis y configuraciones. 
                    No hay forma de recuperar nada una vez procesado.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Escribe el nombre de la cuenta "<strong>{accounts?.find(a => a.id === deleteId)?.name}</strong>" para confirmar:
                  </label>
                  <Input 
                    value={confirmName} 
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder="Escribir nombre de cuenta..."
                    className="border-destructive/30 focus-visible:ring-destructive"
                  />
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                if (actionType === "delete" && confirmName !== accounts?.find(a => a.id === deleteId)?.name) {
                  e.preventDefault();
                  toast.error("El nombre de la cuenta no coincide");
                  return;
                }
                deleteId && deleteMutation.mutate({ id: deleteId, type: actionType });
              }} 
              disabled={deleteMutation.isPending || (actionType === "delete" && !confirmName)}
              className={actionType === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {deleteMutation.isPending ? "Procesando..." : actionType === "delete" ? "BORRAR DEFINITIVAMENTE" : "Confirmar Suspensión"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
