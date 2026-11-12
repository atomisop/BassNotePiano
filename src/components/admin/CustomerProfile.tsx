"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { CREDITS_PER_CLASS, creditsLabelFromStored, creditsToStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, ChevronDown, ChevronRight, Coins, CreditCard, Hammer } from "@/components/ui/appIcons";
import { OPEN_QUICK_MESSAGE_EVENT, QuickMessageButton } from "@/components/admin/QuickMessageButton";
import { notifyDiscordAction } from "@/app/(dashboard)/admin/discord/actions";
import { parseSlotParam } from "@/lib/commandRecents";
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
import { ActionMenu, ActionMenuLabel } from "@/components/ui/ActionMenu";
import { CardFoot, Callout, Fact, Facts, Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";

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
  /** The Money section's payment list with the same actions as Billing > Payments (approve, mark paid, refund...), built by the page. */
  paymentsPanel?: React.ReactNode;
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

/** Opens the Notes editor on this page (the command menu's "Write a note"). */
const OPEN_NOTES_EVENT = "bnp-open-notes";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function formatDateTime(d: Date | string) {
  return formatEtShort(d, { weekday: false });
}

/**
 * One card inside a section. Its name is a quiet eyebrow (the section bar above it is the heading people scan), so the first loud thing
 * in the card is what it holds: the email, the balance, the last payment (DESIGN.md, Hierarchy rules 1 and 3). `id` lets a `?do=` job
 * scroll to it.
 */
function SectionCard({ id, title, action, children }: { id?: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div id={id} className="glass-surface scroll-mt-28 p-4 md:p-5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** "Nov 3", with the year only when it is not this year: a date in a row speaks for itself. */
function shortDate(d: Date | string) {
  const date = new Date(d);
  const yearOf = (x: Date) => x.toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" });
  const sameYear = yearOf(date) === yearOf(new Date());
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "America/New_York" });
}

/** A payment's purpose in plain words: "Payment plan installment". */
function purposeLabel(purpose: string) {
  const words = purpose.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const PAYMENT_STATUS: Record<string, { label: string; tone: "warning" | "danger" | "neutral" }> = {
  AWAITING_TRANSFER: { label: "Awaiting transfer", tone: "neutral" },
  PENDING_REVIEW: { label: "Pending review", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

/** A payment's status as a dot and a word, only when it is news: a paid one shows its receipt instead. */
function PaymentStatus({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status];
  if (!s) return null;
  return <StatusDot tone={s.tone}>{s.label}</StatusDot>;
}

/** Collapsed until the Notes button is pressed: the teacher's permanent notes on this student. */
function NotesSection({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  // `?do=note` (the command menu) opens the editor and puts the cursor in it.
  useEffect(() => {
    const show = () => {
      setOpen(true);
      window.setTimeout(() => {
        document.getElementById("cp-notes")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.querySelector<HTMLTextAreaElement>("#cp-notes textarea")?.focus({ preventScroll: true });
      }, 120);
    };
    window.addEventListener(OPEN_NOTES_EVENT, show);
    return () => window.removeEventListener(OPEN_NOTES_EVENT, show);
  }, []);
  return (
    <SectionCard
      id="cp-notes"
      title="Notes"
      action={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {open ? "Close notes" : "Open notes"}
        </button>
      }
    >
      {open ? <StudentNotesEditor studentId={studentId} /> : <p className="text-small text-slate-500">Permanent notes on this student. Mark any as hidden from them.</p>}
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

/** Last 30 days of the daily 10-minute finger practice: this week's figure first, then a dot per day, oldest first. */
function PracticeStrip({ practice }: { practice: CustomerProfileData["practice"] }) {
  const idle = practice.doneLast7 === 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <p className={`text-headline font-semibold tabular-nums ${idle ? "text-amber-300" : "text-slate-50"}`}>{practice.doneLast7}/7</p>
        <p className="text-small text-slate-400">days this week</p>
      </div>
      <Facts columns={3} className="mt-3">
        <Fact label="This week" value={`${practice.minutesLast7} min`} tone={practice.minutesLast7 > 0 ? "default" : "muted"} />
        <Fact label="Streak" value={`${practice.streak} ${practice.streak === 1 ? "day" : "days"}`} tone={practice.streak > 0 ? "default" : "muted"} />
        <Fact label="Last full day" value={practice.lastDoneDay ? formatPracticeDay(practice.lastDoneDay) : "Never"} tone={practice.lastDoneDay ? "default" : "muted"} />
      </Facts>
      <ul className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-50/8 pt-4" aria-label="Daily practice, last 30 days, oldest first">
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
      <p className="mt-2 text-caption text-slate-500">
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
  paymentsPanel,
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
  // `?do=` (from the command menu and links on other admin screens) opens the account with one job ready: credits, a class, the plan
  // tools, payments, Set up plan (with `?slot=<scheduleId>:<chunkIndex>`), a message, a note, the next scale, their support chat,
  // or the Discord steps. Read from the address so a pick that lands on the page already open (the same person) works too.
  const searchParams = useSearchParams();
  const doJob = searchParams.get("do");
  const doSlot = searchParams.get("slot");
  // The job runs a moment after the page opens: read the Notify switch as it is then, not as it was on the first render.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const setNotifyRef = useRef(setNotify);
  setNotifyRef.current = setNotify;
  useEffect(() => {
    const job = doJob;
    if (!job) return;
    const firstName = (user.name ?? user.email).split(" ")[0];
    const sendDiscordSteps = () =>
      void toast
        .held(`Sending the Discord steps to ${firstName}`, () => notifyDiscordAction(user.id), { mail: true })
        .then((h) => {
          if (h.undone) return;
          if (!h.value.ok) toast.error(h.value.message);
          else toast.success(h.value.message === "Sent." ? `Discord steps sent to ${firstName}` : h.value.message);
        })
        .catch(() => toast.error("Could not send the Discord steps."));
    // The address is cleaned only when the job runs: in development React mounts the page twice, and cleaning it on the first
    // pass left the second one with nothing to do.
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      if (job === "setup") {
        // Set up plan lives in the Plan menu (owner only); it opens itself on this event, with the weekly time if one was given.
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.dispatchEvent(new CustomEvent("bnp-open-plan-setup", { detail: { slot: parseSlotParam(doSlot) } }));
      } else if (job === "message") {
        window.dispatchEvent(new CustomEvent(OPEN_QUICK_MESSAGE_EVENT, { detail: { userId: user.id } }));
      } else if (job === "note") {
        chooseTab("learning");
        window.dispatchEvent(new Event(OPEN_NOTES_EVENT));
      } else if (job === "scale") {
        chooseTab("learning");
        window.setTimeout(() => {
          const card = document.getElementById("cp-curriculum");
          const unlock = Array.from(card?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === "Unlock");
          (unlock ?? card)?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (unlock) unlock.focus({ preventScroll: true });
          else toast.info(`Every scale is already open for ${firstName}.`);
        }, 160);
      } else if (job === "support") {
        const at = (s: CustomerProfileData["supportThreads"][number]) => new Date(s.lastMessage?.createdAt ?? s.createdAt).getTime();
        const latest = [...profile.supportThreads].sort((a, b) => at(b) - at(a))[0];
        if (latest) router.push(`/admin/support/${latest.id}?filter=all`);
        else {
          chooseTab("support");
          toast.info(`${firstName} has no support chats yet.`);
        }
      } else if (job === "discord") {
        chooseTab("overview");
        // Sending the steps is a notice, so the Notify switch decides. Off, nothing goes out unless the switch is turned on here.
        if (notifyRef.current) sendDiscordSteps();
        else
          toast.warning(`Notify is off, so nothing was sent to ${firstName}.`, {
            description: "Turn it on to send the Discord steps to their Mail and email.",
            action: {
              label: "Turn on and send",
              onClick: () => {
                setNotifyRef.current(true);
                sendDiscordSteps();
              },
            },
          });
      } else if (job === "credits") {
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
  }, [doJob, doSlot]);
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

  return (
    <div className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}

      {/* The jobs done most from this page, one tap away whichever tab is open: no hunting through tabs. */}
      <div
        className="grid grid-cols-2 gap-2 max-sm:[&>.relative>button]:w-full max-sm:[&>.relative>button]:border max-sm:[&>.relative>button]:border-slate-50/12 max-sm:[&>.relative]:w-full max-sm:[&>button]:w-full max-sm:[&>button]:border max-sm:[&>button]:border-slate-50/12 sm:flex sm:flex-wrap sm:items-center"
        role="group"
        aria-label="Quick actions"
      >
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
        <button type="button" onClick={() => chooseTab("money")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <CreditCard aria-hidden className="h-4 w-4" />
          Money
        </button>
        <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${(user.name ?? "student").split(" ")[0]} when I change something`} className="col-span-2 px-1 pt-1 sm:ml-auto sm:p-0" />
      </div>

      {/* The index: jumps to a section and opens it. It stays under the top while the page scrolls. */}
      <div className="z-20 md:sticky" style={{ top: stickyTop }}>
        <Tabs<ProfileTab> label="Jump to a section of this account" items={PROFILE_TABS} value={tab} onChange={chooseTab} />
      </div>

      <div className="space-y-5">
        <SectionHeader id="overview" label="Overview" open={isOpen("overview")} onToggle={() => toggleSection("overview")} />
        <div hidden={!isOpen("overview")} className="space-y-5">
          {/* Identity + account-level quick actions */}
          <SectionCard title="Account">
            {user.bannedAt && (
              <Callout
                tone="danger"
                className="mb-4"
                action={
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingUnban((o) => !o)}
                    aria-expanded={confirmingUnban}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Lift ban
                  </button>
                }
              >
                <p className="font-semibold">Banned on {formatDate(user.bannedAt)}. They cannot sign in.</p>
                {banSummary && <p className="mt-1">Terminated: {banSummary}</p>}
                {user.bannedReason && <p className="mt-1 opacity-80">Your note: {user.bannedReason}</p>}
              </Callout>
            )}
            {user.paymentLockedAt && !user.bannedAt && (
              <Callout
                tone="danger"
                className="mb-4"
                action={
                  confirmingUnlock ? null : (
                    <button type="button" disabled={busy} onClick={() => setConfirmingUnlock(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Lift payment lock
                    </button>
                  )
                }
              >
                <p className="font-semibold">Locked for non-payment on {formatDate(user.paymentLockedAt)}. They cannot sign in.</p>
                <p className="mt-1">Their plan was canceled when the bill went unpaid. Lift the lock once it is sorted out.</p>
                {confirmingUnlock && (
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
                )}
              </Callout>
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

            {/* Who this is: the email is the one bright line (the name is already the page title), the rest is quiet. */}
            <p className="break-all text-body font-semibold text-slate-50">{user.email}</p>
            <Meta
              className="mt-0.5"
              items={[
                user.username ? `@${user.username}` : null,
                user.role === "ADMIN" ? "Admin" : "Student",
                user.hasCurriculumAccess && user.role !== "ADMIN" ? "Complimentary access" : null,
              ]}
            />

            <Facts className="mt-4">
              <Fact label="Joined" value={formatDate(user.createdAt)} />
              {/* Streak and Last active are in the summary at the top of the page, once. */}
              <Fact label={user.phone && user.phoneVerifiedAt ? "Phone, verified" : "Phone"} value={user.phone ? formatPhone(user.phone) : "None"} tone={user.phone ? "default" : "muted"} />
            </Facts>

            <Meta
              className="mt-3"
              items={[
                user.emailVerified ? "Email verified" : <span className="text-amber-300">Email not verified</span>,
                user.passwordChangedAt ? `Password changed ${formatDate(user.passwordChangedAt)}` : "Password never changed",
              ]}
            />

            <CardFoot>
              {/* One menu instead of eight equal buttons: everyday tools first, rare ones grouped, Ban last and in red. Each item that
                  needs a yes opens its confirmation under this row, never inside the menu. */}
              <ActionMenu label="Manage" align="right">
                {accountTools}
                <ActionMenuLabel>Access</ActionMenuLabel>
                <button type="button" disabled={busy} onClick={() => setPendingAction("curriculum")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {user.hasCurriculumAccess ? "Remove complimentary access" : "Grant complimentary access"}
                </button>
                <button type="button" disabled={busy} onClick={() => setPendingAction("role")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {user.role === "ADMIN" ? "Remove admin role" : "Make admin"}
                </button>
                <ActionMenuLabel>Clean up</ActionMenuLabel>
                {user.phone && (
                  <button type="button" disabled={busy} onClick={() => setConfirmingClearPhone(true)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Clear phone number
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setPendingAction("history")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Clear Atom history
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmingSignOut(true)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Sign out everywhere
                </button>
                {!user.bannedAt && user.role !== "ADMIN" && (
                  <>
                    <ActionMenuLabel>Danger</ActionMenuLabel>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingBan(true)}
                      className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
                    >
                      <Hammer className="h-4 w-4" aria-hidden />
                      Ban
                    </button>
                  </>
                )}
              </ActionMenu>
            </CardFoot>

            {/* The confirmations the menu opens, one at a time, right under it. */}
            {pendingAction === "curriculum" && (
              <InlineConfirm
                className="mt-3"
                question={user.hasCurriculumAccess ? "Remove complimentary access?" : "Give complimentary curriculum access?"}
                confirmLabel="Confirm"
                busyLabel="Applying…"
                busy={busy}
                onCancel={() => setPendingAction(null)}
                onConfirm={() => void withBusy(() => onSetCurriculumAccess(user.id, !user.hasCurriculumAccess, notify))}
              />
            )}
            {pendingAction === "role" && (
              <InlineConfirm
                className="mt-3"
                question={user.role === "ADMIN" ? "Remove admin access from this account?" : "Make this account an admin?"}
                detail={user.role === "ADMIN" ? "They are signed out right away." : "They will be able to manage payments, users and credits."}
                confirmLabel="Confirm"
                busyLabel="Applying…"
                busy={busy}
                onCancel={() => setPendingAction(null)}
                onConfirm={() => void withBusy(() => toast.held("Changing the role", () => onSetRole(user.id, user.role === "ADMIN" ? "STUDENT" : "ADMIN", notify), { mail: notify }))}
              />
            )}
            {pendingAction === "history" && (
              <InlineConfirm
                className="mt-3"
                danger
                question="Permanently delete this account's stored Atom history?"
                confirmLabel="Delete it"
                busyLabel="Deleting…"
                busy={busy}
                onCancel={() => setPendingAction(null)}
                onConfirm={() => void withBusy(() => toast.held("Clearing Atom chat history", () => onClearAssistantHistory(user.id)))}
              />
            )}
            {confirmingSignOut && (
              <InlineConfirm
                className="mt-3"
                danger
                question="Sign out every device this account is logged into?"
                confirmLabel="Sign them out"
                busyLabel="Signing out…"
                busy={busy}
                onCancel={() => setConfirmingSignOut(false)}
                onConfirm={() => void withBusy(() => toast.held("Signing them out everywhere", () => onForceSignOut(user.id))).then(() => setConfirmingSignOut(false))}
              />
            )}
            {confirmingClearPhone && user.phone && (
              <InlineConfirm
                className="mt-3"
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
            {confirmingBan && !user.bannedAt && (
              <div className="mt-3 rounded-control bg-red-400/10 p-4 ring-1 ring-inset ring-red-400/20">
                <p className="text-small font-semibold text-red-300">Permanently ban {user.name ?? user.email}?</p>
                <p className="mt-1 text-small text-slate-300">
                  They are signed out for good, their plan and booked classes are canceled, and they leave your Discord.{" "}
                  <Hint>Their trial and free access end too. Money they already paid is not touched, and a payment waiting for your review is left for you. They will see a red notice that they have been permanently banned. You can lift the ban later, but the cancellations stay.</Hint>
                </p>
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
                <div className="mt-3 flex flex-wrap justify-end gap-2">
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
          </SectionCard>

        </div>

        <SectionHeader id="learning" label="Learning" open={isOpen("learning")} onToggle={() => toggleSection("learning")} />
        <div hidden={!isOpen("learning")} className="space-y-5">
          {/* Curriculum roadmap */}
          <SectionCard title="Daily practice">
            <PracticeStrip practice={profile.practice} />
          </SectionCard>

          <SectionCard id="cp-curriculum" title="Curriculum">
            {(() => {
              // The scales opened so far and the next one are shown; the locked ones after that are folded away (rule 9).
              const lastOpen = profile.roadmap.reduce((last, scale, i) => (scale.status === "LOCKED" ? last : i), -1);
              const shownCount = Math.min(profile.roadmap.length, lastOpen + 2);
              const scaleRow = (scale: (typeof profile.roadmap)[number]) => {
                const locked = scale.status === "LOCKED";
                return (
                  <li key={scale.scaleGroup.id} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className={`truncate text-body font-medium ${locked ? "text-slate-400" : "text-slate-50"}`}>
                        {scale.scaleGroup.code} · {scale.scaleGroup.kinitName ?? scale.scaleGroup.title}
                      </p>
                      <Meta
                        className="mt-0.5"
                        items={
                          locked
                            ? ["Locked"]
                            : [
                                scale.moduleRead ? "Module read" : "Module unread",
                                scale.practiceCompleted ? "Practice logged" : "Practice pending",
                                scale.quizPassed ? `Quiz passed${scale.quizScore !== null ? ` (${scale.quizScore})` : ""}` : "Quiz pending",
                              ]
                        }
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => withBusy(() => onToggleScale(user.id, scale.scaleGroup.slug, locked, notify))}
                      className={buttonVariants({ variant: locked ? "secondary" : "ghost", size: "sm", className: "shrink-0" })}
                    >
                      {locked ? "Unlock" : "Lock"}
                    </button>
                  </li>
                );
              };
              const rest = profile.roadmap.slice(shownCount);
              return (
                <ul className="divide-y divide-slate-50/6">
                  {profile.roadmap.slice(0, shownCount).map(scaleRow)}
                  {rest.length > 0 && (
                    <li>
                      <details className="group/more">
                        <summary className="tap flex cursor-pointer list-none items-center py-2.5 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                          Show {rest.length} more locked
                        </summary>
                        <ul className="divide-y divide-slate-50/6">{rest.map(scaleRow)}</ul>
                      </details>
                    </li>
                  )}
                </ul>
              );
            })()}
          </SectionCard>

          <NotesSection studentId={user.id} />

        </div>

        <SectionHeader id="classes" label="Classes" open={isOpen("classes")} onToggle={() => toggleSection("classes")} />
        <div hidden={!isOpen("classes")} className="space-y-5">
          {/* Credits + bookings: the balance is the card's one loud figure, the form to change it sits under a hairline. */}
          <SectionCard title="Class credits" action={creditTools}>
            <div className="flex items-baseline gap-2">
              <p className={`text-headline font-semibold tabular-nums ${user.classCredits > 0 ? "text-slate-50" : "text-slate-400"}`}>
                {formatCredits(storedToCredits(user.classCredits))}
              </p>
              <p className="text-small text-slate-400">{storedToCredits(user.classCredits) === 1 ? "credit" : "credits"} available</p>
            </div>
            <form onSubmit={handleReviewCredits} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-50/8 pt-4">
              <div>
                <label htmlFor="cp-amount" className="text-small font-medium text-slate-400">
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
              <div className="min-w-40 flex-1">
                <label htmlFor="cp-reason" className="text-small font-medium text-slate-400">
                  Reason
                </label>
                <input
                  id="cp-reason"
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Paid in person instead of Zelle"
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
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-control bg-slate-50/5 px-3 py-2.5 text-small text-slate-300 ring-1 ring-inset ring-slate-50/10">
                <p className="mr-auto min-w-0">
                  {Number(creditAmount) > 0 ? "Grant" : "Deduct"}{" "}
                  <span className="font-semibold text-slate-50">
                    {formatCredits(Math.abs(Number(creditAmount)))} credit{Math.abs(Number(creditAmount)) === 1 ? "" : "s"}
                  </span>
                  ? Reason: &ldquo;{creditReason}&rdquo;
                </p>
                <button type="button" onClick={() => setCreditConfirming(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmCredits}
                  className={buttonVariants({ variant: "primary", size: "sm" })}
                >
                  {busy && <MorphingSquare size={11} className="mr-1 shrink-0" />}
                  {busy ? "Applying…" : "Confirm"}
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
          {/* Payments: acted on right here when the page passes the full list (approve, mark paid, refund, cancel bill, fix). Without it,
              the last one leads (amount, what for, when) and the earlier ones are rows under it. */}
          {paymentsPanel ? (
            <SectionCard
              title="Payments"
              action={
                <Link href={`/admin/payments?user=${user.id}`} className="tap inline-flex shrink-0 items-center gap-1 rounded-sm text-small font-medium text-slate-400 hover:text-slate-200">
                  In Billing
                  <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              }
            >
              {paymentsPanel}
            </SectionCard>
          ) : (
          <SectionCard title="Payment history">
            {profile.payments.length === 0 && <Empty>No payments submitted.</Empty>}
            {(() => {
              const [latest, ...earlier] = profile.payments;
              if (!latest) return null;
              const tools = (p: (typeof profile.payments)[number]) => (
                <>
                  {p.status === "VERIFIED" && canEditPayments && <AdminEditPaymentButton paymentId={p.id} amountCents={p.amountCents} paidAt={p.reviewedAt ?? p.updatedAt} />}
                  {p.status === "VERIFIED" && (
                    <Link href={`/billing/receipt/${p.id}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}>
                      Receipt
                    </Link>
                  )}
                </>
              );
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-headline font-semibold tabular-nums text-slate-50">{formatUsd(latest.amountCents)}</p>
                      <Meta className="mt-0.5" items={[purposeLabel(latest.purpose), latest.scaleGroup?.code, formatDate(latest.createdAt)]} />
                    </div>
                    <div className="shrink-0 pt-1.5">
                      <PaymentStatus status={latest.status} />
                    </div>
                  </div>
                  {latest.status === "VERIFIED" && <div className="mt-2 flex flex-wrap items-center gap-1">{tools(latest)}</div>}
                  {earlier.length > 0 && (
                    <div className="mt-4 border-t border-slate-50/8 pt-2">
                      <div className="divide-y divide-slate-50/6">
                        <ViewMore items={earlier} initial={4}>
                          {(p) => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-body font-semibold tabular-nums text-slate-50">{formatUsd(p.amountCents)}</p>
                                <Meta className="mt-0.5" items={[purposeLabel(p.purpose), p.scaleGroup?.code, shortDate(p.createdAt)]} />
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <PaymentStatus status={p.status} />
                                {tools(p)}
                              </div>
                            </div>
                          )}
                        </ViewMore>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </SectionCard>
          )}

          {/* Other names their payments arrive under */}
          <SectionCard title="Other payer names">
            {profile.payerAliases.length === 0 && (
              <Empty>None. When you attach a bank email from a different name to this student&apos;s payment, that name is remembered here and clears their future payments by itself.</Empty>
            )}
            {profile.payerAliases.length > 0 && (
              <ul className="divide-y divide-slate-50/6">
                {profile.payerAliases.map((alias) => (
                  <li key={alias.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-body font-medium text-slate-50">{alias.name}</span>
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
                      className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0 text-red-300 hover:text-red-200" })}
                    >
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionHeader id="support" label="Support" open={isOpen("support")} onToggle={() => toggleSection("support")} />
        <div hidden={!isOpen("support")} className="space-y-5">
          {/* Support history: each conversation is a row that opens it (chevron), the last message first, an open one marked. */}
          <SectionCard title="Support history">
            {profile.supportThreads.length === 0 && <Empty>No support conversations.</Empty>}
            {profile.supportThreads.length > 0 && (
              <ul className="divide-y divide-slate-50/6">
                {profile.supportThreads.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/support/${t.id}?filter=all`} className="group flex items-center gap-3 rounded-sm py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-slate-100 group-hover:text-slate-50">{t.lastMessage?.body ?? "No messages"}</p>
                        <p className="mt-0.5 text-small text-slate-500">{formatDate(t.createdAt)}</p>
                      </div>
                      {t.status === "OPEN" && <StatusDot tone="warning" className="shrink-0">Open</StatusDot>}
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Activity timeline */}
          <SectionCard title="Activity">
            {profile.timeline.length === 0 && <Empty>Nothing recorded yet.</Empty>}
            <div className="divide-y divide-slate-50/6">
              <ViewMore items={profile.timeline} initial={6}>
              {(event, i) => (
                <div key={i} className="py-2.5">
                  <p className="text-small font-medium text-slate-100">{event.label}</p>
                  <Meta className="mt-0.5" items={[event.detail, formatDateTime(event.at)]} />
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
