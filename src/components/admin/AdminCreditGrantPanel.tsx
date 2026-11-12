"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { CREDITS_PER_CLASS, creditsLabelFromStored, creditsToStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreditUserSearchRow, CreditAdjustmentRow } from "@/lib/creditAdjustments";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Tabs } from "@/components/ui/Tabs";
import { buttonVariants } from "@/components/ui/button";
import { AdminEmptyState as EmptyState } from "@/components/admin/AdminEmptyState";
import { Coins } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";
import { Meta } from "@/components/ui/CardKit";

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
  onAdjust: (userId: string, amount: number, reasonNote: string, notify?: boolean) => Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
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
  const [notify, setNotify] = useNotifyStudent("credits");
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
      const h = await toast.held("Adjusting credits", () => onAdjust(selected.id, parsed, reason.trim(), notify), { mail: notify });
      if (h.undone) {
        setConfirming(false);
        return;
      }
      const result = h.value;
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
          className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
        />

        {/* People as rows in one box: the name first, the balance on the right, no chips. */}
        <div className="mt-3 max-h-72 overflow-y-auto rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
          {searching && <p className="px-4 py-3 text-small text-slate-500">Searching…</p>}
          {!searching && users.length === 0 && <p className="px-4 py-3 text-small text-slate-500">No students found.</p>}
          <div className="divide-y divide-slate-50/6">
            {users.map((user) => {
              const active = selected?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50/5 ${active ? "bg-slate-50/8" : ""}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50/15 text-small font-medium text-slate-50">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(user.name, user.email)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-body font-medium ${user.name ? "text-slate-50" : "text-slate-400"}`}>{user.name ?? "No name"}</p>
                    <p className="truncate text-small text-slate-500">{user.email}</p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-body font-semibold tabular-nums text-slate-50">{formatCredits(storedToCredits(user.classCredits))}</span>
                    <span className="block text-caption text-slate-500">credits</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="mt-5 rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
            {/* The balance is what you are about to change, so it is the loud thing; the name is the label for it. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-title font-semibold text-slate-50">{selected.name ?? selected.email}</p>
                {selected.name && <p className="mt-0.5 truncate text-small text-slate-500">{selected.email}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-headline font-semibold tabular-nums text-slate-50">{formatCredits(storedToCredits(selected.classCredits))}</p>
                <p className="text-caption text-slate-500">credits now</p>
              </div>
            </div>

            <form onSubmit={handleReview} className="mt-4 space-y-3 border-t border-slate-50/8 pt-4">
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
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="credit-amount" className="text-small font-medium text-slate-400">
                    Credits to {mode}
                  </label>
                  {mode === "revoke" && selected.classCredits > 0 && !confirming && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(storedToCredits(selected.classCredits)))}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Revoke all {formatCredits(storedToCredits(selected.classCredits))}
                    </button>
                  )}
                </div>
                <input
                  id="credit-amount"
                  type="number"
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={confirming}
                  min={1}
                  placeholder={mode === "revoke" ? "e.g. 2" : "e.g. 4"}
                  className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
                />
                <p className="mt-1 text-caption text-slate-500">1 credit is 1 class, 45 minutes.</p>
              </div>
              <div>
                <label htmlFor="credit-reason" className="text-small font-medium text-slate-400">
                  Reason <span className="font-normal text-slate-500">(required, only admins see it)</span>
                </label>
                <textarea
                  id="credit-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  disabled={confirming}
                  placeholder="e.g. Paid via Venmo instead of Zelle"
                  className="mt-1 w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
                />
              </div>

              {error && <p className="text-small text-red-400">{error}</p>}
              {success && <p className="text-small text-slate-50">{success}</p>}

              {confirming ? (
                // Same "show exactly what's about to happen, then a second
                // click" shape as PaymentQueue/StudentQueue's own Approve
                // confirm. The number itself, spelled out in words, is the
                // part a typo hides right up until this step.
                <div className="space-y-3 rounded-control bg-slate-50/5 p-3 ring-1 ring-inset ring-slate-50/10">
                  <p className="text-small text-slate-300">
                    {mode === "grant" ? "Grant" : "Revoke"} <span className="font-semibold text-slate-50">{formatCredits(Number(amount))} credit{Number(amount) === 1 ? "" : "s"}</span>{" "}
                    {mode === "grant" ? "to" : "from"} {selected.name ?? selected.email}?
                  </p>
                  <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${(selected.name ?? "them").split(" ")[0]}`} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={editAfterConfirm}
                      disabled={submitting}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={submitting}
                      className={buttonVariants({ variant: "primary", size: "sm", className: "flex flex-1" })}
                    >
                      {submitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {submitting ? "Applying…" : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "primary", className: "w-full sm:w-auto" })}
                  >
                    {mode === "grant" ? "Review grant" : "Review revoke"}
                  </button>
                </div>
              )}
            </form>

            <div className="mt-5 border-t border-slate-50/8 pt-4">
              <p className="text-caption font-medium uppercase tracking-caps text-slate-500">History for this student</p>
              <div className="mt-2">
                {historyLoading && <PulsatingDots className="justify-start" />}
                {!historyLoading && history.length === 0 && <p className="text-small text-slate-500">No adjustments yet.</p>}
                <ul className="divide-y divide-slate-50/6">
                  {history.map((row) => (
                    <li key={row.id} className="py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 text-small text-slate-300">{row.reasonNote}</p>
                        <span className={`shrink-0 text-body font-semibold tabular-nums ${row.amount > 0 ? "text-slate-50" : "text-red-300"}`}>
                          {formatSigned(storedToCredits(row.amount))}
                        </span>
                      </div>
                      <Meta className="mt-0.5" items={[new Date(row.createdAt).toLocaleString(undefined, { timeZone: "America/New_York" }), `by ${row.adjustedBy.name ?? row.adjustedBy.email}`]} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: global recent activity, as rows: who on the left, the change on the right, the reason and who did it quieter. */}
      <div>
        <p className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">Recent activity</p>
        <div className="mt-2">
          {recentAdjustments.length === 0 && (
            <EmptyState icon={<Coins />} title="No adjustments yet" description="Credits you add or take away by hand are listed here." />
          )}
          {recentAdjustments.length > 0 && (
            <ul className="divide-y divide-slate-50/6 overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
              {recentAdjustments.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-body font-medium text-slate-50">{row.userName ?? row.userEmail}</p>
                    <span className={`shrink-0 text-body font-semibold tabular-nums ${row.amount > 0 ? "text-slate-50" : "text-red-300"}`}>
                      {formatSigned(storedToCredits(row.amount))}
                    </span>
                  </div>
                  <p className="mt-0.5 text-small text-slate-400">{row.reasonNote}</p>
                  <Meta className="mt-0.5" items={[new Date(row.createdAtMs).toLocaleString(undefined, { timeZone: "America/New_York" }), `by ${row.adjustedByName ?? row.adjustedByEmail}`]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
