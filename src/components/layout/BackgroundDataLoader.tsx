import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/contexts/AccountContext";
import { fetchAnalizadorTotalRawData } from "@/lib/analizador-total/fetchRawData";
import { getRecentWindowStart } from "@/lib/dateWindow";
import { useEffect, useRef } from "react";

/**
 * Cargador en segundo plano — carga progresiva por ventana temporal.
 *
 * Fase 1 (inmediata): ventana "recent" (mes actual + mes anterior) para la
 *   cuenta activa. Es lo que se muestra por defecto en cada módulo.
 * Fase 2 (segundo plano, ~4s después): ventana "recent" del resto de cuentas.
 * Fase 3 (segundo plano, ~45s después): ventana "full" (histórico completo)
 *   para la cuenta activa, para que al ampliar filtros de fecha el usuario
 *   no tenga que esperar.
 */
export function BackgroundDataLoader() {
  const { currentAccount, accounts } = useAccount();
  const accountId = currentAccount?.account_id;
  const queryClient = useQueryClient();
  const prefetchedRecentRef = useRef<Set<string>>(new Set());
  const prefetchedFullRef = useRef<Set<string>>(new Set());

  const since = getRecentWindowStart();

  // Fase 1: ventana reciente de la cuenta activa (query compartida con el módulo).
  const { data } = useQuery({
    queryKey: ["analizador-total-data", accountId, "recent"],
    queryFn: () =>
      accountId ? fetchAnalizadorTotalRawData(accountId, { since }) : Promise.resolve([]),
    enabled: !!accountId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });

  useEffect(() => {
    if (data && data.length >= 0 && accountId) {
      console.log(`[BackgroundDataLoader] Recent cuenta activa ${accountId}: ${data.length} registros.`);
    }
  }, [data, accountId]);

  // Fase 2 y 3: pre-carga de otras cuentas + histórico completo, en segundo plano.
  useEffect(() => {
    if (!accountId || !accounts?.length) return;
    let cancelled = false;

    const run = async () => {
      // Fase 2: recent del resto de cuentas
      await new Promise((r) => setTimeout(r, 4000));
      const others = accounts
        .map((a) => a.account_id)
        .filter((id) => id && id !== accountId && !prefetchedRecentRef.current.has(id));

      for (const id of others) {
        if (cancelled) return;
        prefetchedRecentRef.current.add(id);
        try {
          await queryClient.prefetchQuery({
            queryKey: ["analizador-total-data", id, "recent"],
            queryFn: () => fetchAnalizadorTotalRawData(id, { since }),
            staleTime: 1000 * 60 * 10,
            gcTime: 1000 * 60 * 60,
          });
          console.log(`[BackgroundDataLoader] Recent cuenta ${id} precargada.`);
        } catch (err) {
          console.warn(`[BackgroundDataLoader] Fallo prefetch recent ${id}:`, err);
          prefetchedRecentRef.current.delete(id);
        }
        await new Promise((r) => setTimeout(r, 6000));
      }

      // Fase 3: histórico completo de la cuenta activa (más pesado, prioridad baja)
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 30_000));
      if (cancelled || !accountId) return;
      if (prefetchedFullRef.current.has(accountId)) return;
      prefetchedFullRef.current.add(accountId);
      try {
        await queryClient.prefetchQuery({
          queryKey: ["analizador-total-data", accountId, "full"],
          queryFn: () => fetchAnalizadorTotalRawData(accountId),
          staleTime: 1000 * 60 * 15,
          gcTime: 1000 * 60 * 60,
        });
        console.log(`[BackgroundDataLoader] Full histórico ${accountId} precargado.`);
      } catch (err) {
        console.warn(`[BackgroundDataLoader] Fallo prefetch full ${accountId}:`, err);
        prefetchedFullRef.current.delete(accountId);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [accounts, accountId, queryClient, since]);

  return null;
}
