import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, User, Shield, Palette } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConfiguracionPage() {
  const { user, profile } = useAuth();
  const { currentAccount } = useAccount();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState((profile as any)?.phone || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No user");
      const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil actualizado");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!newPassword || newPassword !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden o están vacías");
      }
      if (newPassword.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contraseña actualizada exitosamente");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Settings className="w-6 h-6 text-accent" /> Configuración
      </h1>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2"><User className="w-4 h-4" /> Perfil</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2"><Shield className="w-4 h-4" /> Seguridad</TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2"><Palette className="w-4 h-4" /> Preferencias</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Información Personal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>Cuenta Actual</Label>
                <Input value={currentAccount?.account.name || ""} disabled />
              </div>
            </div>
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Seguridad</h2>
            
            <div className="space-y-4 border-b border-border pb-6">
              <h3 className="text-sm font-medium text-foreground">Cambiar Contraseña</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nueva Contraseña</Label>
                  <Input 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar Contraseña</Label>
                  <Input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="Confirma la contraseña"
                  />
                </div>
              </div>
              <Button 
                onClick={() => changePassword.mutate()} 
                disabled={changePassword.isPending || !newPassword || newPassword !== confirmPassword}
              >
                {changePassword.isPending ? "Actualizando..." : "Actualizar Contraseña"}
              </Button>
            </div>

            <div className="space-y-2 pt-2">
              <Label>Última sesión</Label>
              <p className="text-sm text-muted-foreground">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <p className="text-sm text-muted-foreground capitalize">{currentAccount?.role || "—"}</p>
            </div>
            {profile?.is_superadmin && (
              <div className="flex items-center gap-2 mt-2">
                <Shield className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Superadministrador</span>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6 mt-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Preferencias</h2>
            <p className="text-sm text-muted-foreground">Las preferencias de visualización y notificaciones se configurarán en una versión futura.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
