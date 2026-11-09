"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { CREDITS_PER_CLASS, creditsLabelFromStored, creditsToStored, formatCredits } from "@/lib/classCreditPricing";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, ChevronDown, Coins, CreditCard, Hammer } from "@/components/ui/appIcons";
import { QuickMessageButton } from "@/components/admin/QuickMessageButton";
import type { Role } from "@prisma/client";
import type { CustomerProfile as CustomerProfileData } from "@/lib/adminCustomer";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { StudentNotesEditor } from "@/components/admin/StudentNotesEditor";
import { formatPhone } from "@/lib/phone";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { InlineConfirm } from "@/components/admin/InlineConfirm";
import { Tabs } from "@/components/ui/Tabs";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { ViewMore } from "@/components/ui/ViewMore";
import { AdminEditPaymentButton } from "@/components/admin/AdminEditPaymentButton";
import { toast } from "@/components/ui/Toaster";
import { Hint } from "@/components/ui/Hint";

export interface CustomerProfileProps {
  profile: CustomerProfileData;
  /** Shown at the bottom of the Support tab (the changes admins made on this account). */
  changeLog?: React.ReactNode;
  /** The "Plan" menu (pause, weekly time, bill date, plan settings...), built by the page and drawn in the top row. */
  planMenu?: React.ReactNode;
  /** The Scheduler tab: this student's classes, booking and weekly time (built by the page). */
  scheduler?: React.ReactNode;
  /** Owner tools in the Account card (edit details, reset code, trial), built by the page. */
  accountTools?: React.ReactNode;
  /** Owner tool in the Class credits card (when credits expire), built by the page. */
  creditTools?: React.ReactNode;
  /** The owner can correct an approved payment's amount or day. */
  canEditPayments?: boolean;
  onSetCurriculumAccess: (userId: string, hasAccess: boolean, notify?: boolean) => Promise<void>;
  onToggleScale: (userId: string, scaleSlug: string, unlock: boolean, notify?: boolean) => Promise<void>;
  onClearAssistantHistory: (userId: string) => Promise<void>;
  onSetRole: (userId: string, role: Role, notify?: boolean) => Promise<void>;
  onAdjustCredits: (userId: string, amount: number, reasonNote: string, notify?: boolean) => Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
  onForceSignOut: (userId: string) => Promise<void>;
  onForgetPayerName: (userId: string, aliasId: string) => Promise<void>;
  /** Frees this account's phone number (a number belongs to one account). */
  onClearPhone: (userId: string, notify?: boolean) => Promise<void>;
  /** Bans the account for good (it can never sign in). The reason is a private note. */
  onBan: (userId: string, reason: string, notify?: boolean) => Promise<{ ok: true; summary: string } | { ok: false; error: string }>;
  onUnban: (userId: string, notify?: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Lets an account locked for non-payment sign in again. */
  onLiftPaymentLock: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: Date | string) {
  return formatEtShort(d, { weekday: false });
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title text-slate-50 font-semibold">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Collapsed until the Notes button is pressed: the teacher's permanent notes on this student. */
function NotesSection({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard
      title="Notes"
      action={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {open ? "Close notes" : "Notes"}
        </button>
      }
    >
      {open ? <StudentNotesEditor studentId={studentId} /> : <p className="text-small text-slate-500"><Hint>Permanent notes on this student. Mark any as hidden from them.</Hint></p>}
    </SectionCard>
  );
}

const PRACTICE_DOT: Record<"done" | "partial" | "missed", string> = {
  done: "bg-emerald-400",
  partial: "bg-amber-400/70",
  missed: "bg-slate-700",
};

function formatPracticeDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Last 30 days of the daily 10-minute finger practice: a dot per day, oldest first. */
function PracticeStrip({ practice }: { practice: CustomerProfileData["practice"] }) {
  return (
    <div>
      <p className="text-small text-slate-400">
        <span className="tabular-nums text-slate-50">{practice.doneLast7}/7</span> days this week ·{" "}
        <span className="tabular-nums text-slate-50">{practice.minutesLast7}</span> min · streak{" "}
        <span className="tabular-nums text-slate-50">{practice.streak}</span> · last full day{" "}
        <span className="text-slate-50">{practice.lastDoneDay ? formatPracticeDay(practice.lastDoneDay) : "never"}</span>
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Daily practice, last 30 days, oldest first">
        {practice.strip.map((d) => (
          <li
            key={d.day}
            title={`${formatPracticeDay(d.day)}: ${d.state === "done" ? "10 minutes done" : d.state === "partial" ? `${Math.floor(d.seconds / 60)} min` : "no practice"}`}
            className={`h-4 w-4 rounded-full ${PRACTICE_DOT[d.state]}`}
          >
            <span className="sr-only">
              {formatPracticeDay(d.day)} {d.state}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-small text-slate-500">
        {practice.doneLast30} of 30 days done. Green is the full 10 minutes, yellow is part of it, grey is none.
      </p>
    </div>
  );
}

type ProfileTab = "overview" | "learning" | "classes" | "scheduler" | "money" | "support";
const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "learning", label: "Learning" },
  { id: "classes", label: "Classes" },
  { id: "scheduler", label: "Scheduler" },
  { id: "money", label: "Money" },
  { id: "support", label: "Support" },
];

/** The bar that opens and closes one section of the long page; it is also what the index scrolls to. */
function SectionHeader({ id, label, open, onToggle }: { id: ProfileTab; label: string; open: boolean; onToggle: () => void }) {
  return (
    <h2 id={`sec-${id}`} className="scroll-mt-28 border-t border-slate-50/10 pt-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="tap flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-left text-title font-semibold text-slate-50">
        {label}
        <ChevronDown aria-hidden className={`h-5 w-5 text-slate-50/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-small text-slate-500">{children}</p>;
}

export function CustomerProfile({
  profile,
  changeLog,
  planMenu,
  scheduler,
  accountTools,
  creditTools,
  canEditPayments = false,
  onSetCurriculumAccess,
  onToggleScale,
  onClearAssistantHistory,
  onSetRole,
  onAdjustCredits,
  onForceSignOut,
  onForgetPayerName,
  onClearPhone,
  onBan,
  onUnban,
  onLiftPaymentLock,
}: CustomerProfileProps) {
  const router = useRouter();
  const { user } = profile;
  // One "Notify" switch for every change made on this page (credits, access, scales, phone, role, ban), shared with the class card's own.
  const [notify, setNotify] = useNotifyStudent("student-changes");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One long page, six sections. Each opens and closes on its own header; every section stays mounted (hidden, not removed), so a
  // half-typed credit amount or an open confirmation survives closing it. The section in the address (#money) opens and scrolls to
  // it, so a link or a refresh returns there. The index above follows what is on screen.
  const [openSections, setOpenSections] = useState<Set<ProfileTab>>(() => new Set<ProfileTab>(["overview"]));
  const [tab, setTab] = useState<ProfileTab>("overview");
  const isOpen = (id: ProfileTab) => openSections.has(id);
  const toggleSection = (id: ProfileTab) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function chooseTab(next: ProfileTab) {
    setOpenSections((prev) => new Set(prev).add(next));
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
    // Scroll once React has opened the section (see the effect below): scrolling now would stop short, the page is not tall enough yet.
    pendingScroll.current = next;
  }
  const pendingScroll = useRef<ProfileTab | null>(null);
  // The admin menu pins itself at the top; the index sticks just under it, wherever its height ends up on this screen size.
  const [stickyTop, setStickyTop] = useState(60);
  useEffect(() => {
    const deck = document.querySelector<HTMLElement>("[data-deck-header]");
    if (!deck) return;
    const measure = () => setStickyTop(Math.max(0, deck.offsetHeight - 16 + 4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(deck);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    pendingScroll.current = null;
    document.getElementById(`sec-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openSections, tab]);
  useEffect(() => {
    const fromAddress = () => {
      const match = PROFILE_TABS.find((t) => t.id === window.location.hash.replace("#", ""));
      if (match) chooseTab(match.id);
    };
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    return () => window.removeEventListener("hashchange", fromAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // `?do=` (from the command menu) opens the account with one job ready: credits, a class, the plan tools, or payments.
  // Read from the address so a pick that lands on the page already open (the same person) works too, not only a fresh visit.
  const doJob = useSearchParams().get("do");
  useEffect(() => {
    const job = doJob;
    if (!job) return;
    // The address is cleaned only when the job runs: in development React mounts the page twice, and cleaning it on the first
    // pass left the second one with nothing to do.
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      if (job === "credits") {
        chooseTab("classes");
        window.setTimeout(() => {
          const input = document.getElementById("cp-amount");
          input?.scrollIntoView({ behavior: "smooth", block: "center" });
          input?.focus({ preventScroll: true });
        }, 120);
      } else if (job === "book") {
        chooseTab("scheduler");
        window.dispatchEvent(new Event("bnp-open-book-class"));
      } else if (job === "plan") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.dispatchEvent(new Event("bnp-open-plan-menu"));
      } else if (job === "payments") {
        chooseTab("money");
      }
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doJob]);
  // Scroll-spy: the index highlights the section nearest the top of the screen.
  useEffect(() => {
    const els = PROFILE_TABS.map((t) => document.getElementById(`sec-${t.id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setTab(top.target.id.replace("sec-", "") as ProfileTab);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditSuccess, setCreditSuccess] = useState<string | null>(null);
  // Mirrors AdminCreditGrantPanel's own review step: a free-typed signed
  // amount is easy to typo (wrong sign, extra digit) and was previously one
  // submit away from changing a real balance with nothing to double-check.
  const [creditConfirming, setCreditConfirming] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingBan, setConfirmingBan] = useState(false);
  const [confirmingUnban, setConfirmingUnban] = useState(false);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [confirmingClearPhone, setConfirmingClearPhone] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banSummary, setBanSummary] = useState<string | null>(null);
  // Role, curriculum-access, and clear-history all used to fire on a single
  // click with no confirmation. "Make admin" is the highest-stakes action in
  // the whole admin panel, since an errant admin can then touch everything
  // else here; "Clear Atom history" had no confirmation of any kind, not
  // even a native dialog. One at a time, same shape as "Sign out everywhere"
  // right below it.
  const [pendingAction, setPendingAction] = useState<"role" | "curriculum" | "history" | null>(null);

  async function withBusy(fn: () => Promise<unknown>) {
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
    // Typed in credits (1 credit = 1 class, 45 minutes); half credits are allowed.
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount * CREDITS_PER_CLASS)) {
      setError("Enter a non-zero number in whole or half credits (e.g. 4, 0.5 or -2).");
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
    // The server counts in stored half-classes; people type credits (see classCreditPricing).
    const amount = creditsToStored(Number(creditAmount));
    setBusy(true);
    setError(null);
    setCreditSuccess(null);
    const h = await toast.held("Adjusting credits", () => onAdjustCredits(user.id, amount, creditReason.trim(), notify), { mail: notify });
    if (h.undone) {
      setBusy(false);
      return;
    }
    const result = h.value;
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setCreditSuccess(`New balance: ${creditsLabelFromStored(result.balance)}.`);
    setCreditAmount("");
    setCreditReason("");
    setCreditConfirming(false);
    setBusy(false);
    router.refresh();
  }

  async function handleBan() {
    setBusy(true);
    setError(null);
    const h = await toast.held("Banning this account", () => onBan(user.id, banReason, notify), { mail: notify });
    if (h.undone) {
      setBusy(false);
      return;
    }
    const result = h.value;
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirmingBan(false);
    setBanReason("");
    setBanSummary(result.summary);
    router.refresh();
  }

  async function handleUnban() {
    setBusy(true);
    setError(null);
    const result = await onUnban(user.id, notify);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirmingUnban(false);
    router.refresh();
  }

  async function handleLiftLock() {
    setBusy(true);
    setError(null);
    const h = await toast.held("Lifting the payment lock", () => onLiftPaymentLock(user.id));
    if (h.undone) {
      setBusy(false);
      return;
    }
    const result = h.value;
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirmingUnlock(false);
    router.refresh();
  }

  const banButton = user.bannedAt ? (
    <button
      type="button"
      disabled={busy}
      onClick={() => setConfirmingUnban((o) => !o)}
      aria-expanded={confirmingUnban}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      Lift ban
    </button>
  ) : user.role === "ADMIN" ? null : (
    <button
      type="button"
      disabled={busy}
      onClick={() => setConfirmingBan((o) => !o)}
      aria-expanded={confirmingBan}
      className={buttonVariants({ variant: "danger", size: "sm" })}
    >
      <Hammer className="h-4 w-4" aria-hidden />
      Ban
    </button>
  );


  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-neu-base shadow-pressed-low p-3 text-small text-red-300">{error}</div>
      )}

      {/* The jobs done most from this page, one tap away whichever tab is open: no hunting through tabs. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick actions">
        <QuickMessageButton userId={user.id} name={user.name ?? user.email} />
        <button
          type="button"
          onClick={() => {
            chooseTab("classes");
            window.setTimeout(() => {
              const input = document.getElementById("cp-amount");
              input?.scrollIntoView({ behavior: "smooth", block: "center" });
              input?.focus({ preventScroll: true });
            }, 60);
          }}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Coins aria-hidden className="h-4 w-4" />
          Add credits
        </button>
        <button
          type="button"
          onClick={() => {
            chooseTab("scheduler");
            window.dispatchEvent(new Event("bnp-open-book-class"));
          }}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <CalendarPlus aria-hidden className="h-4 w-4" />
          Book a class
        </button>
        {planMenu}
        <button type="button" onClick={() => chooseTab("money")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <CreditCard aria-hidden className="h-4 w-4" />
          Payments
        </button>
        <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${(user.name ?? "student").split(" ")[0]} of my changes`} className="ml-auto" />
      </div>

      {/* The index: jumps to a section and opens it. It stays under the top while the page scrolls. */}
      <div className="z-20 md:sticky" style={{ top: stickyTop }}>
        <Tabs<ProfileTab> label="Jump to a section of this account" items={PROFILE_TABS} value={tab} onChange={chooseTab} />
      </div>

      <div className="space-y-5">
        <SectionHeader id="overview" label="Overview" open={isOpen("overview")} onToggle={() => toggleSection("overview")} />
        <div hidden={!isOpen("overview")} className="space-y-5">
          {/* Identity + account-level quick actions */}
          <SectionCard title="Account" action={banButton}>
            {user.bannedAt && (
              <div role="status" className="mb-4 rounded-xl border border-red-500/40 bg-neu-base shadow-pressed-low p-3 text-small text-red-300">
                <p className="font-semibold">Permanently banned on {formatDate(user.bannedAt)}. They cannot sign in.</p>
                {banSummary && <p className="mt-1">Terminated: {banSummary}</p>}
                {user.bannedReason && <p className="mt-1 text-red-300/80">Your note: {user.bannedReason}</p>}
              </div>
            )}
            {user.paymentLockedAt && !user.bannedAt && (
              <div role="status" className="mb-4 rounded-xl border border-red-500/40 bg-neu-base shadow-pressed-low p-3 text-small text-red-300">
                <p className="font-semibold">Locked for non-payment on {formatDate(user.paymentLockedAt)}. They cannot sign in.</p>
                <p className="mt-1">Their plan was canceled when the bill went unpaid. Lift the lock once it is sorted out.</p>
                {confirmingUnlock ? (
                  <InlineConfirm
                    className="mt-3"
                    question="Lift the payment lock?"
                    detail="They will be able to sign in again. Their canceled plan stays canceled; they can start a new one."
                    confirmLabel="Yes, lift the lock"
                    busyLabel="Lifting…"
                    busy={busy}
                    onCancel={() => setConfirmingUnlock(false)}
                    onConfirm={() => void handleLiftLock()}
                  />
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirmingUnlock(true)} className={`${buttonVariants({ variant: "secondary", size: "sm" })} mt-3`}>
                    Lift payment lock
                  </button>
                )}
              </div>
            )}
            {confirmingUnban && user.bannedAt && (
              <InlineConfirm
                className="mb-4"
                question="Lift this ban?"
                detail="They will be able to sign in again. The plans and classes the ban canceled stay canceled."
                confirmLabel="Yes, lift the ban"
                busyLabel="Lifting…"
                busy={busy}
                onCancel={() => setConfirmingUnban(false)}
                onConfirm={() => void handleUnban()}
              />
            )}
            {confirmingBan && !user.bannedAt && (
              <div className="mb-4 rounded-xl border border-red-500/40 bg-neu-base shadow-pressed-low p-4">
                <p className="text-small font-semibold text-red-300">Permanently ban {user.name ?? user.email}?</p>
                <p className="mt-1 text-small text-slate-300"><Hint>This is a termination. They are signed out everywhere and can never sign in again, their payment plan and every booked class are canceled, their trial and free access end, and they are removed from your Discord server. Money they already paid is not touched, and a payment waiting for your review is left for you. They will see a red notice that they have been permanently banned. You can lift the ban later, but the cancellations stay.</Hint></p>
                <label className="mt-3 block text-small text-slate-400" htmlFor="ban-reason">
                  Private note for yourself (optional)
                </label>
                <textarea
                  id="ban-reason"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="mt-1 w-full rounded-lg bg-neu-base px-3 py-2 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500"
                  placeholder="Why, so you remember"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setConfirmingBan(false)} disabled={busy} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Not yet
                  </button>
                  <button type="button" onClick={handleBan} disabled={busy} className={buttonVariants({ variant: "danger", size: "sm" })}>
                    {busy ? <MorphingSquare size={12} className="shrink-0" /> : <Hammer className="h-4 w-4" aria-hidden />}
                    {busy ? "Banning…" : "Yes, ban this account"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-small text-slate-400">
                <p>{user.email}</p>
                {user.username && <p className="mt-0.5 text-slate-500">@{user.username}</p>}
                <p className="mt-1 text-small text-slate-500">
                  Joined {formatDate(user.createdAt)} · {user.emailVerified ? "Email verified" : "Email not verified"}
                </p>
                <p className="mt-1 text-small text-slate-500">
                  {user.phone ? `${formatPhone(user.phone)} · ${user.phoneVerifiedAt ? "Phone verified" : "Phone not verified"}` : "No phone number"}
                  {user.phone && (
                    <button
                      type="button"
                      onClick={() => setConfirmingClearPhone((o) => !o)}
                      aria-expanded={confirmingClearPhone}
                      className="tap ml-2 text-slate-50 underline hover:opacity-70"
                    >
                      Clear
                    </button>
                  )}
                </p>
                {confirmingClearPhone && user.phone && (
                  <InlineConfirm
                    className="mt-2"
                    danger
                    question="Clear this phone number?"
                    detail="It frees the number so its real owner can add it to their own account."
                    confirmLabel="Yes, clear it"
                    busyLabel="Clearing…"
                    busy={busy}
                    onCancel={() => setConfirmingClearPhone(false)}
                    onConfirm={() => void withBusy(() => toast.held("Clearing the phone number", () => onClearPhone(user.id, notify))).then(() => setConfirmingClearPhone(false))}
                  />
                )}
                <p className="mt-1 text-small text-slate-500">
                  {user.passwordChangedAt ? `Password changed ${formatDate(user.passwordChangedAt)}` : "Password never changed"}
                </p>
                <p className="mt-1 text-small text-slate-500">
                  {user.lastActivityAt ? `Last active ${formatDate(user.lastActivityAt)}` : "No recorded activity"} ·{" "}
                  {user.currentStreak}-day streak
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${
                    user.role === "ADMIN" ? "bg-slate-50/15 text-slate-50" : "bg-neu-base shadow-pressed-low text-slate-400"
                  }`}
                >
                  {user.role}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${
                    user.hasCurriculumAccess ? "bg-slate-50/15 text-slate-100" : "bg-neu-base shadow-pressed-low text-slate-400"
                  }`}
                >
                  {user.hasCurriculumAccess ? "Comped" : "Not comped"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
              {accountTools}
              {pendingAction === "curriculum" ? (
                <span className="flex items-center gap-2 rounded-lg border border-slate-50/30 bg-neu-base shadow-pressed-low px-3 py-1.5 text-small text-slate-200">
                  {user.hasCurriculumAccess
                    ? "Remove complimentary access?"
                    : "Give complimentary curriculum access?"}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => onSetCurriculumAccess(user.id, !user.hasCurriculumAccess, notify))}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Applying…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("curriculum")}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {user.hasCurriculumAccess ? "Remove complimentary access" : "Grant complimentary access"}
                </button>
              )}

              {pendingAction === "role" ? (
                <span className="flex items-center gap-2 rounded-lg border border-slate-50/30 bg-neu-base shadow-pressed-low px-3 py-1.5 text-small text-slate-200">
                  {user.role === "ADMIN"
                    ? "Remove admin access from this account? They are signed out right away."
                    : "Make this account an admin? They will be able to manage payments, users and credits."}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => toast.held("Changing the role", () => onSetRole(user.id, user.role === "ADMIN" ? "STUDENT" : "ADMIN", notify), { mail: notify }))}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Applying…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("role")}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {user.role === "ADMIN" ? "Remove admin role" : "Make admin"}
                </button>
              )}

              {pendingAction === "history" ? (
                <span className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-neu-base shadow-pressed-low px-3 py-1.5 text-small text-red-300">
                  Permanently delete this account&apos;s stored Atom history?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => toast.held("Clearing Atom chat history", () => onClearAssistantHistory(user.id)))}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                    {busy ? "Deleting…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Never mind
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingAction("history")}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Clear Atom history
                </button>
              )}

              {!confirmingSignOut ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingSignOut(true)}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Sign out everywhere
                </button>
              ) : (
                <span className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-neu-base shadow-pressed-low px-3 py-1.5 text-small text-red-300">
                  Sign out every device this account is logged into?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => toast.held("Signing them out everywhere", () => onForceSignOut(user.id))).then(() => setConfirmingSignOut(false))}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Confirm
                  </button>
                  <button type="button" onClick={() => setConfirmingSignOut(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Never mind
                  </button>
                </span>
              )}
            </div>
          </SectionCard>

        </div>

        <SectionHeader id="learning" label="Learning" open={isOpen("learning")} onToggle={() => toggleSection("learning")} />
        <div hidden={!isOpen("learning")} className="space-y-5">
          {/* Curriculum roadmap */}
          <SectionCard title="Daily practice">
            <PracticeStrip practice={profile.practice} />
          </SectionCard>

          <SectionCard title="Curriculum">
            <div className="space-y-2">
              {profile.roadmap.map((scale) => (
                <div key={scale.scaleGroup.id} className="flex items-center justify-between gap-3 rounded-xl p-3 bg-neu-base shadow-raised-low">
                  <div className="min-w-0">
                    <p className="text-small text-slate-100">
                      {scale.scaleGroup.code} · {scale.scaleGroup.kinitName ?? scale.scaleGroup.title}
                    </p>
                    <p className="mt-0.5 text-small text-slate-500">
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
                    onClick={() => withBusy(() => onToggleScale(user.id, scale.scaleGroup.slug, scale.status === "LOCKED", notify))}
                    className={`tap shrink-0 rounded-lg border px-3 py-1.5 text-small font-medium transition disabled:opacity-40 ${
                      scale.status === "LOCKED"
                        ? "border-slate-50/30 text-slate-50 hover:bg-slate-50/10"
                        : "border-transparent text-slate-400 bg-neu-base shadow-raised-low"
                    }`}
                  >
                    {scale.status === "LOCKED" ? "Unlock" : "Lock"}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          <NotesSection studentId={user.id} />

        </div>

        <SectionHeader id="classes" label="Classes" open={isOpen("classes")} onToggle={() => toggleSection("classes")} />
        <div hidden={!isOpen("classes")} className="space-y-5">
          {/* Credits + bookings */}
          <SectionCard title={`Class credits · ${creditsLabelFromStored(user.classCredits)} available`} action={creditTools}>
            <form onSubmit={handleReviewCredits} className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="cp-amount" className="text-small font-medium uppercase tracking-wide text-slate-500">
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
                  className="mt-1 w-28 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="cp-reason" className="text-small font-medium uppercase tracking-wide text-slate-500">
                  Reason
                </label>
                <input
                  id="cp-reason"
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Paid via Venmo instead of Zelle"
                  disabled={creditConfirming}
                  className="mt-1 w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
                />
              </div>
              {!creditConfirming && (
                <button
                  type="submit"
                  disabled={busy}
                  className={buttonVariants({ variant: "primary", size: "sm", className: "shrink-0" })}
                >
                  Review
                </button>
              )}
            </form>
            {creditConfirming && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-50/30 bg-neu-base shadow-pressed-low px-3 py-2 text-small text-slate-200">
                {Number(creditAmount) > 0 ? "Grant" : "Deduct"}{" "}
                <span className="font-semibold text-slate-50">
                  {formatCredits(Math.abs(Number(creditAmount)))} credit{Math.abs(Number(creditAmount)) === 1 ? "" : "s"}
                </span>
                ? Reason: &ldquo;{creditReason}&rdquo;
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmCredits}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                  {busy ? "Applying…" : "Confirm"}
                </button>
                <button type="button" onClick={() => setCreditConfirming(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Edit
                </button>
              </div>
            )}
            {creditSuccess && <p className="mt-2 text-small text-slate-50">{creditSuccess}</p>}
          </SectionCard>

        </div>

        <SectionHeader id="scheduler" label="Scheduler" open={isOpen("scheduler")} onToggle={() => toggleSection("scheduler")} />
        <div hidden={!isOpen("scheduler")} className="space-y-5">
          {scheduler}
        </div>

        <SectionHeader id="money" label="Money" open={isOpen("money")} onToggle={() => toggleSection("money")} />
        <div hidden={!isOpen("money")} className="space-y-5">
          {/* Payments */}
          <SectionCard title="Payment history">
            {profile.payments.length === 0 && <Empty>No payments submitted.</Empty>}
            <div className="space-y-2">
              <ViewMore items={profile.payments} initial={4}>
              {(p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-small bg-neu-base shadow-raised-low">
                  <div>
                    <p className="text-slate-100">
                      {formatUsd(p.amountCents)} · {p.purpose.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-small text-slate-500">
                      {formatDate(p.createdAt)}
                      {p.scaleGroup ? ` · ${p.scaleGroup.code}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${
                      p.status === "VERIFIED"
                        ? "bg-slate-50/15 text-slate-100"
                        : p.status === "REJECTED"
                          ? "bg-red-400/15 text-red-400"
                          : "bg-neu-base shadow-pressed-low text-slate-400"
                    }`}
                  >
                    {p.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                  {p.status === "VERIFIED" && canEditPayments && <AdminEditPaymentButton paymentId={p.id} amountCents={p.amountCents} paidAt={p.reviewedAt ?? p.updatedAt} />}
                  {p.status === "VERIFIED" && (
                    <Link href={`/billing/receipt/${p.id}`} className="tap inline-flex shrink-0 items-center text-small font-medium text-signal-fg hover:underline">
                      Receipt
                    </Link>
                  )}
                </div>
              )}
              </ViewMore>
            </div>
          </SectionCard>

          {/* Other names their payments arrive under */}
          <SectionCard title="Other payer names">
            {profile.payerAliases.length === 0 && (
              <Empty>None. When you attach a bank email from a different name to this student&apos;s payment, that name is remembered here and clears their future payments by itself.</Empty>
            )}
            <div className="space-y-2">
              {profile.payerAliases.map((alias) => (
                <div key={alias.id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-small bg-neu-base shadow-raised-low">
                  <span className="min-w-0 truncate text-slate-100">{alias.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onForgetPayerName(user.id, alias.id);
                        router.refresh();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionHeader id="support" label="Support" open={isOpen("support")} onToggle={() => toggleSection("support")} />
        <div hidden={!isOpen("support")} className="space-y-5">
          {/* Support history */}
          <SectionCard title="Support history">
            {profile.supportThreads.length === 0 && <Empty>No support conversations.</Empty>}
            <div className="space-y-2">
              {profile.supportThreads.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/support/${t.id}?filter=all`}
                  className="block rounded-xl p-3 transition bg-neu-base shadow-raised-low"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-small text-slate-500">{formatDate(t.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-small font-medium uppercase tracking-wide ${
                        t.status === "OPEN" ? "bg-slate-50/15 text-slate-50" : "bg-slate-50/15 text-slate-100"
                      }`}
                    >
                      {t.status === "OPEN" ? "Open" : "Resolved"}
                    </span>
                  </div>
                  {t.lastMessage && <p className="mt-1.5 truncate text-small text-slate-400">{t.lastMessage.body}</p>}
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Activity timeline */}
          <SectionCard title="Activity">
            {profile.timeline.length === 0 && <Empty>Nothing recorded yet.</Empty>}
            <div className="space-y-3">
              <ViewMore items={profile.timeline} initial={6}>
              {(event, i) => (
                <div key={i} className="border-l-2 border-ink/10 pl-3">
                  <p className="text-small text-slate-500">{formatDateTime(event.at)}</p>
                  <p className="text-small text-slate-200">{event.label}</p>
                  {event.detail && <p className="text-small text-slate-500">{event.detail}</p>}
                </div>
              )}
              </ViewMore>
            </div>
          </SectionCard>
          {changeLog}
        </div>
      </div>
    </div>
  );
}
