import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "analizador-total-cols-hidden";

export function useAnalizadorColumnVisibility(accountId: string | undefined, extKeys: string[]) {
  const storageKey = accountId ? `${STORAGE_PREFIX}:${accountId}` : null;

  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setHidden(new Set(arr));
      } else {
        setHidden(new Set());
      }
    } catch {
      setHidden(new Set());
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: Set<string>) => {
      setHidden(next);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(hidden);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
    },
    [hidden, persist],
  );

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  const allColumnKeys = [
    "canal",
    "archivo",
    "fecha",
    "duracion",
    "sentimiento",
    "score",
    "resultado_operacion",
    "motivo_principal",
    "insights",
    "atribucion_responsabilidad",
    ...extKeys,
  ];

  return { hidden, toggle, isVisible, allColumnKeys, extKeys };
}
