import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Building2, LogOut, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export default function AccountSelectionPage() {
  const { accounts, setCurrentAccount } = useAccount();
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  const handleSelect = (account: typeof accounts[0]) => {
    setCurrentAccount(account);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logo.png" alt="Convert-IA" className="w-10 h-10 rounded-xl object-cover bg-white" />
          <h1 className="font-bold text-lg text-foreground">Convert-IA</h1>
        </div>

        <h2 className="text-2xl font-bold text-foreground mt-6 mb-1">Selecciona una cuenta</h2>
        <p className="text-muted-foreground mb-6">
          Hola, {profile?.full_name || "usuario"}. Tienes acceso a {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""}. Selecciona con cuál deseas trabajar.
        </p>

        <div className="space-y-3">
          {accounts.map((ua) => (
            <button
              key={ua.account_id}
              onClick={() => handleSelect(ua)}
              className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-accent/40 transition-all text-left group active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{ua.account.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground capitalize">{ua.role}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <StatusBadge variant={ua.account.status as "active" | "draft"}>
                    {ua.account.plan}
                  </StatusBadge>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-destructive">
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
