"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type FamilyInviteApi = {
  list: () => Promise<{ email: string; status: InviteStatus }[]>;
  send: (email: string) => Promise<{ ok: boolean; status: InviteStatus | null; error: string | null }>;
  cancel: (email: string) => Promise<void>;
};

/**
 * Where each typed family email stands: not asked, being asked, waiting for their yes, accepted or declined. Loaded when the form opens (so
 * a reload keeps the invitations), and checked again every few seconds while anyone is still deciding (not while the tab is hidden).
 */
export function useFamilyInvites(api: FamilyInviteApi | undefined, enabled: boolean) {
  const [status, setStatus] = useState<Record<string, InviteStatus | "SENDING">>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    const rows = await api.list().catch(() => null);
    if (!rows) return;
    setStatus((prev) => {
      const next: Record<string, InviteStatus | "SENDING"> = {};
      for (const [email, st] of Object.entries(prev)) if (st === "SENDING") next[email] = st;
      for (const row of rows) if (next[row.email] !== "SENDING") next[row.email] = row.status;
      return next;
    });
    setLoaded(true);
  }, [api]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const waiting = Object.values(status).includes("PENDING");
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  useEffect(() => {
    if (!enabled || !api) return;
    const timer = window.setInterval(() => {
      if (waitingRef.current && !document.hidden) void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [enabled, api, refresh]);

  const send = useCallback(
    async (emails: string[]) => {
      if (!api) return;
      setError(null);
      const wanted = emails.map((e) => e.trim().toLowerCase());
      setStatus((prev) => ({ ...prev, ...Object.fromEntries(wanted.map((e) => [e, "SENDING" as const])) }));
      for (const email of wanted) {
        const result = await api.send(email).catch(() => ({ ok: false, status: null, error: "Something went wrong. Please try again." }));
        setStatus((prev) => {
          const next = { ...prev };
          if (result.ok && result.status) next[email] = result.status;
          else delete next[email];
          return next;
        });
        if (!result.ok) setError(result.error);
      }
    },
    [api],
  );

  const cancel = useCallback(
    (email: string) => {
      const key = email.trim().toLowerCase();
      setStatus((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      void api?.cancel(key).catch(() => {});
    },
    [api],
  );

  return { status, error, loaded, send, cancel, refresh };
}
