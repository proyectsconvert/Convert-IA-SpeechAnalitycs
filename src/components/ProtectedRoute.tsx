import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { Navigate } from "react-router-dom";
import { Mic, Lock as LockIcon, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { accounts, currentAccount, loading: accountLoading } = useAccount();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
            <Mic className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!accountLoading && accounts.length > 1 && !currentAccount) {
    return <Navigate to="/select-account" replace />;
  }

  if (currentAccount?.account?.status === "suspended") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-6 shadow-lg animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <LockIcon className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Cuenta Suspendida</h1>
            <p className="text-muted-foreground">
              Esta cuenta ha sido suspendida por un administrador. No puedes acceder a la información hasta que sea reactivada.
            </p>
          </div>
          <div className="pt-4 flex flex-col gap-3">
            {accounts.length > 1 && (
              <Button variant="outline" className="w-full" onClick={() => window.location.href = "/select-account"}>
                Cambiar de Cuenta
              </Button>
            )}
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => supabase.auth.signOut()}>
              <LogOut className="w-4 h-4 mr-2" /> Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
