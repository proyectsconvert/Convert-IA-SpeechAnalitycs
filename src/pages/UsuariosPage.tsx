import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, MoreVertical, KeyRound, UserX, UserCheck, Edit, Trash2, Eye, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

type MemberRow = {
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  full_name: string;
  avatar_url?: string | null;
  email: string;
  initials: string;
};

/** Borrador de membresías por cuenta (solo superadmin al editar) */
type MembershipDraft = Record<string, { included: boolean; role: string }>;

export default function UsuariosPage() {
  const { currentAccount, allAccounts } = useAccount();
  const { profile } = useAuth();
  const accountId = currentAccount?.account_id;
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<MemberRow | null>(null);
  const [logsUser, setLogsUser] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "analyst" as string, accountIds: [] as string[] });
  const [editRole, setEditRole] = useState("");
  const [membershipDraft, setMembershipDraft] = useState<MembershipDraft>({});

  const { data: members, isLoading } = useQuery({
    queryKey: ["account-members", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data: userAccounts } = await supabase.from("user_accounts").select("user_id, role, is_active, created_at").eq("account_id", accountId);
      if (!userAccounts?.length) return [];
      const userIds = userAccounts.map((ua) => ua.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds);
      let emailMap: Record<string, string> = {};
      try {
        const { data } = await supabase.functions.invoke("getAllUserEmails", { body: { userIds } });
        emailMap = data?.emails || {};
      } catch { /* */ }
      return userAccounts.map((ua) => {
        const prof = profiles?.find((p) => p.id === ua.user_id);
        return {
          ...ua,
          full_name: prof?.full_name || "Usuario",
          avatar_url: prof?.avatar_url,
          email: emailMap[ua.user_id] || "",
          initials: (prof?.full_name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
        } as MemberRow;
      });
    },
    enabled: !!accountId,
  });

  const { data: editMemberships } = useQuery({
    queryKey: ["user-all-memberships", editUser?.user_id],
    queryFn: async () => {
      if (!editUser?.user_id) return [];
      const { data, error } = await supabase
        .from("user_accounts")
        .select("account_id, role, is_active")
        .eq("user_id", editUser.user_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(editUser?.user_id && profile?.is_superadmin),
  });

  useEffect(() => {
    if (!profile?.is_superadmin || !allAccounts.length || !editUser) {
      setMembershipDraft({});
      return;
    }
    if (editMemberships === undefined) return;
    const byAcc = Object.fromEntries(editMemberships.map((x) => [x.account_id, x]));
    const draft: MembershipDraft = {};
    for (const acc of allAccounts) {
      const row = byAcc[acc.id];
      draft[acc.id] = {
        included: Boolean(row?.is_active),
        role: (row?.role as string) || "analyst",
      };
    }
    setMembershipDraft(draft);
  }, [editUser?.user_id, editMemberships, profile?.is_superadmin, allAccounts]);

  const { data: userLogs } = useQuery({
    queryKey: ["user-logs", logsUser],
    queryFn: async () => {
      if (!logsUser) return [];
      const { data } = await supabase.from("audit_logs").select("*").eq("user_id", logsUser).order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!logsUser,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const acctIds = form.accountIds.length > 0 ? form.accountIds : (accountId ? [accountId] : []);
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: form.email, password: form.password, fullName: form.fullName, role: form.role, accountIds: acctIds },
      });
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      if (error) throw new Error(error.message || payload?.error || "Error al invocar create-user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-members"] });
      toast.success("Usuario creado");
      setShowNew(false);
      setForm({ email: "", password: "", fullName: "", role: "analyst", accountIds: [] });
    },
    onError: (err: any) => toast.error("Error: " + (err.message || "Error")),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("update-user-password", {
        body: { userId, newPassword: password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => { toast.success("Contraseña actualizada"); setShowPassword(null); setNewPassword(""); },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("user_accounts").update({ is_active: !isActive }).eq("user_id", userId).eq("account_id", accountId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-members"] }); toast.success("Estado actualizado"); },
  });

  const saveEditUserMutation = useMutation({
    mutationFn: async () => {
      if (!editUser || !accountId) return;

      if (profile?.is_superadmin) {
        const userId = editUser.user_id;
        const selected = Object.entries(membershipDraft).filter(([, v]) => v.included);
        const selectedIds = new Set(selected.map(([id]) => id));

        const { data: existingRows, error: exErr } = await supabase.from("user_accounts").select("account_id").eq("user_id", userId);
        if (exErr) throw exErr;
        const existingIds = new Set((existingRows ?? []).map((r) => r.account_id));

        for (const id of existingIds) {
          if (!selectedIds.has(id)) {
            const { error } = await supabase.from("user_accounts").delete().eq("user_id", userId).eq("account_id", id);
            if (error) throw error;
          }
        }

        const upserts = selected.map(([aid, v]) => ({
          user_id: userId,
          account_id: aid,
          role: v.role as any,
          is_active: true,
        }));

        if (upserts.length > 0) {
          const { error: upErr } = await supabase.from("user_accounts").upsert(upserts, { onConflict: "user_id,account_id" });
          if (upErr) throw upErr;
        }
        return;
      }

      const { error } = await supabase.from("user_accounts").update({ role: editRole as any }).eq("user_id", editUser.user_id).eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-members"] });
      queryClient.invalidateQueries({ queryKey: ["user-all-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["effective-role-permissions"] });
      toast.success("Usuario actualizado");
      setEditUser(null);
    },
    onError: (err: Error) => toast.error(err.message || "Error al guardar"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_accounts").delete().eq("user_id", userId).eq("account_id", accountId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-members"] }); toast.success("Usuario removido de la cuenta"); },
  });

  const roleLabels: Record<string, string> = {
    superadmin: "Superadmin", admin: "Administrador", supervisor: "Supervisor", analyst: "Analista", observer: "Observador",
  };
  const roleVariant = (role: string) => {
    if (role === "superadmin" || role === "admin") return "active" as const;
    if (role === "supervisor") return "processing" as const;
    return "pending" as const;
  };

  const openEditUser = (m: MemberRow) => {
    setEditUser(m);
    setEditRole(m.role);
  };

  const updateDraft = (account_id: string, patch: Partial<{ included: boolean; role: string }>) => {
    setMembershipDraft((prev) => ({
      ...prev,
      [account_id]: {
        included: patch.included ?? prev[account_id]?.included ?? false,
        role: patch.role ?? prev[account_id]?.role ?? "analyst",
      },
    }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Miembros del equipo, roles y permisos de acceso.</p>
        </div>
        {profile?.is_superadmin && (
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" /> Crear Usuario</Button>
        )}
      </div>

      {profile?.is_superadmin && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-card/50 px-4 py-3">
          Como <strong>superadministrador</strong>, tu perfil tiene acceso a todas las cuentas y a las operaciones (incluida la carga de audio) sin depender de la tabla de membresías.
          Usa <strong>Editar usuario</strong> solo para asignar cuentas a <em>otros</em> usuarios.
        </p>
      )}

      <div className="bg-card rounded-xl border border-border">
        <div className="flex items-center justify-between p-5">
          <h2 className="font-semibold text-foreground">Miembros de la Cuenta</h2>
          <span className="text-xs bg-secondary px-3 py-1 rounded-full font-medium text-muted-foreground">{members?.length || 0} Total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Rol</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Desde</th>
                <th className="w-12 px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Cargando...</td></tr>
              ) : !members?.length ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No hay miembros.</td></tr>
              ) : members.map((m) => (
                <tr key={m.user_id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{m.initials}</AvatarFallback></Avatar>
                      <p className="font-medium text-foreground">{m.full_name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground text-xs">{m.email || "—"}</td>
                  <td className="px-5 py-4"><StatusBadge variant={roleVariant(m.role)} dot={false}>{roleLabels[m.role] || m.role}</StatusBadge></td>
                  <td className="px-5 py-4"><StatusBadge variant={m.is_active ? "completed" : "error"}>{m.is_active ? "Activo" : "Inactivo"}</StatusBadge></td>
                  <td className="px-5 py-4 text-muted-foreground text-xs">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button className="p-1.5 rounded hover:bg-secondary"><MoreVertical className="w-4 h-4" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditUser(m)}>
                          <Edit className="w-4 h-4 mr-2" /> Editar usuario
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setShowPassword(m.user_id); setNewPassword(""); }}>
                          <KeyRound className="w-4 h-4 mr-2" /> Cambiar Contraseña
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActiveMutation.mutate({ userId: m.user_id, isActive: m.is_active })}>
                          {m.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                          {m.is_active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLogsUser(m.user_id)}>
                          <Eye className="w-4 h-4 mr-2" /> Ver Logs
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteUserMutation.mutate(m.user_id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Remover de Cuenta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Crear Usuario</DialogTitle><DialogDescription>Crea un nuevo usuario y asígnalo a cuentas.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-xs font-medium mb-1 block">Nombre *</label><Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
            <div><label className="text-xs font-medium mb-1 block">Email *</label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><label className="text-xs font-medium mb-1 block">Contraseña *</label><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
            <div>
              <label className="text-xs font-medium mb-1 block">Rol</label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profile?.is_superadmin && <SelectItem value="superadmin">Superadmin</SelectItem>}
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="analyst">Analista</SelectItem>
                  <SelectItem value="observer">Observador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {profile?.is_superadmin && allAccounts.length > 1 && (
              <div>
                <label className="text-xs font-medium mb-1 block">Cuentas</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {allAccounts.map((acc) => (
                    <label key={acc.id} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-secondary">
                      <input type="checkbox" checked={form.accountIds.includes(acc.id)} onChange={(e) => setForm((f) => ({ ...f, accountIds: e.target.checked ? [...f.accountIds, acc.id] : f.accountIds.filter((id) => id !== acc.id) }))} className="rounded border-input" />
                      {acc.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.email || !form.password || !form.fullName || createMutation.isPending}>
              {createMutation.isPending ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              {editUser?.full_name}
              {profile?.is_superadmin
                ? " — Marca las cuentas a las que tendrá acceso y el rol en cada una."
                : " — Cambia el rol en la cuenta actual."}
            </DialogDescription>
          </DialogHeader>

          {!profile?.is_superadmin && (
            <div className="space-y-2">
              <label className="text-xs font-medium">Rol en esta cuenta</label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="analyst">Analista</SelectItem>
                  <SelectItem value="observer">Observador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {profile?.is_superadmin && (
            <div className="space-y-3">
              {!editMemberships ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando cuentas…
                </div>
              ) : (
                <div className="rounded-lg border border-border max-h-[50vh] overflow-y-auto divide-y divide-border">
                  {allAccounts.map((acc) => {
                    const row = membershipDraft[acc.id];
                    const included = row?.included ?? false;
                    const r = row?.role ?? "analyst";
                    return (
                      <div key={acc.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-secondary/30">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Checkbox
                            checked={included}
                            onCheckedChange={(c) => updateDraft(acc.id, { included: c === true })}
                            id={`acc-${acc.id}`}
                          />
                          <label htmlFor={`acc-${acc.id}`} className="text-sm font-medium truncate cursor-pointer">
                            {acc.name}
                            {acc.id === accountId ? (
                              <span className="text-muted-foreground font-normal"> (vista actual)</span>
                            ) : null}
                          </label>
                        </div>
                        {included && (
                          <Select value={r} onValueChange={(v) => updateDraft(acc.id, { role: v })}>
                            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                              <SelectItem value="analyst">Analista</SelectItem>
                              <SelectItem value="observer">Observador</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button
              onClick={() => saveEditUserMutation.mutate()}
              disabled={saveEditUserMutation.isPending || (profile?.is_superadmin && !editMemberships)}
            >
              {saveEditUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showPassword} onOpenChange={() => setShowPassword(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar Contraseña</DialogTitle><DialogDescription>Nueva contraseña para el usuario.</DialogDescription></DialogHeader>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPassword(null)}>Cancelar</Button>
            <Button onClick={() => showPassword && resetPasswordMutation.mutate({ userId: showPassword, password: newPassword })} disabled={newPassword.length < 6 || resetPasswordMutation.isPending}>
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logsUser} onOpenChange={() => setLogsUser(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Actividad del Usuario</DialogTitle><DialogDescription>Últimos 20 registros de actividad</DialogDescription></DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <div className="overflow-x-auto w-full">
              {!userLogs?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin actividad registrada.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="text-left py-2 px-2">Fecha</th><th className="text-left py-2 px-2">Módulo</th><th className="text-left py-2 px-2">Acción</th><th className="text-left py-2 px-2">Detalle</th></tr></thead>
                  <tbody>
                    {userLogs.map((log) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{format(new Date(log.created_at), "dd/MM HH:mm")}</td>
                        <td className="py-2 px-2">{log.module}</td>
                        <td className="py-2 px-2">{log.action}</td>
                        <td className="py-2 px-2 text-muted-foreground truncate max-w-[200px]">{log.detail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
