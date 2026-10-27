"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stale-while-revalidate for data the browser fetches: show what was fetched last time at once (even if it is old), and fetch the fresh
 * copy behind it, swapping it in when it arrives. Revisiting a card or a screen is instant instead of an empty box and a spinner.
 * One shared cache per tab, one request at a time per key, and a look again when the tab comes back into view.
 */
interface Entry<T> {
  data: T;
  at: number;
}

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** True when a cached copy is older than `staleMs` (or missing), so it should be fetched again. */
export function isStale(entry: { at: number } | undefined, now: number, staleMs: number): boolean {
  return !entry || now - entry.at >= staleMs;
}

async function defaultFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export function useSwr<T>(
  key: string | null,
  options: { fetcher?: (key: string) => Promise<T>; staleMs?: number; refreshMs?: number } = {},
): { data: T | undefined; loading: boolean; revalidating: boolean; mutate: (next?: T) => Promise<void> } {
  const { fetcher = defaultFetcher<T>, staleMs = 15_000, refreshMs } = options;
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key)?.data as T | undefined) : undefined));
  const [revalidating, setRevalidating] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async () => {
    if (!key) return;
    let request = inFlight.get(key) as Promise<T> | undefined;
    if (!request) {
      request = fetcherRef.current(key).finally(() => inFlight.delete(key));
      inFlight.set(key, request);
    }
    setRevalidating(true);
    try {
      const fresh = await request;
      cache.set(key, { data: fresh, at: Date.now() });
      setData(fresh);
    } catch {
      // Keep showing the last copy; a hiccup is not worth an error box.
    } finally {
      setRevalidating(false);
    }
  }, [key]);

  const mutate = useCallback(
    async (next?: T) => {
      if (key && next !== undefined) {
        cache.set(key, { data: next, at: Date.now() });
        setData(next);
      }
      await revalidate();
    },
    [key, revalidate],
  );

  useEffect(() => {
    if (!key) return;
    const cached = cache.get(key) as Entry<T> | undefined;
    setData(cached?.data);
    if (isStale(cached, Date.now(), staleMs)) void revalidate();
    const onVisible = () => {
      if (document.visibilityState === "visible" && isStale(cache.get(key), Date.now(), staleMs)) void revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = refreshMs ? window.setInterval(() => document.visibilityState === "visible" && void revalidate(), refreshMs) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [key, staleMs, refreshMs, revalidate]);

  return { data, loading: data === undefined && revalidating, revalidating, mutate };
}
