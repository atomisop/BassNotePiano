"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Runs an async action (usually a server action) with the two guarantees a
 * button needs: it answers on the same frame it was pressed (`pending` flips
 * synchronously, not after the round trip), and a second press while the
 * first is in flight is ignored rather than fired twice.
 *
 * React 18 has no async `startTransition`, so this is a plain state flag plus
 * a ref lock. The ref matters: two clicks can land before React re-renders
 * with `pending = true`, and state alone would let both through.
 *
 * `key` identifies which row a list action belongs to, so one button in a
 * list can show its spinner while the others stay readable.
 */
export function useAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>, key = "default"): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setPendingKey(key);
    setError(null);
    try {
      return await fn();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      return undefined;
    } finally {
      locked.current = false;
      setPendingKey(null);
    }
  }, []);

  return {
    run,
    pending: pendingKey !== null,
    isPending: (key: string) => pendingKey === key,
    error,
    clearError: () => setError(null),
  };
}
