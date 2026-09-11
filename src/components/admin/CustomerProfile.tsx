"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import type { CustomerProfile as CustomerProfileData } from "@/lib/adminCustomer";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface CustomerProfileProps {
  profile: CustomerProfileData;
  onSetCurriculumAccess: (userId: string, hasAccess: boolean) => Promise<void>;
  onToggleScale: (userId: string, scaleSlug: string, unlock: boolean) => Promise<void>;
  onClearAssistantHistory: (userId: string) => Promise<void>;
  onSetRole: (userId: string, role: Role) => Promise<void>;
  onAdjustCredits: (userId: string, amount: number, reasonNote: string) => Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
  onCancelBooking: (bookingId: string, reason?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onForceSignOut: (userId: string) => Promise<void>;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-slate-50">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function CustomerProfile({
  profile,
  onSetCurriculumAccess,
  onToggleScale,
  onClearAssistantHistory,
  onSetRole,
  onAdjustCredits,
  onCancelBooking,
  onForceSignOut,
}: CustomerProfileProps) {
  const router = useRouter();
  const { user } = profile;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditSuccess, setCreditSuccess] = useState<string | null>(null);
  // Mirrors AdminCreditGrantPanel's own review step: a free-typed signed
  // amount is easy to typo (wrong sign, extra digit) and was previously one
  // submit away from changing a real balance with nothing to double-check.
  const [creditConfirming, setCreditConfirming] = useState(false);
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // Role, curriculum-access, and clear-history all used to fire on a single
  // click with no confirmation. "Make admin" is the highest-stakes action in
  // the whole admin panel, since an errant admin can then touch everything
  // else here; "Clear Atom history" had no confirmation of any kind, not
  // even a native dialog. One at a time, same shape as "Sign out everywhere"
  // right below it.
  const [pendingAction, setPendingAction] = useState<"role" | "curriculum" | "history" | null>(null);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleReviewCredits(e: FormEvent) {
    e.preventDefault();
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setError("Enter a non-zero whole number (e.g. 4 or -2).");
      return;
    }
    if (!creditReason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    setCreditConfirming(true);
  }

  async function handleConfirmCredits() {
    const amount = Number(creditAmount);
    setBusy(true);
    setError(null);
    setCreditSuccess(null);
    const result = await onAdjustCredits(user.id, amount, creditReason.trim());
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setCreditSuccess(`New balance: ${result.balance} credit${result.balance === 1 ? "" : "s"}.`);
    setCreditAmount("");
    setCreditReason("");
    setCreditConfirming(false);
    setBusy(false);
    router.refresh();
  }

  async function handleCancelBooking(bookingId: string) {
    setBusy(true);
    setError(null);
    const result = await onCancelBooking(bookingId, cancelReason.trim() || undefined);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setCancelingBookingId(null);
    setCancelReason("");
    setBusy(false);
    router.refresh();
  }

  const upcomingBookings = profile.bookings.filter((b) => b.status === "SCHEDULED");
  const pastBookings = profile.bookings.filter((b) => b.status !== "SCHEDULED");

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Identity + account-level quick actions */}
          <SectionCard title="Account">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-slate-400">
                <p>{user.email}</p>
                {user.username && <p className="mt-0.5 text-slate-500">@{user.username}</p>}
                <p className="mt-1 text-xs text-slate-600">
                  Joined {formatDate(user.createdAt)} · {user.emailVerified ? "Email verified" : "Email not verified"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {user.lastActivityAt ? `Last active ${formatDate(user.lastActivityAt)}` : "No recorded activity"} ·{" "}
                  {user.currentStreak}-day streak
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                    user.role === "ADMIN" ? "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {user.role}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                    user.hasCurriculumAccess ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {user.hasCurriculumAccess ? "Curriculum" : "No curriculum"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
              {pendingAction === "curriculum" ? (
                <span className="flex items-center gap-2 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-3 py-1.5 text-xs text-slate-200">
                  {user.hasCurriculumAccess
                    ? "Revoke curriculum access? They'll lose access to paid lessons immediately."
                    : "Grant curriculum access to this account?"}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onSetCurriculumAccess(user.id, !user.hasCurriculumAccess))}
                    className="inline-flex items-center font-semibold underline underline-offset-2 disabled:opacity-40"
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Applying…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className="text-slate-400 underline underline-offset-2">
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("curriculum")}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {user.hasCurriculumAccess ? "Revoke curriculum access" : "Grant curriculum access"}
                </button>
              )}

              {pendingAction === "role" ? (
                <span className="flex items-center gap-2 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-3 py-1.5 text-xs text-slate-200">
                  {user.role === "ADMIN"
                    ? "Remove admin access from this account?"
                    : "Make this account an admin? They'll get full access to payments, users, and every other admin tool."}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onSetRole(user.id, user.role === "ADMIN" ? "STUDENT" : "ADMIN"))}
                    className="inline-flex items-center font-semibold underline underline-offset-2 disabled:opacity-40"
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Applying…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className="text-slate-400 underline underline-offset-2">
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("role")}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {user.role === "ADMIN" ? "Remove admin role" : "Make admin"}
                </button>
              )}

              {pendingAction === "history" ? (
                <span className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-1.5 text-xs text-red-300">
                  Permanently delete this account&apos;s stored Atom history?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onClearAssistantHistory(user.id))}
                    className="inline-flex items-center font-semibold underline underline-offset-2 disabled:opacity-40"
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Deleting…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className="text-slate-400 underline underline-offset-2">
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("history")}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  Clear Atom history
                </button>
              )}

              {!confirmingSignOut ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingSignOut(true)}
                  className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-400/10 disabled:opacity-40"
                >
                  Sign out everywhere
                </button>
              ) : (
                <span className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-1.5 text-xs text-red-300">
                  Sign out every device this account is logged into?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onForceSignOut(user.id)).then(() => setConfirmingSignOut(false))}
                    className="font-semibold underline underline-offset-2 disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button type="button" onClick={() => setConfirmingSignOut(false)} className="text-slate-400 underline underline-offset-2">
                    Never mind
                  </button>
                </span>
              )}
            </div>
          </SectionCard>

          {/* Curriculum roadmap */}
          <SectionCard title="Curriculum">
            <div className="space-y-2">
              {profile.roadmap.map((scale) => (
                <div key={scale.scaleGroup.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100">
                      {scale.scaleGroup.code} · {scale.scaleGroup.kinitName ?? scale.scaleGroup.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {scale.status === "LOCKED"
                        ? "Locked"
                        : [
                            scale.moduleRead ? "Module read" : "Module unread",
                            scale.practiceCompleted ? "Practice logged" : "Practice pending",
                            scale.quizPassed ? `Quiz passed${scale.quizScore !== null ? ` (${scale.quizScore})` : ""}` : "Quiz pending",
                          ].join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onToggleScale(user.id, scale.scaleGroup.slug, scale.status === "LOCKED"))}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                      scale.status === "LOCKED"
                        ? "border-[rgb(var(--c-s-50)/0.3)] text-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)]"
                        : "border-ink/10 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {scale.status === "LOCKED" ? "Unlock" : "Lock"}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Credits + bookings */}
          <SectionCard title={`Class credits — ${user.classCredits} available`}>
            <form onSubmit={handleReviewCredits} className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="cp-amount" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Amount
                </label>
                <input
                  id="cp-amount"
                  type="number"
                  step={1}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 4 or -2"
                  disabled={creditConfirming}
                  className="mt-1 w-28 glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="cp-reason" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Reason
                </label>
                <input
                  id="cp-reason"
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Paid via Venmo instead of Zelle"
                  disabled={creditConfirming}
                  className="mt-1 w-full glass-surface-subtle px-3 py-2 text-base text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
                />
              </div>
              {!creditConfirming && (
                <button
                  type="submit"
                  disabled={busy}
                  className="cta-sheen cta-fill shrink-0 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
                >
                  Review
                </button>
              )}
            </form>
            {creditConfirming && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-3 py-2 text-xs text-slate-200">
                {Number(creditAmount) > 0 ? "Grant" : "Deduct"}{" "}
                <span className="font-semibold text-slate-50">
                  {Math.abs(Number(creditAmount))} credit{Math.abs(Number(creditAmount)) === 1 ? "" : "s"}
                </span>
                ? Reason: &ldquo;{creditReason}&rdquo;
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmCredits}
                  className="inline-flex items-center font-semibold underline underline-offset-2 disabled:opacity-40"
                >
                  {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                  {busy ? "Applying…" : "Confirm"}
                </button>
                <button type="button" onClick={() => setCreditConfirming(false)} className="text-slate-400 underline underline-offset-2">
                  Edit
                </button>
              </div>
            )}
            {creditSuccess && <p className="mt-2 text-xs text-emerald-400">{creditSuccess}</p>}

            <div className="mt-5 border-t border-ink/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Upcoming bookings</p>
              <div className="mt-2 space-y-2">
                {upcomingBookings.length === 0 && <Empty>No upcoming bookings.</Empty>}
                {upcomingBookings.map((b) => (
                  <div key={b.id} className="rounded-xl border border-ink/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-slate-100">{b.schedule.label ?? "Class"}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(b.scheduledAt)} · {b.creditsSpent} credit{b.creditsSpent === 1 ? "" : "s"}
                        </p>
                      </div>
                      {cancelingBookingId === b.id ? (
                        <div className="flex w-full flex-col gap-2 border-t border-ink/10 pt-2">
                          <input
                            type="text"
                            autoFocus
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Reason (optional, shown to the student)"
                            className="w-full glass-surface-subtle px-3 py-2 text-base text-slate-100 outline-none transition focus:border-red-400/60"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCancelingBookingId(null);
                                setCancelReason("");
                              }}
                              className="flex-1 rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
                            >
                              Never mind
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleCancelBooking(b.id)}
                              className="flex-1 rounded-lg bg-red-500/95 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-red-500 disabled:opacity-50"
                            >
                              Confirm cancel & refund
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCancelingBookingId(b.id)}
                          className="shrink-0 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:text-red-300"
                        >
                          Cancel booking
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {pastBookings.length > 0 && (
              <div className="mt-5 border-t border-ink/10 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Past bookings</p>
                <div className="mt-2 space-y-1.5">
                  {pastBookings.slice(0, 8).map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">
                        {b.schedule.label ?? "Class"} · {formatDateTime(b.scheduledAt)}
                      </span>
                      <span
                        className={
                          b.status === "CANCELED"
                            ? "text-red-400"
                            : b.attendance === "PRESENT"
                              ? "text-emerald-400"
                              : b.attendance === "NO_SHOW"
                                ? "text-red-400"
                                : "text-slate-500"
                        }
                      >
                        {b.status === "CANCELED" ? "Canceled" : b.attendance ?? "Completed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Payments */}
          <SectionCard title="Payment history">
            {profile.payments.length === 0 && <Empty>No payments submitted.</Empty>}
            <div className="space-y-2">
              {profile.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 p-3 text-sm">
                  <div>
                    <p className="text-slate-100">
                      {formatUsd(p.amountCents)} · {p.purpose.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(p.createdAt)}
                      {p.scaleGroup ? ` · ${p.scaleGroup.code}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                      p.status === "VERIFIED"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : p.status === "REJECTED"
                          ? "bg-red-400/15 text-red-400"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {p.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          {/* Support history */}
          <SectionCard title="Support history">
            {profile.supportThreads.length === 0 && <Empty>No support conversations.</Empty>}
            <div className="space-y-2">
              {profile.supportThreads.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/support?status=ALL&thread=${t.id}`}
                  className="block rounded-xl border border-ink/10 p-3 transition hover:border-ink/20 hover:bg-ink/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{formatDate(t.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        t.status === "OPEN" ? "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]" : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {t.status === "OPEN" ? "Open" : "Resolved"}
                    </span>
                  </div>
                  {t.lastMessage && <p className="mt-1.5 truncate text-xs text-slate-400">{t.lastMessage.body}</p>}
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Activity timeline */}
          <SectionCard title="Activity">
            {profile.timeline.length === 0 && <Empty>Nothing recorded yet.</Empty>}
            <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {profile.timeline.map((event, i) => (
                <div key={i} className="border-l-2 border-ink/10 pl-3">
                  <p className="text-xs text-slate-600">{formatDateTime(event.at)}</p>
                  <p className="text-sm text-slate-200">{event.label}</p>
                  {event.detail && <p className="text-xs text-slate-500">{event.detail}</p>}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
