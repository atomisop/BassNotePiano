"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  bookClassAction,
  bookClassBundleAction,
  bookFamilyClassAction,
  checkFamilyClassAttendeesAction,
  cancelClassBookingAction,
  rescheduleClassBookingAction,
} from "./actions";
import { BookingCalendar, dayKey } from "./BookingCalendar";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Tabs } from "@/components/ui/Tabs";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";

interface OccurrenceRow {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  chunkIndex: number;
  durationMin: number;
  creditCost: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  isBooked: boolean;
}

interface BookingRow {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  refunded: boolean;
  attendance: "PRESENT" | "NO_SHOW" | null;
  canceledReason: string | null;
  /** Booked by the student's payment plan (their weekly class). It can be skipped, not rescheduled here. */
  reserved?: boolean;
}

type BookingMode = "SOLO" | "FAMILY";
type PanelId = "credits" | "for" | "upcoming" | "past";

const STATUS_LABEL: Record<BookingRow["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_STYLE: Record<BookingRow["status"], string> = {
  SCHEDULED: "text-slate-50 bg-neu-base shadow-raised-low",
  COMPLETED: "bg-[rgb(var(--c-s-50)/0.08)] text-slate-200",
  CANCELED: "bg-neu-base shadow-pressed-low text-slate-500",
};

/** Weekday + date only — the time is shown separately as its own column. */
function formatOccurrenceDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Length of a booking that spent `credits`: a class is CLASS_MINUTES. */
function lengthLabel(credits: number) {
  return `${Math.round((credits / CREDITS_PER_CLASS) * CLASS_MINUTES)} min`;
}

/** Whole classes behind a credit amount (credits are internal; students see classes). */
function classCount(credits: number) {
  return Math.floor(credits / CREDITS_PER_CLASS);
}
const classWord = (n: number) => `class${n === 1 ? "" : "es"}`;

function formatOccurrenceTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Buckets upcoming occurrences into "This week" / "Next week" / "Later".
 * A flat list of near-identical rows gave the reader nothing to navigate
 * by; a week boundary is the unit people actually plan in.
 */
