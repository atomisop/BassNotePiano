"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface UnmatchedEmailRow {
  id: string;
  method: string;
  senderName: string;
  amountCents: number;
  memo: string | null;
  receivedAtMs: number;
  candidates: { id: string; status: string; studentName: string | null; studentEmail: string; createdAtMs: number }[];
}

type Result = { ok: boolean; error: string | null };

const STATUS_LABEL: Record<string, string> = { AWAITING_TRANSFER: "awaiting transfer", PENDING_REVIEW: "pending review" };

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function ago(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Payment emails that matched nobody. Each can be attached to an open payment for the same amount, or dismissed. */
export function UnmatchedEmailList({
  rows,
  onMatch,
  onDismiss,
}: {
  rows: UnmatchedEmailRow[];
  onMatch: (receiptId: string, paymentId: string) => Promise<Result>;
  onDismiss: (receiptId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Attaching approves real money, so it takes a second click, like Approve in the payment list.
  const [confirming, setConfirming] = useState<{ receiptId: string; paymentId: string | "dismiss" } | null>(null);
  const [error, setError] = useState<{ receiptId: string; message: string } | null>(null);

  async function run(receiptId: string, action: () => Promise<Result>) {
    setBusy(receiptId);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setError({ receiptId, message: result.error ?? "Something went wrong." });
      return;
    }
    setConfirming(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="glass-surface p-8 text-center text-small text-slate-500">No payment emails are waiting to be matched.</div>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="glass-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-body font-semibold text-slate-50">
              {row.senderName} · {usd(row.amountCents)}
            </p>
            <p className="text-small text-slate-500">
              {row.method === "VENMO" ? "Venmo" : "Zelle"} · {ago(row.receivedAtMs)}
            </p>
          </div>
          {row.memo && <p className="mt-1 text-small text-slate-400">&ldquo;{row.memo}&rdquo;</p>}

          {row.candidates.length === 0 ? (
            <p className="mt-3 text-small text-slate-500">No open payment for {usd(row.amountCents)} yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-small text-slate-400">Open payments for {usd(row.amountCents)}:</p>
              {row.candidates.map((c) => {
                const isConfirming = confirming?.receiptId === row.id && confirming.paymentId === c.id;
                const who = c.studentName ? `${c.studentName} (${c.studentEmail})` : c.studentEmail;
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neu-base px-3 py-2 shadow-pressed-low">
                    <span className="min-w-0 text-small text-slate-200">
                      {who} <span className="text-slate-500">· {STATUS_LABEL[c.status] ?? c.status.toLowerCase()}, started {ago(c.createdAtMs)}</span>
                    </span>
                    {isConfirming ? (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => run(row.id, () => onMatch(row.id, c.id))}
                          className="tap cta-sheen cta-fill rounded-lg px-3 py-1.5 text-small font-semibold disabled:opacity-60"
                        >
                          {busy === row.id ? "Approving…" : "Confirm: approve"}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="tap neu-btn rounded-lg px-3 py-1.5 text-small font-medium">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming({ receiptId: row.id, paymentId: c.id })}
                        className="tap neu-btn rounded-lg px-3 py-1.5 text-small font-medium"
                      >
                        Attach and approve
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error?.receiptId === row.id && (
            <p role="alert" className="mt-3 text-small text-red-400">
              {error.message}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirming?.receiptId === row.id && confirming.paymentId === "dismiss" ? (
              <>
                <span className="text-small text-slate-400">It will stop being counted. This does not touch any payment.</span>
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => run(row.id, () => onDismiss(row.id))}
                  className="tap rounded-lg border border-red-500/30 px-3 py-1.5 text-small font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                >
                  {busy === row.id ? "Dismissing…" : "Dismiss it"}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="tap neu-btn rounded-lg px-3 py-1.5 text-small font-medium">
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming({ receiptId: row.id, paymentId: "dismiss" })}
                className="tap neu-btn rounded-lg px-3 py-1.5 text-small font-medium"
              >
                Not a studio payment
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
