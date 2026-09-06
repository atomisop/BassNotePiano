"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { bookClassAction, bookClassBundleAction, bookFamilyClassAction, checkFamilyClassAttendeesAction, cancelClassBookingAction } from "./actions";
import { BookingCalendar, dayKey } from "./BookingCalendar";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { MorphingSquare } from "@/components/ui/morphing-square";

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
}

type BookingMode = "SOLO" | "FAMILY";

const STATUS_LABEL: Record<BookingRow["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_STYLE: Record<BookingRow["status"], string> = {
  SCHEDULED: "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-400))]",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  CANCELED: "bg-slate-800 text-slate-500",
};

/** Weekday + date only — the time is shown separately as its own column. */
function formatOccurrenceDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

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
  onCancel,
}: {
  booking: BookingRow;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  onCancel: (booking: BookingRow) => void;
}) {
  const b = booking;
  const hoursUntil = (new Date(b.scheduledAt).getTime() - Date.now()) / 3_600_000;
  // Self-cancel only exists >=24h out — inside that window there's
  // no button at all (see cancelClassBooking), just a way to
  // reach support for a manual, case-by-case call.
  const cancelEligible = b.status === "SCHEDULED" && hoursUntil >= cancellationCutoffHours;
  const pastSelfServeWindow = b.status === "SCHEDULED" && hoursUntil > 0 && hoursUntil < cancellationCutoffHours;
  return (
    <div className="glass-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-100">
          {b.label ?? "Class"} — {formatDateTime(b.scheduledAt)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {b.creditsSpent} credit{b.creditsSpent === 1 ? "" : "s"}
          {b.status === "SCHEDULED" &&
            (cancelEligible
              ? ` · Cancel by ${new Date(new Date(b.scheduledAt).getTime() - cancellationCutoffHours * 3_600_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : pastSelfServeWindow
                ? " · Too close to class time to self-cancel"
                : "")}
        </p>
        {b.status === "COMPLETED" && b.attendance && (
          <p className={`mt-0.5 text-xs ${b.attendance === "PRESENT" ? "text-emerald-400" : "text-red-400"}`}>
            {b.attendance === "PRESENT" ? "Attended" : "Marked no-show — still charged, per our terms"}
          </p>
        )}
        {b.status === "CANCELED" && <p className="mt-0.5 text-xs text-emerald-400">Canceled — no credits were charged</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cancelEligible && (
          <button
            type="button"
            onClick={() => onCancel(b)}
            disabled={cancelingId === b.id}
            className="flex items-center justify-center rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelingId === b.id && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
            {cancelingId === b.id ? "Canceling…" : "Cancel"}
          </button>
        )}
        {pastSelfServeWindow && supportContactId && (
          <Link
            href={`/messages?with=${supportContactId}`}
            className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
          >
            Message support
          </Link>
        )}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[b.status]}`}>
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
  onCancel,
}: {
  group: { key: string; label: string; bookings: BookingRow[] };
  defaultOpen: boolean;
  cancellationCutoffHours: number;
  supportContactId: string | null;
  cancelingId: string | null;
  onCancel: (booking: BookingRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink/5"
      >
        <span className="text-sm font-medium text-slate-200">{group.label}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
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
              onCancel={onCancel}
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
        className="min-w-0 flex-1 glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
      />
      <span className="w-28 shrink-0 text-xs">
        {value.trim() === "" ? null : status?.checking ? (
          <span className="text-slate-500">Checking…</span>
        ) : status?.verified ? (
          <span className="flex items-center gap-1 text-emerald-400">
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
}: {
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
  const [mode, setMode] = useState<BookingMode>("SOLO");
  const [bookingKey, setBookingKey] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
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
  const [bundleSubmitting, setBundleSubmitting] = useState(false);

  // A solo booking can run shorter than the schedule window (up to
  // soloMaxCredits) — the student's own choice of how long to stay, keyed
  // the same way bookingKey/selectedKeys are.
  const [chosenCredits, setChosenCredits] = useState<Record<string, number>>({});

  // Family booking: which occurrence, and the list of attendee emails being
  // typed in. Only one family booking is composed at a time — picking a
  // different row for it replaces the in-progress one rather than stacking.
  const [familyRowKey, setFamilyRowKey] = useState<string | null>(null);
  const [familyEmails, setFamilyEmails] = useState<string[]>(["", ""]);
  const [familyChecks, setFamilyChecks] = useState<Record<string, { checking: boolean; found: boolean; verified: boolean; name: string | null }>>({});
  const [familySubmitting, setFamilySubmitting] = useState(false);

  /** Defaults to the full window (capped at soloMaxCredits) when affordable, otherwise whatever's actually affordable right now. */
  function creditsFor(row: OccurrenceRow): number {
    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
    const maxForRow = Math.min(row.creditCost, soloMaxCredits);
    return chosenCredits[key] ?? Math.max(1, Math.min(maxForRow, credits));
  }

  function setCreditsFor(row: OccurrenceRow, value: number) {
    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
    setChosenCredits((prev) => ({ ...prev, [key]: value }));
  }

  const displayRows = useMemo(
    () => (selectedDateKey ? rows.filter((r) => dayKey(r.occurrenceDateMs) === selectedDateKey) : rows),
    [rows, selectedDateKey],
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.has(`${r.scheduleId}:${r.occurrenceDateMs}:${r.chunkIndex}`)),
    [rows, selectedKeys],
  );
  const selectedCreditTotal = useMemo(
    () => selectedRows.reduce((sum, r) => sum + creditsFor(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRows, chosenCredits],
  );
  const selectedExceedsBalance = selectedCreditTotal > credits;

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
    const result = await bookClassAction(row.scheduleId, row.occurrenceDateMs, row.chunkIndex, chosen);
    setBookingKey(null);

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
    setSuccess("Booked — you're on the schedule.");
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
    const result = await bookClassBundleAction(selections);
    setBundleSubmitting(false);
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
      setSuccess(`Booked ${succeeded.length} class${succeeded.length === 1 ? "" : "es"} — you're on the schedule.`);
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
    const result = await cancelClassBookingAction(booking.id);
    setCancelingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: "CANCELED", refunded: true } : b)));
    // Frees the reservation, not a refund of anything actually charged —
    // nothing was charged yet (see cancelClassBookingAction).
    setCredits((c) => c + booking.creditsSpent);
    setSuccess("Canceled — no credits were charged.");
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

  async function checkFamilyEmail(email: string) {
    setFamilyChecks((prev) => ({ ...prev, [email]: { checking: true, found: false, verified: false, name: null } }));
    const results = await checkFamilyClassAttendeesAction([email]);
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
    const result = await bookFamilyClassAction(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex, familyEmailsTrimmed);
    setFamilySubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    markRowBooked(familyRow.scheduleId, familyRow.occurrenceDateMs, familyRow.chunkIndex);
    setFamilyRowKey(null);
    setFamilyEmails(["", ""]);
    setFamilyChecks({});
    setSuccess(`Booked for ${familyEmailsTrimmed.length} students — ${familyCreditsPerStudent} credits reserved from each.`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Live Lessons</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Book a class</h1>
      <p className="mt-2 text-sm text-slate-500">
        Live on Discord · 1 credit = 30 minutes · charged when attendance is taken, present or not.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 glass-surface p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Available to book</p>
          <p className="mt-1 font-serif text-2xl text-slate-50">
            {credits} credit{credits === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/billing/lessons"
          className="rounded-lg border border-ink/10 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
        >
          Buy credits
        </Link>
      </div>

      {/* Mode picker — same segmented-pill pattern used elsewhere in the app. Group is listed but disabled, matching the "coming soon" treatment already used for other not-yet-available options. */}
      <div className="mt-6 flex flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
        <button
          type="button"
          onClick={() => setMode("SOLO")}
          aria-pressed={mode === "SOLO"}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            mode === "SOLO" ? "bg-[rgb(var(--c-a-500))] text-white" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          One-on-one
        </button>
        <button
          type="button"
          onClick={() => setMode("FAMILY")}
          aria-pressed={mode === "FAMILY"}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            mode === "FAMILY" ? "bg-[rgb(var(--c-a-500))] text-white" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          Family
        </button>
        <span
          title="Group classes are coming soon"
          className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-slate-600"
        >
          Group
          <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {mode === "SOLO"
          ? `One-on-one time with the teacher — pick 1 or 2 credits (up to an hour) per class.`
          : `2+ verified students from the same family, taught together — ${familyCreditsPerStudent} credits each, regardless of how many join.`}
      </p>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-400">{success}</p>}

      {rows.length > 0 && (
        <div className="mt-8">
          <BookingCalendar occurrences={rows} selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
        </div>
      )}

      {mode === "SOLO" && selectedKeys.size > 0 && (
        <div className="glass-surface-elevated mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-slate-100">
              {selectedRows.length} class{selectedRows.length === 1 ? "" : "es"} selected
            </p>
            <p className={`mt-0.5 text-xs ${selectedExceedsBalance ? "text-red-400" : "text-slate-500"}`}>
              {selectedCreditTotal} credit{selectedCreditTotal === 1 ? "" : "s"} total
              {selectedExceedsBalance && ` — you only have ${credits}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              disabled={bundleSubmitting}
              className="text-xs font-medium text-slate-500 transition hover:text-slate-300 disabled:pointer-events-none disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBookBundle}
              disabled={bundleSubmitting || selectedExceedsBalance}
              className="cta-sheen cta-fill flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bundleSubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {bundleSubmitting ? "Booking…" : `Book ${selectedRows.length} class${selectedRows.length === 1 ? "" : "es"}`}
            </button>
          </div>
        </div>
      )}

      {mode === "FAMILY" && familyRow && (
        <div className="glass-surface-elevated mt-8 p-5">
          <p className="text-sm font-medium text-slate-100">
            Family booking — {formatOccurrenceDay(familyRow.scheduledAt)} at {formatOccurrenceTime(familyRow.scheduledAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Every student listed must already have a verified account. {familyCreditsPerStudent} credits will be reserved from each.
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
              className="text-xs font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
            >
              + Add another student
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFamilyRowKey(null)}
                disabled={familySubmitting}
                className="text-xs font-medium text-slate-500 transition hover:text-slate-300 disabled:pointer-events-none disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBookFamily}
                disabled={!familyAllVerified || familySubmitting}
                className="cta-sheen cta-fill flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {familySubmitting && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {familySubmitting ? "Booking…" : `Book for ${familyEmailsTrimmed.length || familyMinAttendees} students`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-lg text-slate-100">
            {selectedDateKey
              ? `Classes on ${new Date(selectedDateKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}`
              : "Upcoming classes"}
          </h2>
          {selectedDateKey && (
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="shrink-0 text-xs font-medium text-slate-500 transition hover:text-[rgb(var(--c-s-50))]"
            >
              Show all
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">No classes scheduled right now — check back soon.</p>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-slate-600">No open slots on that day — someone else just took it. Try another date.</p>
        ) : (
          /* One card per week with divided rows, rather than a stack of
             separate floating cards: seven identical shadowed pills read as
             seven equally-urgent things. The week heading gives the eye
             somewhere to land, and the Book control is a quiet outline —
             repeating a solid accent fill down the page made the accent
             mean nothing. */
          <div className="space-y-6">
            {occurrenceGroups.map((group) => (
              <section key={group.key}>
                <h3 className="eyebrow mb-2">{group.label}</h3>
                <div className="glass-surface divide-y divide-ink/10 overflow-hidden">
                  {group.rows.map((row) => {
                    const key = `${row.scheduleId}:${row.occurrenceDateMs}:${row.chunkIndex}`;
                    const chosen = creditsFor(row);
                    const insufficientCredits = credits < chosen;
                    const maxForRow = Math.min(row.creditCost, soloMaxCredits);
                    const disabled = row.isBooked || insufficientCredits || bookingKey !== null || bundleSubmitting;
                    const isSelected = selectedKeys.has(key);
                    // Every duration option shares row.scheduledAt as its
                    // start — this offers *when it ends*, capped at
                    // soloMaxCredits regardless of how long the underlying
                    // window is.
                    const durationOptions = Array.from({ length: maxForRow }, (_, i) => i + 1);
                    return (
                      <div key={key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                        {mode === "SOLO" && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(row)}
                            disabled={row.isBooked || bundleSubmitting}
                            aria-label={`Select ${formatOccurrenceDay(row.scheduledAt)} at ${formatOccurrenceTime(row.scheduledAt)} for bundle booking`}
                            className="h-4 w-4 shrink-0 self-start rounded border-ink/20 bg-transparent text-[rgb(var(--c-s-50))] accent-[rgb(var(--c-s-50))] focus:ring-[rgb(var(--c-s-50)/0.5)] disabled:cursor-not-allowed disabled:opacity-30 sm:self-auto"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-100">{formatOccurrenceDay(row.scheduledAt)}</p>
                          {mode === "SOLO" ? (
                            <>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatOccurrenceTime(row.scheduledAt)}–{formatEndTime(row.scheduledAt, chosen)} ·{" "}
                                {chosen} credit{chosen === 1 ? "" : "s"}
                              </p>
                              {maxForRow > 1 && (
                                <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                                  Stay until
                                  <select
                                    value={chosen}
                                    onChange={(e) => setCreditsFor(row, Number(e.target.value))}
                                    disabled={bookingKey !== null || bundleSubmitting}
                                    className="glass-surface-subtle rounded-md px-2 py-1 text-xs text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {durationOptions.map((n) => (
                                      <option key={n} value={n}>
                                        {formatEndTime(row.scheduledAt, n)} ({n} credit{n === 1 ? "" : "s"})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                            </>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatOccurrenceTime(row.scheduledAt)}–{formatEndTime(row.scheduledAt, familyCreditsPerStudent)} ·{" "}
                              {familyCreditsPerStudent} credits per student
                            </p>
                          )}
                        </div>
                        <p className="shrink-0 text-xs tabular-nums text-slate-500 sm:w-20 sm:text-right">
                          {row.isBooked ? <span className="text-red-400">Booked</span> : "Available"}
                        </p>
                        {mode === "SOLO" ? (
                          <button
                            type="button"
                            onClick={() => handleBook(row)}
                            disabled={disabled}
                            className="flex shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--c-s-50)/0.4)] px-4 py-2 text-xs font-semibold text-[rgb(var(--c-s-50))] transition hover:border-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)] disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate-600 disabled:hover:bg-transparent sm:w-36"
                          >
                            {bookingKey === key && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                            {bookingKey === key ? "Booking…" : row.isBooked ? "Booked" : insufficientCredits ? "Not enough credits" : "Book"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openFamilyBooking(row)}
                            disabled={row.isBooked || familySubmitting}
                            className="shrink-0 rounded-lg border border-[rgb(var(--c-s-50)/0.4)] px-4 py-2 text-xs font-semibold text-[rgb(var(--c-s-50))] transition hover:border-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)] disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate-600 disabled:hover:bg-transparent sm:w-36"
                          >
                            {row.isBooked ? "Booked" : "Set up family"}
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

      <div className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-slate-100">Upcoming bookings</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-600">No upcoming bookings.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                cancellationCutoffHours={cancellationCutoffHours}
                supportContactId={supportContactId}
                cancelingId={cancelingId}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg text-slate-100">History</h2>
          {history.length > 0 && (
            <span className="text-xs text-slate-600">
              {history.length} past booking{history.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {historyGroups.length === 0 ? (
          <p className="text-sm text-slate-600">No past bookings yet.</p>
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
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