function groupOccurrencesByWeek(rows: OccurrenceRow[]): { key: string; label: string; rows: OccurrenceRow[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, OccurrenceRow[]> = { this: [], next: [], later: [] };
  for (const row of rows) {
    const delta = new Date(row.scheduledAt).getTime() - startOfToday;
    if (delta < WEEK) buckets.this.push(row);
    else if (delta < WEEK * 2) buckets.next.push(row);
    else buckets.later.push(row);
  }

  return [
    { key: "this", label: "This week", rows: buckets.this },
    { key: "next", label: "Next week", rows: buckets.next },
    { key: "later", label: "Later", rows: buckets.later },
  ].filter((g) => g.rows.length > 0);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Groups already-desc-sorted bookings into consecutive per-month buckets, preserving order. */
function groupByMonth(list: BookingRow[]): { key: string; label: string; bookings: BookingRow[] }[] {
  const groups: { key: string; label: string; bookings: BookingRow[] }[] = [];
  for (const b of list) {
    const key = monthKey(b.scheduledAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.bookings.push(b);
    } else {
      groups.push({ key, label: monthLabel(b.scheduledAt), bookings: [b] });
    }
  }
  return groups;
}

function BookingCard({
  booking,
  cancellationCutoffHours,
  supportContactId,
  cancelingId,
  reschedulingBookingId,
  onCancel,
  onStartReschedule,
}: {
  booking: BookingRow;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  reschedulingBookingId: string | null;
  onCancel: (booking: BookingRow) => void;
  onStartReschedule: (booking: BookingRow) => void;
}) {
  const b = booking;
  const hoursUntil = (new Date(b.scheduledAt).getTime() - Date.now()) / 3_600_000;
  // Self-cancel and self-reschedule share the exact same >=24h eligibility
  // (see cancelClassBooking / rescheduleClassBooking) — inside that window
  // neither button shows, just a way to reach support for a manual,
  // case-by-case call.
  const cancelEligible = b.status === "SCHEDULED" && hoursUntil >= cancellationCutoffHours;
  const pastSelfServeWindow = b.status === "SCHEDULED" && hoursUntil > 0 && hoursUntil < cancellationCutoffHours;
  const isBeingRescheduled = reschedulingBookingId === b.id;
  return (
    <div className="glass-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-small text-slate-100">
          {b.label ?? "Class"} · {formatDateTime(b.scheduledAt)}
        </p>
        <p className="mt-0.5 text-small text-slate-500">
          {classCount(b.creditsSpent)} {classWord(classCount(b.creditsSpent))}
          {b.status === "SCHEDULED" &&
            (pastSelfServeWindow ? " · Too close to class time to self-cancel" : "")}
        </p>
        {b.status === "COMPLETED" && b.attendance && (
          <p className={`mt-0.5 text-small ${b.attendance === "PRESENT" ? "text-slate-50" : "text-red-400"}`}>
            {b.attendance === "PRESENT" ? "Attended" : "Marked no-show, still charged"}
          </p>
        )}
        {b.status === "CANCELED" && <p className="mt-0.5 text-small text-slate-50">Canceled</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cancelEligible && !b.reserved && (
          <button
            type="button"
            onClick={() => onStartReschedule(b)}
            disabled={cancelingId === b.id}
            className={`tap flex items-center justify-center rounded-lg border px-3 py-1.5 text-small font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isBeingRescheduled
                ? "border-[rgb(var(--c-s-50)/0.4)] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))]"
                : "border-transparent text-slate-300 hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low"
            }`}
          >
            {isBeingRescheduled ? "Picking new time…" : "Reschedule"}
          </button>
        )}
        {cancelEligible && (
          <button
            type="button"
            onClick={() => onCancel(b)}
            disabled={cancelingId === b.id}
            className="tap flex items-center justify-center rounded-lg border border-red-400/20 px-3 py-1.5 text-small font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelingId === b.id && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {cancelingId === b.id ? "Canceling…" : b.reserved ? "Skip" : "Cancel"}
          </button>
        )}
        {pastSelfServeWindow && supportContactId && (
          <Link
            href={`/messages?with=${supportContactId}`}
            className="tap inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Message support
          </Link>
        )}
        <span className={`rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}>
          {STATUS_LABEL[b.status]}
        </span>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonthGroup({
  group,
  defaultOpen,
  cancellationCutoffHours,
  supportContactId,
  cancelingId,
  reschedulingBookingId,
  onCancel,
  onStartReschedule,
}: {
  group: { key: string; label: string; bookings: BookingRow[] };
  defaultOpen: boolean;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  reschedulingBookingId: string | null;
  onCancel: (booking: BookingRow) => void;
  onStartReschedule: (booking: BookingRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink/5"
      >
        <span className="text-small font-medium text-slate-200">{group.label}</span>
        <span className="flex items-center gap-2 text-small text-slate-500">
          {group.bookings.length} booking{group.bookings.length === 1 ? "" : "s"}
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-ink/10 p-3">
          {group.bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              cancellationCutoffHours={cancellationCutoffHours}
              supportContactId={supportContactId}
              cancelingId={cancelingId}
              reschedulingBookingId={reschedulingBookingId}
              onCancel={onCancel}
              onStartReschedule={onStartReschedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One row's email input + live verification badge — used inside the family booking form. */
function AttendeeEmailRow({
  value,
  onChange,
  onRemove,
  removable,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  removable: boolean;
  status?: { checking: boolean; found: boolean; verified: boolean; name: string | null };
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="student@email.com"
        className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
      />
      <span className="w-28 shrink-0 text-small">
        {value.trim() === "" ? null : status?.checking ? (
          <span className="text-slate-500">Checking…</span>
        ) : status?.verified ? (
          <span className="flex items-center gap-1 text-slate-50">
            <CheckIcon size={11} />
            {status.name ?? "Verified"}
          </span>
        ) : status?.found ? (
          <span className="text-red-400">Not verified</span>
        ) : status ? (
          <span className="text-red-400">No account found</span>
        ) : null}
      </span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this student"
          className="shrink-0 text-slate-500 transition hover:text-red-400"
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
}

export function ClassBookingClient({
  initialCredits,
  cancellationCutoffHours,
  soloMaxCredits,
  familyMinAttendees,
  familyCreditsPerStudent,
  supportContactId,
  occurrences,
  initialBookings,
  extraMode = false,
}: {
  /** A student on a payment plan: this is where they book EXTRA sessions on top of their weekly class. */
  extraMode?: boolean;
  initialCredits: number;
  cancellationCutoffHours: number;
  soloMaxCredits: number;
  familyMinAttendees: number;
  familyCreditsPerStudent: number;
  supportContactId: string | null;
  occurrences: OccurrenceRow[];
  initialBookings: BookingRow[];
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [bookings, setBookings] = useState(initialBookings);
  const [rows, setRows] = useState(occurrences);

  // The page re-fetches its data in the background (AutoRefresh), so a class
  // booked or canceled from elsewhere shows up here without a reload. Compared
  // by content so an unchanged refresh does not reset anything.
  const occurrencesSig = JSON.stringify(occurrences);
  const bookingsSig = JSON.stringify(initialBookings);
  useEffect(() => setRows(occurrences), [occurrencesSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setBookings(initialBookings), [bookingsSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setCredits(initialCredits), [initialCredits]);
  const [mode, setMode] = useState<BookingMode>("SOLO");
  const [bookingKey, setBookingKey] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  // Set by tapping "Reschedule" on an upcoming booking — while set, the
  // "Book" button on every open slot below turns into "Move here," picking
  // it as this booking's new time instead of adding a separate one. Only
  // one reschedule is ever in flight at a time, same single-slot-in-progress
  // idiom familyRowKey already uses below.
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingRow | null>(null);
  const [reschedulingKey, setReschedulingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Set by clicking a lit day in BookingCalendar — narrows the list below to
  // just that date. The calendar and this list read the same `rows`, so a
  // day only ever lights up when it genuinely has something to show here.
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // Bundle booking (solo only): check off several occurrences, then book
  // them all in one submit. Keyed the same way bookingKey is
  // (`scheduleId:occurrenceDateMs`), so both features share one identity
  // format for a row.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Step 3 of the flow: the time the student tapped, shown as a short summary
  // they confirm before anything is booked. null = nothing picked yet.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // "Book several" is off by default: checkboxes on every row with no
  // explanation confused first-time students. It switches them on.
  const [multiSelect, setMultiSelect] = useState(false);
  const timesRef = useRef<HTMLDivElement>(null);
  // Which panel of the small tab slider is open (credits, who the class is for, upcoming, past).
  const [panel, setPanel] = useState<PanelId>("credits");
  const [bundleSubmitting, setBundleSubmitting] = useState(false);

  // Family booking: which occurrence, and the list of attendee emails being
  // typed in. Only one family booking is composed at a time — picking a
  // different row for it replaces the in-progress one rather than stacking.
  const [familyRowKey, setFamilyRowKey] = useState<string | null>(null);
  const [familyEmails, setFamilyEmails] = useState<string[]>(["", ""]);
  const [familyChecks, setFamilyChecks] = useState<Record<string, { checking: boolean; found: boolean; verified: boolean; name: string | null }>>({});
  const [familySubmitting, setFamilySubmitting] = useState(false);

  // Every class is its own fixed length now, by direct instruction: what
  // used to be a student's own "stay until" choice (1 or 2 credits, up to
  // an hour) is gone, so a slot always books for its whole defined window
  // (capped at soloMaxCredits), with no shorter option and no silent
  // auto-shrinking to whatever's affordable either. Insufficient balance is
  // surfaced as a real block (insufficientCredits below), not a quietly
  // truncated class.
  function creditsFor(row: OccurrenceRow): number {
    return Math.min(row.creditCost, soloMaxCredits);
  }

  // No list at all until a day is tapped: the page stays short, and the times
  // that appear are exactly that day's.
  const displayRows = useMemo(
    () => (selectedDateKey ? rows.filter((r) => dayKey(r.occurrenceDateMs) === selectedDateKey) : []),
    [rows, selectedDateKey],
  );

  // Tapping a day jumps straight to that day's times, so nobody scrolls past
  // the calendar to find them.
  useEffect(() => {
    if (!selectedDateKey) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timesRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [selectedDateKey]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.has(`${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`)),
    [rows, selectedKeys],
  );
  const selectedCreditTotal = useMemo(
    () => selectedRows.reduce((sum, r) => sum + Math.min(r.creditCost, soloMaxCredits), 0),
    [selectedRows, soloMaxCredits],
  );
  const selectedExceedsBalance = selectedCreditTotal > credits;
  const pendingRow = rows.find((r) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}` === pendingKey && !r.isBooked) ?? null;
  const cheapestClass = rows.reduce((min, r) => Math.min(min, Math.min(r.creditCost, soloMaxCredits)), Infinity);
  const hasNoCredits = credits < (Number.isFinite(cheapestClass) ? cheapestClass : 1);

  function toggleSelected(row: OccurrenceRow) {
    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Split into "needs your attention" (still scheduled) vs. an archived,
  // collapsible-by-month history — a flat list of every booking ever made
  // was turning into an endless scroll for anyone with more than a couple
  // months of history.
  const occurrenceGroups = useMemo(() => groupOccurrencesByWeek(displayRows), [displayRows]);
  const upcoming = useMemo(() => bookings.filter((b) => b.status === "SCHEDULED"), [bookings]);
  const history = useMemo(() => bookings.filter((b) => b.status !== "SCHEDULED"), [bookings]);
  const historyGroups = useMemo(() => groupByMonth(history), [history]);

  function markRowBooked(scheduleId: string, occurrenceDateMs: number, chunkIndex: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.scheduleId === scheduleId && r.occurrenceDateMs === occurrenceDateMs && r.chunkIndex === chunkIndex ? { ...r, isBooked: true } : r,
      ),
    );
  }

  async function handleBook(row: OccurrenceRow) {
    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
    const chosen = creditsFor(row);
    setError(null);
    setSuccess(null);
    setBookingKey(key);
    let result: Awaited<ReturnType<typeof bookClassAction>>;
    try {
      result = await bookClassAction(row.scheduleId, row.occurrenceDateMs, row.chunkIndex, chosen);
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setBookingKey(null);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Reserved, not yet charged — the real deduction lands once the teacher
    // marks attendance (present or absent, either way). This only reflects
    // what's no longer *free to book again* right now.
    setCredits((c) => c - chosen);
    markRowBooked(row.scheduleId, row.occurrenceDateMs, row.chunkIndex);
    setBookings((prev) => [
      {
        id: result.id,
        label: row.label,
        scheduledAt: row.scheduledAt,
        creditsSpent: chosen,
        status: "SCHEDULED",
        refunded: false,
        attendance: null,
        canceledReason: null,
      },
      ...prev,
    ]);
    setSuccess("Booked.");
  }

  /**
   * Books every currently-checked row in one submit. Each selection is its
   * own independent attempt server-side (see bookClassBundle) — someone
   * else taking selection #2's slot doesn't undo #1 or #3, so this applies
   * each result exactly like handleBook would, one at a time, and reports
   * whatever mix of success/failure actually happened.
   */
  async function handleBookBundle() {
    if (selectedRows.length === 0) return;
    setError(null);
    setSuccess(null);
    setBundleSubmitting(true);

    const selections = selectedRows.map((r) => ({
      scheduleId: r.scheduleId,
      occurrenceDateMs: r.occurrenceDateMs,
      chunkIndex: r.chunkIndex,
      creditsToBook: creditsFor(r),
    }));
    let result: Awaited<ReturnType<typeof bookClassBundleAction>>;
    try {
      result = await bookClassBundleAction(selections);
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setBundleSubmitting(false);
    }
    setSelectedKeys(new Set());

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const succeeded = result.results.filter((r) => r.ok);
    const failed = result.results.filter((r) => !r.ok);

    if (succeeded.length > 0) {
      const succeededKeys = new Set(succeeded.map((r) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`));
      const succeededRows = selectedRows.filter((r) => succeededKeys.has(`${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`));

      setCredits((c) => c - succeededRows.reduce((sum, r) => sum + creditsFor(r), 0));
      setRows((prev) => prev.map((r) => (succeededKeys.has(`${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`) ? { ...r, isBooked: true } : r)));
      setBookings((prev) => [
        ...succeeded.map((r) => {
          const row = succeededRows.find((sr) => sr.scheduleId === r.scheduleId && sr.occurrenceDateMs === r.occurrenceDateMs && sr.chunkIndex === r.chunkIndex)!;
          return {
            id: r.bookingId!,
            label: row.label,
            scheduledAt: row.scheduledAt,
            creditsSpent: creditsFor(row),
            status: "SCHEDULED" as const,
            refunded: false,
            attendance: null,
            canceledReason: null,
          };
        }),
        ...prev,
      ]);
    }

    if (failed.length === 0) {
      setSuccess(`Booked ${succeeded.length} class${succeeded.length === 1 ? "" : "es"}.`);
    } else if (succeeded.length === 0) {
      setError(failed[0]!.error ?? "Couldn't book those classes.");
    } else {
      setError(`Booked ${succeeded.length} of ${result.results.length}. ${failed[0]!.error ?? ""}`.trim());
    }
  }

  async function handleCancel(booking: BookingRow) {
    setError(null);
    setSuccess(null);
    setCancelingId(booking.id);
    let result: Awaited<ReturnType<typeof cancelClassBookingAction>>;
    try {
      result = await cancelClassBookingAction(booking.id);
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setCancelingId(null);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: "CANCELED", refunded: true } : b)));
    // Frees the reservation, not a refund of anything actually charged —
    // nothing was charged yet (see cancelClassBookingAction).
    setCredits((c) => c + booking.creditsSpent);
    setSuccess("Canceled.");
  }

  function startReschedule(booking: BookingRow) {
    setError(null);
    setSuccess(null);
    // Toggling the same booking's button again cancels the in-progress pick
    // rather than restarting it — same as clicking a lit calendar day twice.
    setReschedulingBooking((prev) => (prev?.id === booking.id ? null : booking));
    document.getElementById("booking-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMode("SOLO");
    setSelectedKeys(new Set());
    setFamilyRowKey(null);
  }

  async function handleReschedule(row: OccurrenceRow) {
    if (!reschedulingBooking) return;
    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
    const chosen = creditsFor(row);
    const oldBooking = reschedulingBooking;
    setError(null);
    setSuccess(null);
    setReschedulingKey(key);
    let result: Awaited<ReturnType<typeof rescheduleClassBookingAction>>;
    try {
      result = await rescheduleClassBookingAction(oldBooking.id, row.scheduleId, row.occurrenceDateMs, row.chunkIndex, chosen);
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setReschedulingKey(null);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setReschedulingBooking(null);
    markRowBooked(row.scheduleId, row.occurrenceDateMs, row.chunkIndex);
    // The old slot is free again — it may be the exact same schedule+day as
    // the new one (a same-day time change), which markRowBooked above just
    // (re)marked booked regardless, so this only touches a genuinely
    // different old slot.
    setRows((prev) =>
      prev.map((r) =>
        r.scheduledAt === oldBooking.scheduledAt && !(r.scheduleId === row.scheduleId && r.occurrenceDateMs === row.occurrenceDateMs && r.chunkIndex === row.chunkIndex)
          ? { ...r, isBooked: false }
          : r,
      ),
    );
    setBookings((prev) => [
      {
        id: result.id,
        label: row.label,
        scheduledAt: row.scheduledAt,
        creditsSpent: chosen,
        status: "SCHEDULED",
        refunded: false,
        attendance: null,
        canceledReason: null,
      },
      ...prev.filter((b) => b.id !== oldBooking.id),
    ]);
    // The old slot's held credits are released and the new one's are held
    // instead — only a net change if the two differ in length (e.g. moving
    // from a 30-min slot to a 60-min one).
    setCredits((c) => c + oldBooking.creditsSpent - chosen);
    setSuccess("Rescheduled.");
  }

  function openFamilyBooking(row: OccurrenceRow) {
    setFamilyRowKey(`${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`);
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setError(null);
    setSuccess(null);
  }

  function updateFamilyEmail(index: number, value: string) {
    setFamilyEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
    // Debounce-free live check: fires on every keystroke via a trailing
    // check once the field looks like a complete email, same threshold
    // EMAIL_RE-style validation elsewhere in the app uses.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      checkFamilyEmail(value.trim());
    }
  }

  async function checkFamilyEmail(rawEmail: string) {
    // Results are looked up by the lowercase address, so store them under it too.
    const email = rawEmail.trim().toLowerCase();
    setFamilyChecks((prev) => ({ ...prev, [email]: { checking: true, found: false, verified: false, name: null } }));
    let results: Awaited<ReturnType<typeof checkFamilyClassAttendeesAction>>;
    try {
      results = await checkFamilyClassAttendeesAction([email]);
    } catch {
      // Clear the "checking" state so the field isn't stuck; the person can
      // retype or blur to check again.
      setFamilyChecks((prev) => ({ ...prev, [email]: { checking: false, found: false, verified: false, name: null } }));
      return;
    }
    const result = results[0];
    if (!result) return;
    setFamilyChecks((prev) => ({ ...prev, [email]: { checking: false, found: result.found, verified: result.verified, name: result.name } }));
  }

  const familyRow = rows.find((r) => `${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}` === familyRowKey) ?? null;
  const familyEmailsTrimmed = familyEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const familyAllVerified =
    familyEmailsTrimmed.length >= familyMinAttendees && familyEmailsTrimmed.every((e) => familyChecks[e]?.verified);

  async function handleBookFamily() {
    if (!familyRow || !familyAllVerified) return;
    setError(null);
    setSuccess(null);
    setFamilySubmitting(true);
    let result: Awaited<ReturnType<typeof bookFamilyClassAction>>;
    try {
      result = await bookFamilyClassAction(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex, familyEmailsTrimmed);
    } catch {
      setError(NETWORK_ERROR);
      return;
    } finally {
      setFamilySubmitting(false);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    markRowBooked(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex);
    setFamilyRowKey(null);
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setSuccess(`Booked for ${familyEmailsTrimmed.length} students, ${classCount(familyCreditsPerStudent)} ${classWord(classCount(familyCreditsPerStudent))} reserved from each.`);
  }

  return (
    <WideLayout>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
        {extraMode ? "Extra sessions" : "Live Lessons"}
      </p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">
        {extraMode ? "Book an extra class" : "Book a class"}
      </h1>

      {/* The calendar comes first, straight after the title. Credits, who the
          class is for, upcoming and past classes all sit in one small tab
          slider below it (to its right on desktop, where it stays in view). */}
      <div className="mt-(--space-group) grid gap-(--space-group) lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {error && <p className="mb-4 text-small text-red-400">{error}</p>}
          {success && <p className="mb-4 text-small text-slate-50">{success}</p>}

          {rows.length > 0 && (
            <div id="booking-calendar" className="scroll-mt-20">
              <h2 className="mb-3 text-body font-semibold text-slate-100">1. Pick a day</h2>
              <BookingCalendar occurrences={rows} selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
            </div>
          )}

          {mode === "SOLO" && selectedKeys.size > 0 && (
            <div className="glass-surface-elevated mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-small font-medium text-slate-100">
                  {selectedRows.length} class{selectedRows.length === 1 ? "" : "es"} selected
                </p>
                <p className={`mt-0.5 text-small ${selectedExceedsBalance ? "text-red-400" : "text-slate-500"}`}>
                  {classCount(selectedCreditTotal)} {classWord(classCount(selectedCreditTotal))} in total
                  {selectedExceedsBalance && `, you only have ${classCount(credits)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedKeys(new Set())}
                  disabled={bundleSubmitting}
                  className="text-small font-medium text-slate-500 transition hover:text-slate-300 disabled:pointer-events-none disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleBookBundle}
                  disabled={bundleSubmitting || selectedExceedsBalance}
                  className="tap cta-sheen cta-fill flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bundleSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  {bundleSubmitting ? "Booking…" : `Book ${selectedRows.length} class${selectedRows.length === 1 ? "" : "es"}`}
                </button>
              </div>
            </div>
          )}

          {mode === "FAMILY" && familyRow && (
            <div className="glass-surface-elevated mt-8 p-5">
              <p className="text-small font-medium text-slate-100">
                Family booking · {formatOccurrenceDay(familyRow.scheduledAt)} at {formatOccurrenceTime(familyRow.scheduledAt)}
              </p>
              <div className="mt-4 space-y-2">
                {familyEmails.map((email, i) => (
                  <AttendeeEmailRow
                    key={i}
                    value={email}
                    onChange={(v) => updateFamilyEmail(i, v)}
                    onRemove={() => setFamilyEmails((prev) => prev.filter((_, idx) => idx !== i))}
                    removable={familyEmails.length > familyMinAttendees}
                    status={familyChecks[email.trim().toLowerCase()]}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFamilyEmails((prev) => [...prev, ""])}
                  className="text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
                >
                  + Add another student
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFamilyRowKey(null)}
                    disabled={familySubmitting}
                    className="text-small font-medium text-slate-500 transition hover:text-slate-300 disabled:pointer-events-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBookFamily}
                    disabled={!familyAllVerified || familySubmitting}
                    className="tap cta-sheen cta-fill flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {familySubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                    {familySubmitting ? "Booking…" : `Book for ${familyEmailsTrimmed.length || familyMinAttendees} students`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {reschedulingBooking && (
            <div className="glass-surface-elevated mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-small font-medium text-slate-100">
                  Rescheduling {reschedulingBooking.label ?? "your class"} · {formatDateTime(reschedulingBooking.scheduledAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReschedulingBooking(null)}
                className="shrink-0 text-small font-medium text-slate-500 transition hover:text-slate-300"
              >
                Cancel reschedule
              </button>
            </div>
          )}

          {/* Step 3: confirm. Nothing is booked until this is pressed. */}
          {pendingRow && mode === "SOLO" && !reschedulingBooking && (
            <div className="glass-surface-elevated mt-8 p-5" role="region" aria-label="Confirm your class">
              <p className="text-small font-medium uppercase tracking-wide text-slate-500">3. Confirm your class</p>
              <p className="mt-2 text-body font-semibold text-slate-50">{formatOccurrenceDay(pendingRow.scheduledAt)}</p>
              <p className="text-body text-slate-100">
                {formatOccurrenceTime(pendingRow.scheduledAt)} to {formatEndTime(pendingRow.scheduledAt, creditsFor(pendingRow))}
              </p>
              <ul className="mt-3 space-y-1 text-small text-slate-400">
                <li>
                  {lengthLabel(creditsFor(pendingRow))} · 1 class, you&apos;ll have{" "}
                  {classCount(credits - creditsFor(pendingRow))} left
                </li>
                <li>Live on Discord</li>
                <li>
                  Free to cancel until{" "}
                  {new Date(new Date(pendingRow.scheduledAt).getTime() - cancellationCutoffHours * 3_600_000).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </li>
              </ul>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await handleBook(pendingRow);
                    setPendingKey(null);
                  }}
                  disabled={bookingKey !== null || credits < creditsFor(pendingRow)}
                  className="tap cta-sheen cta-fill flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bookingKey !== null && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  {bookingKey !== null ? "Booking…" : "Book this class"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingKey(null)}
                  disabled={bookingKey !== null}
                  className="tap rounded-lg px-4 py-2 text-small font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          <div ref={timesRef} className="mt-8 scroll-mt-20">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div>
                <h2 className="text-body font-semibold text-slate-100">2. Choose a time</h2>
                {selectedDateKey && (
                  <p className="mt-0.5 text-small text-slate-500">
                    {new Date(selectedDateKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {selectedDateKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateKey(null)}
                    className="tap shrink-0 text-small font-medium text-slate-500 transition hover:text-[rgb(var(--c-s-50))]"
                  >
                    Clear day
                  </button>
                )}
                {mode === "SOLO" && !reschedulingBooking && (
                  <button
                    type="button"
                    aria-pressed={multiSelect}
                    onClick={() => {
                      setMultiSelect((v) => !v);
                      setPendingKey(null);
                      setSelectedKeys(new Set());
                    }}
                    className="tap shrink-0 text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
                  >
                    {multiSelect ? "Done selecting" : "Book several"}
                  </button>
                )}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-small text-slate-500">No classes scheduled.</p>
            ) : !selectedDateKey ? null : displayRows.length === 0 ? (
              <p className="text-small text-slate-500">No open times on that day.</p>
            ) : (
              <div className="space-y-6">
                {occurrenceGroups.map((group) => (
                  <section key={group.key}>
                    <div className="glass-surface divide-y divide-ink/10 overflow-hidden">
                      {group.rows.map((row) => {
                        const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
                        const chosen = creditsFor(row);
                        // While rescheduling, the credits the old booking is
                        // still holding (client-side, nothing is actually freed
                        // until the swap commits) are added back for this check
                        // only, since the real backend check treats them the
                        // same way: freed by the same move, not double-spent.
                        const effectiveCredits = reschedulingBooking ? credits + reschedulingBooking.creditsSpent : credits;
                        const insufficientCredits = effectiveCredits < chosen;
                        const isCurrentRescheduleSlot =
                          reschedulingBooking !== null && row.scheduledAt === reschedulingBooking.scheduledAt;
                        const disabled = reschedulingBooking
                          ? row.isBooked || insufficientCredits || reschedulingKey !== null
                          : row.isBooked || insufficientCredits || bookingKey !== null || bundleSubmitting;
                        const isSelected = selectedKeys.has(key);
                        const isPending = pendingKey === key;
                        const actionClass =
                          "tap flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 py-2 text-small font-semibold transition disabled:cursor-not-allowed disabled:text-slate-600 sm:w-36 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low text-[rgb(var(--c-s-50))]";
                        return (
                          <div key={key} className="flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5">
                            {mode === "SOLO" && !reschedulingBooking && multiSelect && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(row)}
                                disabled={row.isBooked || bundleSubmitting}
                                aria-label={`Select ${formatOccurrenceDay(row.scheduledAt)} at ${formatOccurrenceTime(row.scheduledAt)}`}
                                className="h-6 w-6 shrink-0 cursor-pointer accent-[rgb(var(--signal))] disabled:cursor-not-allowed disabled:opacity-30"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-small text-slate-500">{formatOccurrenceDay(row.scheduledAt)}</p>
                              <p className="text-body font-semibold text-slate-50">
                                {formatOccurrenceTime(row.scheduledAt)} to{" "}
                                {formatEndTime(row.scheduledAt, mode === "SOLO" ? chosen : familyCreditsPerStudent)}
                              </p>
                              <p className="text-small text-slate-500">
                                {mode === "SOLO"
                                  ? lengthLabel(chosen)
                                  : `${lengthLabel(familyCreditsPerStudent)} per student`}
                                {row.isBooked && <span className="text-red-400"> · Booked</span>}
                                {isCurrentRescheduleSlot && <span className="text-[rgb(var(--c-s-50))]"> · Your current time</span>}
                              </p>
                            </div>
                            {reschedulingBooking ? (
                              <button type="button" onClick={() => handleReschedule(row)} disabled={disabled} className={actionClass}>
                                {reschedulingKey === key && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                                {reschedulingKey === key ? "Moving…" : isCurrentRescheduleSlot ? "Current" : insufficientCredits ? "Not enough classes" : "Move here"}
                              </button>
                            ) : mode === "SOLO" ? (
                              multiSelect ? null : row.isBooked ? null : insufficientCredits ? (
                                <Link href="/billing/credits" className={actionClass}>
                                  Buy classes
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingKey(isPending ? null : key)}
                                  disabled={disabled}
                                  aria-pressed={isPending}
                                  className={`${actionClass} ${isPending ? "!shadow-pressed-low" : ""}`}
                                >
                                  {isPending ? "Selected" : "Choose"}
                                </button>
                              )
                            ) : row.isBooked ? null : (
                              <button type="button" onClick={() => openFamilyBooking(row)} disabled={familySubmitting} className={actionClass}>
                                Set up family
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Everything that is not the booking itself lives in one small tab
            slider, the same sliding tabs the rest of the app uses. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1" aria-label="Credits and bookings">
          <Tabs<PanelId>
            label="Credits and bookings"
            value={panel}
            onChange={setPanel}
            items={[
              { id: "credits", label: "Classes" },
              { id: "for", label: "Booking for" },
              { id: "upcoming", label: "Upcoming", count: upcoming.length || undefined },
              { id: "past", label: "Past", count: history.length || undefined },
            ]}
          />

          {panel === "credits" && (
            <div className="glass-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-small uppercase tracking-wide text-slate-500">Extra classes</p>
                  <p className="mt-1 text-body font-semibold text-slate-50">
                    {classCount(credits)} {classWord(classCount(credits))}
                  </p>
                  <p className="mt-0.5 text-small text-slate-500">$55 per 45-minute class</p>
                </div>
                <Link
                  href="/billing/credits"
                  className={`tap inline-flex items-center rounded-lg px-4 py-2 text-small font-semibold transition ${
                    hasNoCredits
                      ? "cta-sheen cta-fill"
                      : "text-slate-200 hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  }`}
                >
                  Buy classes
                </Link>
              </div>
              {hasNoCredits && (
                <p className="mt-3 rounded-xl bg-neu-base px-3 py-2 text-small text-slate-300 shadow-pressed-low">
                  No extra classes left.
                </p>
              )}
            </div>
          )}

          {panel === "for" && <div className="glass-surface p-5">
          {/* Who is the class for. Two plain choices; "Group" is left out until it exists. */}
          <p className="text-small font-medium text-slate-400">Who is this class for?</p>
          <div className="mt-2 flex w-fit flex-wrap gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low">
            <button
              type="button"
              onClick={() => {
                setMode("SOLO");
                setPendingKey(null);
              }}
              aria-pressed={mode === "SOLO"}
              className={`tap rounded-full px-4 py-2 text-small font-medium transition ${
                mode === "SOLO" ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              Just me
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("FAMILY");
                setPendingKey(null);
                setMultiSelect(false);
                setSelectedKeys(new Set());
              }}
              aria-pressed={mode === "FAMILY"}
              className={`tap rounded-full px-4 py-2 text-small font-medium transition ${
                mode === "FAMILY" ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              Me and my family
            </button>
          </div>
          </div>}

          {panel === "upcoming" && (
            <div className="glass-surface p-5">
              {upcoming.length === 0 ? (
                <p className="text-small text-slate-500">No upcoming classes.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      cancellationCutoffHours={cancellationCutoffHours}
                      supportContactId={supportContactId}
                      cancelingId={cancelingId}
                      reschedulingBookingId={reschedulingBooking?.id ?? null}
                      onCancel={handleCancel}
                      onStartReschedule={startReschedule}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === "past" && (
            <div className="glass-surface p-5">
              {historyGroups.length === 0 ? (
                <p className="text-small text-slate-500">No past classes yet.</p>
              ) : (
                <div className="space-y-2">
                  {historyGroups.map((group, i) => (
                    <MonthGroup
                      key={group.key}
                      group={group}
                      defaultOpen={i === 0}
                      cancellationCutoffHours={cancellationCutoffHours}
                      supportContactId={supportContactId}
                      cancelingId={cancelingId}
                      reschedulingBookingId={reschedulingBooking?.id ?? null}
                      onCancel={handleCancel}
                      onStartReschedule={startReschedule}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </WideLayout>
  );
}
