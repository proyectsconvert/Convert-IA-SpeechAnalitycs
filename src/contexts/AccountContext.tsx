import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "@/components/ui/sonner";

type Account = Tables<"accounts">;
type MembershipRole = string;

interface UserAccountRole {
  account_id: string;
  role: MembershipRole;
  account: Account;
}

interface AccountContextType {
  accounts: UserAccountRole[];
  allAccounts: Account[];
  currentAccount: UserAccountRole | null;
  setCurrentAccount: (account: UserAccountRole) => void;
  loading: boolean;
  refreshAccounts: () => Promise<void>;
  createAccount: (name: string, slug?: string, macroproceso?: string) => Promise<boolean>;
  updateAccount: (accountId: string, updates: { name?: string; macroproceso?: string }) => Promise<boolean>;
  updateAccountStatus: (accountId: string, status: "active" | "inactive" | "suspended") => Promise<boolean>;
}

const AccountContext = createContext<AccountContextType>({
  accounts: [],
  allAccounts: [],
  currentAccount: null,
  setCurrentAccount: () => {},
  loading: true,
  refreshAccounts: async () => {},
  createAccount: async () => false,
  updateAccount: async () => false,
  updateAccountStatus: async () => false,
});

export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<UserAccountRole[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<UserAccountRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setAllAccounts([]);
      setCurrentAccount(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (profile?.is_superadmin) {
        // Superadmin sees all accounts
        const { data: allAccts } = await supabase
          .from("accounts")
          .select("*")
          .order("name");

        const mapped: UserAccountRole[] = (allAccts ?? []).map((a) => ({
          account_id: a.id,
          role: "superadmin" as const,
          account: a,
        }));

        setAccounts(mapped);
        setAllAccounts(allAccts ?? []);

        const saved = localStorage.getItem("selectedAccountId");
        const found = mapped.find((m) => m.account_id === saved);
        setCurrentAccount(found ?? mapped[0] ?? null);
      } else {
        // Regular user: get assigned accounts
        const { data: memberships } = await (supabase
          .from("user_accounts" as any)
          .select("account_id, role")
          .eq("user_id", user.id)
          .eq("is_active", true) as any);

        if (!memberships?.length) {
          setAccounts([]);
          setCurrentAccount(null);
          setLoading(false);
          return;
        }

        const accountIds = memberships.map((m) => m.account_id);
        const { data: accts } = await supabase
          .from("accounts")
          .select("*")
          .in("id", accountIds);

        const mapped: UserAccountRole[] = memberships
          .map((m) => ({
            account_id: m.account_id,
            role: m.role as MembershipRole,
            account: (accts ?? []).find((a) => a.id === m.account_id),
          }))
          .filter((m): m is UserAccountRole => Boolean(m.account));

        setAccounts(mapped);
        setAllAccounts(accts ?? []);

        const saved = localStorage.getItem("selectedAccountId");
        const found = mapped.find((m) => m.account_id === saved);
        setCurrentAccount(found ?? mapped[0] ?? null);
      }
    } catch {
      setAccounts([]);
      setCurrentAccount(null);
    } finally {
      setLoading(false);
    }
  }, [user, profile?.is_superadmin]);

  useEffect(() => {
    if (authLoading) return;
    fetchAccounts();
  }, [authLoading, fetchAccounts]);

  const handleSetCurrentAccount = (account: UserAccountRole) => {
    setCurrentAccount(account);
    localStorage.setItem("selectedAccountId", account.account_id);
  };

  const refreshAccounts = useCallback(async () => {
    await fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = useCallback(async (name: string, slug?: string, macroproceso: string = "ventas"): Promise<boolean> => {
    try {
      const finalSlug = slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const { error } = await supabase.from("accounts").insert({
        name,
        slug: finalSlug,
        status: "active",
        macroproceso,
        branding: { macroproceso },
        created_by: user?.id,
      } as any);
      if (error) throw error;
      toast.success("Cuenta creada exitosamente");
      await fetchAccounts();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Error al crear la cuenta");
      return false;
    }
  }, [user?.id, fetchAccounts]);

  const updateAccount = useCallback(async (accountId: string, updates: { name?: string; macroproceso?: string }): Promise<boolean> => {
    try {
      const patch: Record<string, any> = {};
      if (updates.name) patch.name = updates.name;
      if (updates.macroproceso) {
        patch.macroproceso = updates.macroproceso;
        patch.branding = { macroproceso: updates.macroproceso };
      }
      const { error } = await supabase.from("accounts").update(patch).eq("id", accountId);
      if (error) throw error;
      toast.success("Cuenta actualizada");
      await fetchAccounts();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar la cuenta");
      return false;
    }
  }, [fetchAccounts]);

  const updateAccountStatus = useCallback(async (accountId: string, status: "active" | "inactive" | "suspended"): Promise<boolean> => {
    try {
      const { error } = await supabase.from("accounts").update({ status: status as any }).eq("id", accountId);
      if (error) throw error;
      await fetchAccounts();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar la cuenta");
      return false;
    }
  }, [fetchAccounts]);

  return (
    <AccountContext.Provider value={{
      accounts,
      allAccounts,
      currentAccount,
      setCurrentAccount: handleSetCurrentAccount,
      loading,
      refreshAccounts,
      createAccount,
      updateAccount,
      updateAccountStatus,
    }}>
      {children}
    </AccountContext.Provider>
  );
}
