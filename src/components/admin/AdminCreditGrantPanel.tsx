"use client";

import { CREDITS_PER_CLASS, creditsLabelFromStored, creditsToStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreditUserSearchRow, CreditAdjustmentRow } from "@/lib/creditAdjustments";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Tabs } from "@/components/ui/Tabs";

interface RecentAdjustmentRow {
  id: string;
  amount: number;
  reasonNote: string;
  createdAtMs: number;
  userName: string | null;
  userEmail: string;
  adjustedByName: string | null;
  adjustedByEmail: string;
}

export interface AdminCreditGrantPanelProps {
  initialUsers: CreditUserSearchRow[];
  recentAdjustments: RecentAdjustmentRow[];
  onSearch: (query: string) => Promise<CreditUserSearchRow[]>;
  onAdjust: (userId: string, amount: number, reasonNote: string) => Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
  onGetHistory: (userId: string) => Promise<CreditAdjustmentRow[]>;
}

function initialsOf(name: string | null, email: string) {
  return (name ?? email).charAt(0).toUpperCase();
}

/** A signed amount in credits (already converted from the stored unit). */
function formatSigned(amount: number) {
  return amount > 0 ? `+${formatCredits(amount)}` : `-${formatCredits(Math.abs(amount))}`;
}

export function AdminCreditGrantPanel({ initialUsers, recentAdjustments, onSearch, onAdjust, onGetHistory }: AdminCreditGrantPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(initialUsers);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CreditUserSearchRow | null>(null);
  const [history, setHistory] = useState<CreditAdjustmentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // A free-typed number applied on a single submit, same risk PaymentQueue's
  // own Approve button had before it got a confirm step: a typo'd sign or an
  // extra digit here changes a real account's real balance immediately. The
  // required reason field already adds some friction, but doesn't show the
  // actual number back before it's applied, which is the part a typo hides.
  const [confirming, setConfirming] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await onSearch(query);
        setUsers(results);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function selectUser(user: CreditUserSearchRow) {
    setSelected(user);
    setAmount("");
    setReason("");
    setError(null);
    setSuccess(null);
    setConfirming(false);
    setHistoryLoading(true);
    try {
      const rows = await onGetHistory(user.id);
      setHistory(rows);
    } finally {
      setHistoryLoading(false);
    }
  }

  /** Validates and moves to the confirm step. Does not touch the balance yet. */
  function handleReview(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSuccess(null);

    // Typed in credits (1 credit = 1 class, 45 minutes); half credits are allowed.
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed * CREDITS_PER_CLASS)) {
      setError("Enter a number above 0, in whole or half credits (for example 2 or 0.5).");
      return;
    }
    if (mode === "revoke" && creditsToStored(parsed) > selected.classCredits) {
      setError(`They only have ${creditsLabelFromStored(selected.classCredits)}.`);
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }

    setConfirming(true);
  }

  function editAfterConfirm() {
    setConfirming(false);
  }

  async function handleConfirm() {
    if (!selected) return;
    // The server counts in stored half-classes; people type credits (see classCreditPricing).
    const parsed = creditsToStored(mode === "revoke" ? -Number(amount) : Number(amount));
    setSubmitting(true);
    try {
      const result = await onAdjust(selected.id, parsed, reason.trim());
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setSuccess(`Done. ${selected.name ?? selected.email} now has ${creditsLabelFromStored(result.balance)}.`);
      setSelected({ ...selected, classCredits: result.balance });
      setUsers((prev) => prev.map((u) => (u.id === selected.id ? { ...u, classCredits: result.balance } : u)));
      setAmount("");
      setReason("");
      setConfirming(false);
      const rows = await onGetHistory(selected.id);
      setHistory(rows);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* Left: search + select + adjustment form */}
      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students by name or email…"
          className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
        />

        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {searching && <p className="text-small text-slate-500">Searching…</p>}
          {!searching && users.length === 0 && <p className="text-small text-slate-500">No students found.</p>}
          {users.map((user) => {
            const active = selected?.id === user.id;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  active ? "border-[rgb(var(--c-s-50)/0.5)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-transparent bg-neu-base shadow-raised-low"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-small font-medium text-[rgb(var(--c-s-50))]">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(user.name, user.email)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small text-slate-100">{user.name ?? "No name"}</p>
                  <p className="truncate text-small text-slate-500">{user.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-neu-base shadow-pressed-low px-2.5 py-1 text-small font-medium text-slate-300">
                  {formatCredits(storedToCredits(user.classCredits))} cr
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="glass-surface mt-5 p-5">
            <p className="text-small text-slate-100">{selected.name ?? selected.email}</p>
            <p className="mt-0.5 text-small text-slate-500">
              Current balance: <span className="text-slate-300">{creditsLabelFromStored(selected.classCredits)}</span> (1 credit = 1 class, 45 minutes)
            </p>

            <form onSubmit={handleReview} className="mt-4 space-y-3">
              <Tabs
                label="Grant or revoke"
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError(null);
                  setConfirming(false);
                }}
                items={[
                  { id: "grant", label: "Grant" },
                  { id: "revoke", label: "Revoke" },
                ]}
              />
              <div>
                <label htmlFor="credit-amount" className="text-small font-medium uppercase tracking-wide text-slate-500">
                  Credits to {mode}
                </label>
                <input
                  id="credit-amount"
                  type="number"
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={confirming}
                  min={1}
                  placeholder={mode === "revoke" ? "e.g. 2" : "e.g. 4"}
                  className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
                />
                {mode === "revoke" && selected.classCredits > 0 && !confirming && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(storedToCredits(selected.classCredits)))}
                    className="tap neu-btn rounded-lg px-3 py-1.5 text-small mt-1.5 inline-flex items-center"
                  >
                    Revoke all {formatCredits(storedToCredits(selected.classCredits))}
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="credit-reason" className="text-small font-medium uppercase tracking-wide text-slate-500">
                  Reason (required, shown to nobody but admins)
                </label>
                <textarea
                  id="credit-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  disabled={confirming}
                  placeholder="e.g. Paid via Venmo instead of Zelle"
                  className="mt-1 w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
                />
              </div>

              {error && <p className="text-small text-red-400">{error}</p>}
              {success && <p className="text-small text-slate-50">{success}</p>}

              {confirming ? (
                // Same "show exactly what's about to happen, then a second
                // click" shape as PaymentQueue/StudentQueue's own Approve
                // confirm. The number itself, spelled out in words, is the
                // part a typo hides right up until this step.
                <div className="space-y-2 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] p-3">
                  <p className="text-small text-slate-200">
                    {mode === "grant" ? "Grant" : "Revoke"} <span className="font-semibold text-slate-50">{formatCredits(Number(amount))} credit{Number(amount) === 1 ? "" : "s"}</span>{" "}
                    {mode === "grant" ? "to" : "from"} {selected.name ?? selected.email}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={editAfterConfirm}
                      disabled={submitting}
                      className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="tap cta-sheen cta-fill flex flex-1 items-center justify-center rounded-lg py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {submitting ? "Applying…" : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="submit"
                  className="tap cta-sheen cta-fill w-full rounded-lg px-3 py-2 text-small font-medium disabled:opacity-40"
                >
                  {mode === "grant" ? "Review grant" : "Review revoke"}
                </button>
              )}
            </form>

            <div className="mt-5">
              <p className="text-small font-medium uppercase tracking-wide text-slate-500">History for this student</p>
              <div className="mt-2 space-y-2">
                {historyLoading && <p className="text-small text-slate-500">Loading…</p>}
                {!historyLoading && history.length === 0 && <p className="text-small text-slate-500">No adjustments yet.</p>}
                {history.map((row) => (
                  <div key={row.id} className="rounded-lg px-3 py-2 text-small bg-neu-base shadow-raised-low">
                    <div className="flex items-center justify-between gap-2">
                      <span className={row.amount > 0 ? "font-medium text-slate-100" : "font-medium text-red-300"}>
                        {formatSigned(storedToCredits(row.amount))} credits
                      </span>
                      <span className="text-slate-500">{new Date(row.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-400">{row.reasonNote}</p>
                    <p className="mt-1 text-slate-600">by {row.adjustedBy.name ?? row.adjustedBy.email}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: global recent activity */}
      <div>
        <p className="text-small font-medium uppercase tracking-wide text-slate-500">Recent activity</p>
        <div className="mt-2 space-y-2">
          {recentAdjustments.length === 0 && (
            <div className="glass-surface p-6 text-center text-small text-slate-500">No adjustments yet.</div>
          )}
          {recentAdjustments.map((row) => (
            <div key={row.id} className="glass-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-small text-slate-100">{row.userName ?? row.userEmail}</p>
                  <p className="mt-0.5 text-small text-slate-500">{new Date(row.createdAtMs).toLocaleString()}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-small font-medium ${
                  row.amount > 0 ? "bg-slate-50/15 text-slate-100" : "bg-red-400/15 text-red-300"
                }`}>
                  {formatSigned(storedToCredits(row.amount))}
                </span>
              </div>
              <p className="mt-2 text-small text-slate-400">{row.reasonNote}</p>
              <p className="mt-1 text-small text-slate-600">by {row.adjustedByName ?? row.adjustedByEmail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
