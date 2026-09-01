import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { ClipboardList, Filter } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";

export default function AuditoriaPage() {
  const { currentAccount } = useAccount();
  const { profile } = useAuth();
  const accountId = currentAccount?.account_id;

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", accountId],
    queryFn: async () => {
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (accountId && !profile?.is_superadmin) {
        query = query.eq("account_id", accountId);
      }
      const { data } = await query;
      return data || [];
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-accent" /> Auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro cronológico de actividad y eventos de seguridad.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Fecha", "Módulo", "Acción", "Detalle", "Resultado"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Cargando logs...</td></tr>
              ) : !logs || logs.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No hay registros de auditoría aún.</td></tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{format(new Date(l.created_at), "dd/MM/yy HH:mm:ss")}</td>
                    <td className="px-5 py-3"><span className="text-xs bg-secondary px-2 py-0.5 rounded">{l.module}</span></td>
                    <td className="px-5 py-3 text-foreground">{l.action}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-[300px] truncate">{l.detail || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge variant={l.result === "success" ? "completed" : "error"}>{l.result === "success" ? "OK" : "Error"}</StatusBadge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
